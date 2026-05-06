"""
Query router: RAG query, A/B comparison, pipeline trace retrieval.
Supports both regular and streaming (SSE) responses.
"""
import uuid
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.database import get_db, QueryHistory, Document as DBDocument, User
from app.models.schemas import (
    QueryRequest, QueryResponse, CompareRequest, CompareResponse,
    PipelineTrace, RetrievedChunk, StatsResponse, MetadataFilter
)
from app.services.auth import get_current_user
from app.services.rag_chain import run_rag_pipeline, stream_rag_pipeline
from app.services.llm_errors import llm_http_exception

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def query_documents(
    request: QueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Query documents using the selected retrieval strategy.
    Returns answer + full pipeline trace + retrieved chunks.
    """
    if request.stream:
        # Redirect to streaming endpoint logic
        raise HTTPException(
            status_code=400,
            detail="Use POST /api/query/stream for streaming responses"
        )

    try:
        request = _with_user_filter(request, current_user.id)
        result = await run_rag_pipeline(request)
    except Exception as exc:
        mapped = llm_http_exception(exc)
        if mapped:
            raise mapped
        raise

    # Persist query to history
    history = QueryHistory(
        id=result.query_id,
        user_id=current_user.id,
        query=request.query,
        strategy=request.strategy.value,
        answer=result.answer,
        latency_ms=result.latency_ms,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        filters=request.filters.model_dump() if request.filters else {},
        pipeline_trace=result.pipeline_trace.model_dump(),
        retrieved_chunk_ids=[c.chunk_id for c in result.retrieved_chunks],
    )
    db.add(history)
    await db.commit()

    return result


@router.post("/query/stream")
async def query_documents_stream(
    request: QueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stream RAG response using Server-Sent Events (SSE).
    Yields: metadata chunk, then answer tokens, then done signal.
    """
    return StreamingResponse(
        stream_rag_pipeline(_with_user_filter(request, current_user.id)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/query/compare", response_model=CompareResponse)
async def compare_strategies(
    request: CompareRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    A/B compare two retrieval strategies on the same query.
    Runs both strategies in parallel for efficiency.
    """
    req_a = QueryRequest(
        query=request.query,
        strategy=request.strategy_a,
        filters=_owned_filters(request.filters, current_user.id),
    )
    req_b = QueryRequest(
        query=request.query,
        strategy=request.strategy_b,
        filters=_owned_filters(request.filters, current_user.id),
    )

    try:
        result_a = await run_rag_pipeline(req_a)
        result_b = await run_rag_pipeline(req_b)
    except Exception as exc:
        mapped = llm_http_exception(exc)
        if mapped:
            raise mapped
        raise

    # Find overlap in retrieved chunks
    ids_a = {c.chunk_id for c in result_a.retrieved_chunks}
    ids_b = {c.chunk_id for c in result_b.retrieved_chunks}
    overlap = list(ids_a & ids_b)

    # Persist both queries
    for result in [result_a, result_b]:
        history = QueryHistory(
            id=result.query_id,
            user_id=current_user.id,
            query=request.query,
            strategy=result.strategy,
            answer=result.answer,
            latency_ms=result.latency_ms,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            pipeline_trace=result.pipeline_trace.model_dump(),
            retrieved_chunk_ids=[c.chunk_id for c in result.retrieved_chunks],
        )
        db.add(history)
    await db.commit()

    return CompareResponse(
        query=request.query,
        result_a=result_a,
        result_b=result_b,
        overlap_chunk_ids=overlap,
    )


@router.get("/query/{query_id}/pipeline", response_model=PipelineTrace)
async def get_pipeline_trace(
    query_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the full pipeline trace for a past query."""
    history = await db.get(QueryHistory, query_id)
    if not history or history.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Query not found")
    if not history.pipeline_trace:
        raise HTTPException(status_code=404, detail="No pipeline trace for this query")

    return PipelineTrace(**history.pipeline_trace)


@router.get("/query/{query_id}/chunks", response_model=list[RetrievedChunk])
async def get_query_chunks(
    query_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the retrieved chunks for a past query."""
    history = await db.get(QueryHistory, query_id)
    if not history or history.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Query not found")

    trace = history.pipeline_trace or {}
    retrieved = trace.get("retrieved_chunks", [])
    return [RetrievedChunk(**c) for c in retrieved]


@router.get("/strategies")
async def list_strategies():
    """List all available retrieval strategies with descriptions."""
    return {
        "strategies": [
            {
                "id": "basic_vector",
                "name": "Basic Vector Search",
                "description": "Standard cosine similarity search on embeddings",
                "recommended": False,
            },
            {
                "id": "hybrid",
                "name": "Hybrid Search (BM25 + Vector)",
                "description": "Combines semantic + keyword search via Reciprocal Rank Fusion",
                "recommended": False,
            },
            {
                "id": "hybrid_rerank",
                "name": "Hybrid + Cross-Encoder Rerank",
                "description": "Hybrid search followed by cross-encoder reranking for highest precision",
                "recommended": True,
            },
            {
                "id": "parent_child",
                "name": "Parent-Child Retrieval",
                "description": "Search small chunks for precision, return large parent chunks for context",
                "recommended": False,
            },
            {
                "id": "multi_query",
                "name": "Multi-Query Expansion",
                "description": "LLM generates 3-5 query variants, merges retrieval results",
                "recommended": False,
            },
            {
                "id": "hyde",
                "name": "HyDE (Hypothetical Document Embeddings)",
                "description": "LLM generates a hypothetical answer, embeds it, searches with that",
                "recommended": False,
            },
            {
                "id": "decomposition",
                "name": "Query Decomposition",
                "description": "Breaks complex queries into sub-questions, retrieves and synthesizes",
                "recommended": False,
            },
        ]
    }


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get platform usage statistics."""
    from app.models.database import DocumentChunk, EvaluationResult

    # Total documents
    doc_count = await db.scalar(
        select(func.count()).select_from(DBDocument).where(DBDocument.user_id == current_user.id)
    )

    # Total chunks
    chunk_count = await db.scalar(
        select(func.count())
        .select_from(DocumentChunk)
        .join(DBDocument, DocumentChunk.document_id == DBDocument.id)
        .where(DBDocument.user_id == current_user.id)
    )

    # Total queries
    query_count = await db.scalar(
        select(func.count()).select_from(QueryHistory).where(QueryHistory.user_id == current_user.id)
    )

    # Avg latency
    avg_latency = await db.scalar(
        select(func.avg(QueryHistory.latency_ms)).where(QueryHistory.user_id == current_user.id)
    )

    # Total tokens
    total_in = await db.scalar(
        select(func.sum(QueryHistory.input_tokens)).where(QueryHistory.user_id == current_user.id)
    ) or 0
    total_out = await db.scalar(
        select(func.sum(QueryHistory.output_tokens)).where(QueryHistory.user_id == current_user.id)
    ) or 0

    # Chunks by strategy
    from sqlalchemy import text
    chunks_by_strategy_result = await db.execute(
        text(
            "SELECT c.strategy, COUNT(*) as cnt "
            "FROM document_chunks c JOIN documents d ON c.document_id = d.id "
            "WHERE d.user_id = :user_id GROUP BY c.strategy"
        ),
        {"user_id": current_user.id},
    )
    chunks_by_strategy = {row[0]: row[1] for row in chunks_by_strategy_result}

    # Queries by strategy
    queries_by_strategy_result = await db.execute(
        text(
            "SELECT strategy, COUNT(*) as cnt FROM query_history "
            "WHERE user_id = :user_id GROUP BY strategy"
        ),
        {"user_id": current_user.id},
    )
    queries_by_strategy = {row[0]: row[1] for row in queries_by_strategy_result}

    return StatsResponse(
        total_documents=doc_count or 0,
        total_chunks=chunk_count or 0,
        total_queries=query_count or 0,
        avg_latency_ms=round(avg_latency or 0, 2),
        total_tokens_used=(total_in or 0) + (total_out or 0),
        chunks_by_strategy=chunks_by_strategy,
        queries_by_strategy=queries_by_strategy,
    )


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint."""
    from app.models.schemas import HealthResponse
    from app.config import get_settings
    from app.services.ingestion import get_chroma_client

    settings = get_settings()

    # Check ChromaDB
    chroma_ok = False
    try:
        chroma = get_chroma_client()
        chroma.get(limit=1)
        chroma_ok = True
    except Exception:
        pass

    # Check DB
    db_ok = False
    try:
        await db.scalar(select(func.count()).select_from(DBDocument))
        db_ok = True
    except Exception:
        pass

    # Check LLM (don't actually call it, just check key)
    llm_ok = bool(settings.GROQ_API_KEY)

    return HealthResponse(
        status="ok" if (chroma_ok and db_ok and llm_ok) else "degraded",
        version=settings.APP_VERSION,
        chroma_ok=chroma_ok,
        db_ok=db_ok,
        llm_ok=llm_ok,
    )


def _owned_filters(filters: MetadataFilter | None, user_id: str) -> MetadataFilter:
    if filters:
        return filters.model_copy(update={"user_id": user_id})
    return MetadataFilter(user_id=user_id)


def _with_user_filter(request: QueryRequest, user_id: str) -> QueryRequest:
    return request.model_copy(update={"filters": _owned_filters(request.filters, user_id)})
