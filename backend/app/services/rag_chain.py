"""
RAG chains built with LangChain LCEL (LangChain Expression Language).
Composable, declarative chains for all retrieval strategies.
LCEL enables: streaming, async, parallel execution, tracing.
"""
import uuid
import time
import logging
import asyncio
from typing import AsyncIterator, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain_groq import ChatGroq

from app.config import get_settings
from app.models.schemas import (
    QueryRequest, QueryResponse, RetrievedChunk,
    MetadataFilter, RetrievalStrategy
)
from app.services.retrieval import (
    vector_search, hybrid_search, parent_child_search,
    multi_query_search, scored_chunks_to_schema, ScoredChunk
)
from app.services.reranker import rerank_chunks, compute_rank_changes
from app.services.query_transform import transform_query
from app.services.pipeline_tracer import PipelineTracer

logger = logging.getLogger(__name__)
settings = get_settings()


# ─── RAG Prompt ───────────────────────────────────────────────────────────────

RAG_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a helpful AI assistant. Answer the user's question using ONLY 
the provided context. If the context doesn't contain enough information to answer fully, 
say so clearly. Do not make up information not present in the context.

Always cite the source when possible using the format [Source: filename, Page: N].

Context:
{context}"""),
    ("human", "{question}"),
])


def get_llm() -> ChatGroq:
    """Instantiate the Groq LLM."""
    return ChatGroq(
        api_key=settings.GROQ_API_KEY,
        model=settings.GROQ_MODEL,
        temperature=settings.LLM_TEMPERATURE,
        max_tokens=settings.LLM_MAX_TOKENS,
    )


# ─── Context Assembly ─────────────────────────────────────────────────────────

def assemble_context(chunks: list[RetrievedChunk]) -> str:
    """
    Assemble retrieved chunks into a structured context string.
    Each chunk is clearly delimited with its source metadata.
    """
    parts = []
    for i, chunk in enumerate(chunks, 1):
        source_info = f"Source: {chunk.source or 'Unknown'}"
        if chunk.page_number:
            source_info += f", Page: {chunk.page_number}"
        if chunk.section_header:
            source_info += f", Section: {chunk.section_header}"

        parts.append(f"[Chunk {i} - {source_info}]\n{chunk.content}")

    return "\n\n---\n\n".join(parts)


def build_prompt_text(context: str, question: str) -> str:
    """Build the full prompt string for transparency display."""
    messages = RAG_PROMPT.format_messages(context=context, question=question)
    return "\n\n".join(f"[{m.type.upper()}]: {m.content}" for m in messages)


# ─── Token Estimation ─────────────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return max(1, len(text) // 4)


# ─── Core RAG Pipeline ────────────────────────────────────────────────────────

async def run_rag_pipeline(
    request: QueryRequest,
) -> QueryResponse:
    """
    Main RAG pipeline orchestrator.
    Selects retrieval strategy, applies transformations, generates answer.
    Records full pipeline trace for transparency.
    """
    query_id = str(uuid.uuid4())
    tracer = PipelineTracer(
        query_id=query_id,
        original_query=request.query,
        strategy=request.strategy.value,
    )

    # ── Step 1: Query Transformation ──
    async with tracer.timed_step(
        "Query Transformation",
        f"Applying {request.strategy.value} transformation",
        input_data=request.query,
    ) as step:
        transform_result = await transform_query(request.query, request.strategy.value)
        queries_to_run = transform_result.get("transformed_queries", [request.query])
        tracer.set_transformed_queries(queries_to_run)
        step["output"] = {
            "original": request.query,
            "transformed": queries_to_run,
            "hypothesis": transform_result.get("hypothesis"),
            "sub_questions": transform_result.get("sub_questions"),
        }

    # ── Step 2: Retrieval ──
    async with tracer.timed_step(
        "Document Retrieval",
        f"Retrieving top-{settings.RETRIEVAL_TOP_K} chunks using {request.strategy.value}",
        input_data=queries_to_run,
    ) as step:
        raw_chunks = await _dispatch_retrieval(
            request.strategy.value,
            queries_to_run,
            request.top_k,
            request.filters,
            request.semantic_weight,
        )
        retrieved_schema = scored_chunks_to_schema(raw_chunks)
        tracer.set_retrieved_chunks(retrieved_schema)
        step["output"] = {
            "num_chunks": len(raw_chunks),
            "top_scores": [round(c.similarity_score, 4) for c in raw_chunks[:5]],
        }

    # ── Step 3: Reranking (if applicable) ──
    final_chunks = retrieved_schema
    if request.strategy == RetrievalStrategy.HYBRID_RERANK and raw_chunks:
        async with tracer.timed_step(
            "Cross-Encoder Reranking",
            f"Reranking top-{len(raw_chunks)} chunks down to top-{request.top_k}",
            input_data={"query": request.query, "num_chunks": len(raw_chunks)},
        ) as step:
            reranked_raw = await rerank_chunks(
                request.query, raw_chunks, top_k=request.top_k
            )
            rank_changes = compute_rank_changes(raw_chunks, reranked_raw)
            reranked_schema = scored_chunks_to_schema(reranked_raw)
            tracer.set_reranked_chunks(reranked_schema)
            final_chunks = reranked_schema
            step["output"] = {
                "rank_changes": rank_changes[:5],
                "top_rerank_scores": [round(c.rerank_score, 4) for c in reranked_raw[:5]],
            }

    # ── Step 4: Context Assembly ──
    async with tracer.timed_step(
        "Context Assembly",
        f"Assembling context from {len(final_chunks)} chunks",
    ) as step:
        top_chunks = final_chunks[:request.top_k]
        context = assemble_context(top_chunks)
        prompt_text = build_prompt_text(context, request.query)
        tracer.set_context(context, prompt_text)
        input_tokens = estimate_tokens(prompt_text)
        step["output"] = {
            "context_length": len(context),
            "num_chunks": len(top_chunks),
            "estimated_input_tokens": input_tokens,
        }

    # ── Step 5: LLM Generation ──
    async with tracer.timed_step(
        "LLM Generation",
        f"Generating answer with {settings.GROQ_MODEL}",
        input_data={"query": request.query, "context_chunks": len(top_chunks)},
    ) as step:
        llm = get_llm()
        # LCEL chain: prompt | llm | output parser
        chain = RAG_PROMPT | llm | StrOutputParser()
        answer = await chain.ainvoke({
            "context": context,
            "question": request.query,
        })
        output_tokens = estimate_tokens(answer)
        tracer.set_token_counts(input_tokens, output_tokens)
        step["output"] = {
            "answer_length": len(answer),
            "estimated_output_tokens": output_tokens,
        }

    # ── Build final trace ──
    total_latency = (time.time() - tracer.start_time) * 1000
    pipeline_trace = tracer.build_trace()

    return QueryResponse(
        query_id=query_id,
        query=request.query,
        answer=answer,
        strategy=request.strategy.value,
        retrieved_chunks=final_chunks,
        pipeline_trace=pipeline_trace,
        latency_ms=round(total_latency, 2),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


async def _dispatch_retrieval(
    strategy: str,
    queries: list[str],
    top_k: int,
    filters: Optional[MetadataFilter],
    semantic_weight: float,
) -> list[ScoredChunk]:
    """Route to the appropriate retrieval function based on strategy."""

    primary_query = queries[0] if queries else ""

    if strategy == "basic_vector":
        return await vector_search(primary_query, top_k=settings.RETRIEVAL_TOP_K, filters=filters)

    elif strategy in ("hybrid", "hybrid_rerank"):
        return await hybrid_search(
            primary_query,
            top_k=settings.RETRIEVAL_TOP_K,
            filters=filters,
            semantic_weight=semantic_weight,
        )

    elif strategy == "parent_child":
        return await parent_child_search(primary_query, top_k=settings.RETRIEVAL_TOP_K, filters=filters)

    elif strategy == "multi_query":
        return await multi_query_search(queries, top_k=settings.RETRIEVAL_TOP_K, filters=filters)

    elif strategy == "hyde":
        # For HyDE: queries[0] is the hypothesis text
        hypothesis = queries[0] if queries else primary_query
        return await vector_search(hypothesis, top_k=settings.RETRIEVAL_TOP_K, filters=filters)

    elif strategy == "decomposition":
        # Retrieve for each sub-question, merge results
        return await multi_query_search(queries, top_k=settings.RETRIEVAL_TOP_K, filters=filters)

    else:
        logger.warning(f"Unknown strategy: {strategy}, falling back to hybrid")
        return await hybrid_search(primary_query, top_k=settings.RETRIEVAL_TOP_K, filters=filters)


# ─── Streaming RAG Pipeline ───────────────────────────────────────────────────

async def stream_rag_pipeline(request: QueryRequest) -> AsyncIterator[str]:
    """
    Streaming version of the RAG pipeline.
    Yields SSE-compatible data chunks for real-time answer streaming.
    Uses LangChain LCEL streaming support.
    """
    import json

    # Run retrieval first (non-streaming)
    transform_result = await transform_query(request.query, request.strategy.value)
    queries_to_run = transform_result.get("transformed_queries", [request.query])

    raw_chunks = await _dispatch_retrieval(
        request.strategy.value,
        queries_to_run,
        request.top_k,
        request.filters,
        request.semantic_weight,
    )

    # Rerank if needed
    if request.strategy == RetrievalStrategy.HYBRID_RERANK and raw_chunks:
        raw_chunks = await rerank_chunks(request.query, raw_chunks, top_k=request.top_k)

    top_chunks = scored_chunks_to_schema(raw_chunks)[:request.top_k]
    context = assemble_context(top_chunks)

    # Stream the LLM response
    llm = get_llm()
    chain = RAG_PROMPT | llm | StrOutputParser()

    # First yield: metadata about retrieved chunks
    yield f"data: {json.dumps({'type': 'metadata', 'chunks': [c.model_dump() for c in top_chunks]})}\n\n"

    # Then stream the answer token by token
    async for token in chain.astream({"context": context, "question": request.query}):
        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"