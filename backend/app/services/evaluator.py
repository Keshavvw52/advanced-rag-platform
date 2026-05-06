import json
import uuid
import logging
from pathlib import Path
from typing import Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_groq import ChatGroq

from app.config import get_settings
from app.models.schemas import (
    EvaluationMetrics, EvaluationResponse, EvaluationRequest,
    BatchEvaluationResponse, StrategyEvalSummary, RetrievedChunk,
    RetrievalStrategy, QueryRequest
)
from app.services.rag_chain import run_rag_pipeline

logger = logging.getLogger(__name__)
settings = get_settings()


def get_llm() -> ChatGroq:
    return ChatGroq(
        api_key=settings.GROQ_API_KEY,
        model=settings.GROQ_MODEL,
        temperature=0.0,
        max_tokens=1024,
    )


# ─── Faithfulness Evaluation ──────────────────────────────────────────────────

FAITHFULNESS_PROMPT = ChatPromptTemplate.from_template(
    """You are evaluating whether an AI answer is faithful to the provided context.
Faithfulness means: every claim in the answer is supported by the context.

Context:
{context}

Answer to evaluate:
{answer}

Instructions:
1. Extract each factual claim from the answer
2. For each claim, check if it's supported by the context
3. Calculate: faithfulness = supported_claims / total_claims

Respond in this exact JSON format:
{{
  "total_claims": <number>,
  "supported_claims": <number>,
  "faithfulness_score": <0.0 to 1.0>,
  "unsupported_claims": ["claim1", "claim2"],
  "reasoning": "brief explanation"
}}

JSON response only, no other text:"""
)


async def evaluate_faithfulness(
    answer: str,
    context_chunks: list[RetrievedChunk],
) -> tuple[float, dict]:
    """
    Evaluate whether the answer is faithful to the retrieved context.
    Returns (score, details).
    """
    if not answer or not context_chunks:
        return 0.0, {"error": "No answer or context provided"}

    context = "\n\n".join(c.content for c in context_chunks[:5])
    llm = get_llm()
    chain = FAITHFULNESS_PROMPT | llm | StrOutputParser()

    try:
        result = await chain.ainvoke({"context": context, "answer": answer})
        # Strip markdown code fences if present
        result = result.strip().strip("```json").strip("```").strip()
        data = json.loads(result)
        score = float(data.get("faithfulness_score", 0.0))
        return min(1.0, max(0.0, score)), data
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Faithfulness eval parsing failed: {e}")
        return 0.5, {"error": str(e), "raw": result[:200] if 'result' in dir() else ""}


# ─── Answer Relevancy Evaluation ─────────────────────────────────────────────

RELEVANCY_PROMPT = ChatPromptTemplate.from_template(
    """You are evaluating whether an AI answer is relevant to the original question.

Original question: {question}

Generated answer: {answer}

Instructions:
Evaluate relevancy on two dimensions:
1. Does the answer address the question being asked?
2. Is the answer free from irrelevant information?

Respond in this exact JSON format:
{{
  "relevancy_score": <0.0 to 1.0>,
  "addresses_question": <true or false>,
  "has_irrelevant_content": <true or false>,
  "reasoning": "brief explanation"
}}

JSON response only, no other text:"""
)


async def evaluate_answer_relevancy(
    question: str,
    answer: str,
) -> tuple[float, dict]:
    """
    Evaluate whether the answer is relevant to the original question.
    Returns (score, details).
    """
    if not question or not answer:
        return 0.0, {"error": "Missing question or answer"}

    llm = get_llm()
    chain = RELEVANCY_PROMPT | llm | StrOutputParser()

    try:
        result = await chain.ainvoke({"question": question, "answer": answer})
        result = result.strip().strip("```json").strip("```").strip()
        data = json.loads(result)
        score = float(data.get("relevancy_score", 0.0))
        return min(1.0, max(0.0, score)), data
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Relevancy eval parsing failed: {e}")
        return 0.5, {"error": str(e)}


# ─── Context Precision ────────────────────────────────────────────────────────

