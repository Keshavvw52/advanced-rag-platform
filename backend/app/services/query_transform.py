
import logging
from typing import Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_groq import ChatGroq

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def get_llm(temperature: float = 0.0) -> ChatGroq:
    """Instantiate Groq LLM (llama3-70b-8192)."""
    return ChatGroq(
        api_key=settings.GROQ_API_KEY,
        model=settings.GROQ_MODEL,
        temperature=temperature,
        max_tokens=settings.LLM_MAX_TOKENS,
    )


# ─── Multi-Query Expansion ────────────────────────────────────────────────────

MULTI_QUERY_PROMPT = ChatPromptTemplate.from_template(
    """You are an AI assistant helping improve document retrieval.
Given a user question, generate {n_queries} different phrasings of the same question.
These should cover different angles and vocabulary while asking for the same information.

Original question: {question}

Output ONLY the {n_queries} questions, one per line, without numbering or bullet points.
"""
)


async def multi_query_expansion(
    query: str,
    n_queries: int = 3,
) -> list[str]:
    """
    Generate multiple alternative phrasings of a query using the LLM.
    Returns list of alternative queries (not including the original).
    """
    llm = get_llm(temperature=0.3)
    chain = MULTI_QUERY_PROMPT | llm | StrOutputParser()

    try:
        result = await chain.ainvoke({"question": query, "n_queries": n_queries})
        queries = [q.strip() for q in result.strip().split("\n") if q.strip()]
        # Deduplicate and limit
        queries = list(dict.fromkeys(queries))[:n_queries]
        logger.info(f"Multi-query expansion: {len(queries)} variants generated")
        return queries
    except Exception as e:
        logger.error(f"Multi-query expansion failed: {e}")
        return []


# ─── HyDE (Hypothetical Document Embeddings) ──────────────────────────────────

HYDE_PROMPT = ChatPromptTemplate.from_template(
    """You are a helpful assistant. Given a question, write a short passage 
(2-3 paragraphs) that would directly answer this question if found in a document.
Write it as if you are writing an excerpt from a document that contains the answer.
Be specific and detailed.

Question: {question}

Hypothetical document passage:"""
)


async def generate_hypothetical_document(query: str) -> str:
    """
    Generate a hypothetical answer document for HyDE retrieval.
    The hypothesis is then embedded and used for similarity search instead of the query.
    """
    llm = get_llm(temperature=0.3)
    chain = HYDE_PROMPT | llm | StrOutputParser()

    try:
        hypothesis = await chain.ainvoke({"question": query})
        logger.info(f"HyDE: Generated {len(hypothesis.split())} word hypothesis")
        return hypothesis.strip()
    except Exception as e:
        logger.error(f"HyDE generation failed: {e}")
        return query  # fallback to original query


# ─── Query Decomposition ──────────────────────────────────────────────────────

DECOMPOSE_PROMPT = ChatPromptTemplate.from_template(
    """You are an expert at breaking down complex questions into simpler sub-questions.
Given a complex question, decompose it into 2-4 specific, atomic sub-questions that together 
cover all aspects of the original question.

Complex question: {question}

Output ONLY the sub-questions, one per line, without numbering or bullets.
If the question is simple and doesn't need decomposition, output it as-is on a single line.
"""
)

DECOMPOSE_SYNTHESIS_PROMPT = ChatPromptTemplate.from_template(
    """You are a helpful assistant. Given the following sub-questions and their retrieved context,
synthesize a comprehensive answer to the original question.

Original question: {original_question}

Sub-questions and context:
{sub_contexts}

Provide a clear, comprehensive answer that addresses the original question completely.
"""
)


async def decompose_query(query: str) -> list[str]:
    """
    Decompose a complex query into simpler sub-questions.
    Returns list of sub-questions.
    """
    llm = get_llm(temperature=0.1)
    chain = DECOMPOSE_PROMPT | llm | StrOutputParser()

    try:
        result = await chain.ainvoke({"question": query})
        sub_questions = [q.strip() for q in result.strip().split("\n") if q.strip()]
        sub_questions = [q for q in sub_questions if len(q) > 10]  # filter empties
        logger.info(f"Query decomposed into {len(sub_questions)} sub-questions")
        return sub_questions or [query]
    except Exception as e:
        logger.error(f"Query decomposition failed: {e}")
        return [query]


# ─── Step-Back Prompting ──────────────────────────────────────────────────────

STEP_BACK_PROMPT = ChatPromptTemplate.from_template(
    """You are an expert at information retrieval.
Given a specific question, generate a more general "step-back" version that would 
retrieve broader context to help answer the specific question.

For example:
- Specific: "What was Apple's revenue in Q3 2024?" 
- Step-back: "What are Apple's financial performance metrics?"

Specific question: {question}

Output ONLY the step-back question, nothing else.
"""
)


async def step_back_query(query: str) -> str:
    """
    Generate a more general step-back version of the query.
    Helps retrieve broader context that contains the specific answer.
    """
    llm = get_llm(temperature=0.1)
    chain = STEP_BACK_PROMPT | llm | StrOutputParser()

    try:
        step_back = await chain.ainvoke({"question": query})
        logger.info(f"Step-back: '{query[:50]}...' -> '{step_back.strip()[:50]}...'")
        return step_back.strip()
    except Exception as e:
        logger.error(f"Step-back generation failed: {e}")
        return query


# ─── Transform Router ─────────────────────────────────────────────────────────

async def transform_query(
    query: str,
    strategy: str,
    n_multi_queries: int = 3,
) -> dict:
    """
    Apply query transformation based on selected strategy.
    Returns dict with transformed queries and metadata.
    """
    result = {
        "original_query": query,
        "strategy": strategy,
        "transformed_queries": [],
        "hypothesis": None,
        "sub_questions": None,
        "step_back_query": None,
    }

    if strategy == "multi_query":
        variants = await multi_query_expansion(query, n_multi_queries)
        result["transformed_queries"] = [query] + variants  # include original

    elif strategy == "hyde":
        hypothesis = await generate_hypothetical_document(query)
        result["hypothesis"] = hypothesis
        result["transformed_queries"] = [hypothesis]  # search with hypothesis

    elif strategy == "decomposition":
        sub_questions = await decompose_query(query)
        result["sub_questions"] = sub_questions
        result["transformed_queries"] = sub_questions

    elif strategy == "step_back":
        sb_query = await step_back_query(query)
        result["step_back_query"] = sb_query
        result["transformed_queries"] = [query, sb_query]  # search both

    else:
        # No transformation for basic strategies
        result["transformed_queries"] = [query]

    return result