CONTEXT_PRECISION_PROMPT = ChatPromptTemplate.from_template(
    """You are evaluating whether retrieved context chunks are relevant to answering a question.

Question: {question}

Retrieved chunks (in order):
{chunks_text}

For each chunk, determine if it is relevant (contains information needed to answer the question).
Respond in this exact JSON format:
{{
  "chunk_relevance": [true, false, true, ...],
  "context_precision_score": <0.0 to 1.0>,
  "reasoning": "brief explanation"
}}

Context precision is rank-aware: relevant chunks at rank 1 contribute more than at rank 5.
JSON response only:"""
)


async def evaluate_context_precision(
    question: str,
    chunks: list[RetrievedChunk],
) -> tuple[float, dict]:
    """
    Evaluate whether retrieved chunks are precise/relevant.
    Rank-aware: relevant chunks should appear higher in ranking.
    """
    if not chunks:
        return 0.0, {"error": "No chunks provided"}

    chunks_text = "\n\n".join(
        f"Chunk {i+1}: {c.content[:200]}..."
        for i, c in enumerate(chunks[:5])
    )
    llm = get_llm()
    chain = CONTEXT_PRECISION_PROMPT | llm | StrOutputParser()

    try:
        result = await chain.ainvoke({
            "question": question,
            "chunks_text": chunks_text,
        })
        result = result.strip().strip("```json").strip("```").strip()
        data = json.loads(result)

        # Calculate rank-aware precision manually if not provided
        relevance = data.get("chunk_relevance", [])
        if relevance and "context_precision_score" not in data:
            # Average precision calculation
            precision_at_k = []
            relevant_seen = 0
            for k, is_rel in enumerate(relevance, 1):
                if is_rel:
                    relevant_seen += 1
                    precision_at_k.append(relevant_seen / k)
            score = sum(precision_at_k) / len(precision_at_k) if precision_at_k else 0.0
            data["context_precision_score"] = score

        score = float(data.get("context_precision_score", 0.0))
        return min(1.0, max(0.0, score)), data
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Context precision eval failed: {e}")
        return 0.5, {"error": str(e)}


# ─── Context Recall ───────────────────────────────────────────────────────────

CONTEXT_RECALL_PROMPT = ChatPromptTemplate.from_template(
    """You are evaluating whether the retrieved context contains all information needed 
to answer a question, given a reference answer.

Question: {question}
Reference answer: {reference_answer}
Retrieved context: {context}

Does the retrieved context contain all the information needed to construct the reference answer?

Respond in this exact JSON format:
{{
  "recall_score": <0.0 to 1.0>,
  "covered_aspects": ["aspect1", "aspect2"],
  "missing_aspects": ["aspect3"],
  "reasoning": "brief explanation"
}}

JSON response only:"""
)


async def evaluate_context_recall(
    question: str,
    reference_answer: str,
    chunks: list[RetrievedChunk],
) -> tuple[float, dict]:
    """
    Evaluate whether the retrieved context covers all aspects of the reference answer.
    """
    if not reference_answer or not chunks:
        return 0.0, {"error": "Missing reference answer or chunks"}

    context = "\n\n".join(c.content for c in chunks[:5])
    llm = get_llm()
    chain = CONTEXT_RECALL_PROMPT | llm | StrOutputParser()

    try:
        result = await chain.ainvoke({
            "question": question,
            "reference_answer": reference_answer,
            "context": context[:3000],
        })
        result = result.strip().strip("```json").strip("```").strip()
        data = json.loads(result)
        score = float(data.get("recall_score", 0.0))
        return min(1.0, max(0.0, score)), data
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Context recall eval failed: {e}")
        return 0.5, {"error": str(e)}


# ─── Full Evaluation Runner ───────────────────────────────────────────────────

async def evaluate_single(
    question: str,
    reference_answer: str,
    strategy: RetrievalStrategy,
    filters=None,
) -> EvaluationResponse:
    """
    Run full evaluation on a single Q&A pair.
    Runs RAG pipeline then evaluates all 4 metrics.
    """
    eval_id = str(uuid.uuid4())

    # Run RAG pipeline
    request = QueryRequest(
        query=question,
        strategy=strategy,
        filters=filters,
        top_k=5,
    )
    rag_result = await run_rag_pipeline(request)
    answer = rag_result.answer
    chunks = rag_result.retrieved_chunks

    # Evaluate all metrics in parallel
    import asyncio
    (
        (faith_score, faith_details),
        (rel_score, rel_details),
        (prec_score, prec_details),
        (recall_score, recall_details),
    ) = await asyncio.gather(
        evaluate_faithfulness(answer, chunks),
        evaluate_answer_relevancy(question, answer),
        evaluate_context_precision(question, chunks),
        evaluate_context_recall(question, reference_answer, chunks),
    )

    avg_score = (faith_score + rel_score + prec_score + recall_score) / 4

    return EvaluationResponse(
        id=eval_id,
        question=question,
        reference_answer=reference_answer,
        generated_answer=answer,
        strategy=strategy.value,
        metrics=EvaluationMetrics(
            faithfulness=round(faith_score, 4),
            answer_relevancy=round(rel_score, 4),
            context_precision=round(prec_score, 4),
            context_recall=round(recall_score, 4),
            average=round(avg_score, 4),
        ),
        retrieved_chunks=chunks,
        details={
            "faithfulness": faith_details,
            "relevancy": rel_details,
            "precision": prec_details,
            "recall": recall_details,
        },
    )


async def load_eval_dataset(path: str = None) -> list[dict]:
    """Load evaluation Q&A pairs from JSON file."""
    path = path or settings.EVAL_DATASET_PATH
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return data.get("questions", data if isinstance(data, list) else [])
    except FileNotFoundError:
        logger.warning(f"Eval dataset not found at {path}, using empty dataset")
        return []
    except Exception as e:
        logger.error(f"Failed to load eval dataset: {e}")
        return []


async def run_batch_evaluation(
    strategies: list[RetrievalStrategy],
    dataset_path: str = None,
) -> BatchEvaluationResponse:
    """
    Run full evaluation dataset against multiple strategies.
    Returns comparison table with per-strategy metrics.
    """
    import asyncio

    batch_id = str(uuid.uuid4())
    dataset = await load_eval_dataset(dataset_path)

    if not dataset:
        logger.error("No evaluation dataset available")
        raise ValueError("Evaluation dataset is empty")

    all_results: list[EvaluationResponse] = []
    strategy_metrics: dict[str, list[EvaluationMetrics]] = {s.value: [] for s in strategies}

    for item in dataset:
        question = item.get("question", "")
        reference = item.get("reference_answer", item.get("answer", ""))
        if not question:
            continue

        for strategy in strategies:
            try:
                result = await evaluate_single(question, reference, strategy)
                result_with_batch = result.model_copy()
                all_results.append(result_with_batch)
                strategy_metrics[strategy.value].append(result.metrics)
                logger.info(f"Eval [{strategy.value}] '{question[:40]}' -> {result.metrics.average:.3f}")
            except Exception as e:
                logger.error(f"Eval failed for '{question[:40]}' with {strategy.value}: {e}")

    # Build strategy summaries
    summaries = []
    for strategy_name, metrics_list in strategy_metrics.items():
        if not metrics_list:
            continue
        n = len(metrics_list)
        summaries.append(StrategyEvalSummary(
            strategy=strategy_name,
            avg_faithfulness=round(sum(m.faithfulness for m in metrics_list) / n, 4),
            avg_relevancy=round(sum(m.answer_relevancy for m in metrics_list) / n, 4),
            avg_precision=round(sum(m.context_precision for m in metrics_list) / n, 4),
            avg_recall=round(sum(m.context_recall for m in metrics_list) / n, 4),
            avg_overall=round(sum(m.average for m in metrics_list) / n, 4),
            num_questions=n,
        ))

    leaderboard = sorted(summaries, key=lambda s: s.avg_overall, reverse=True)

    return BatchEvaluationResponse(
        batch_id=batch_id,
        strategies_evaluated=[s.value for s in strategies],
        summaries=summaries,
        per_question_results=all_results,
        leaderboard=leaderboard,
    )