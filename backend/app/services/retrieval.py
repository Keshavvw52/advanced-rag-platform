"""
Retrieval service implementing all search strategies:
- Basic vector search (ChromaDB)
- BM25 keyword search (rank_bm25)
- Hybrid search with Reciprocal Rank Fusion (RRF)
- Parent-child retrieval
- Multi-query merged retrieval
- HyDE-based retrieval
Applies metadata filtering to all retrieval paths.
"""
import logging
from typing import Optional, Any
from dataclasses import dataclass, field

import numpy as np
from rank_bm25 import BM25Okapi

from langchain_core.documents import Document
from langchain_chroma import Chroma

from app.config import get_settings
from app.models.schemas import MetadataFilter, RetrievedChunk
from app.services.ingestion import get_chroma_client, get_embeddings, get_bm25_corpus

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class ScoredChunk:
    """Internal representation of a retrieved chunk with all scores."""
    chunk_id: str
    content: str
    metadata: dict
    similarity_score: float = 0.0
    bm25_score: float = 0.0
    rrf_score: float = 0.0
    rerank_score: float = 0.0
    original_rank: int = 0
    reranked_rank: int = 0


# ─── Metadata Filter Builder ──────────────────────────────────────────────────

def build_chroma_where(filters: Optional[MetadataFilter]) -> Optional[dict]:
    """
    Convert MetadataFilter schema to ChromaDB where clause.
    ChromaDB supports: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and, $or
    """
    if not filters:
        return None

    conditions = []

    if filters.source:
        conditions.append({"source": {"$eq": filters.source}})

    if filters.chunk_strategy and filters.chunk_strategy != "all":
        conditions.append({"strategy": {"$eq": filters.chunk_strategy.value}})

    if filters.section:
        conditions.append({"section_header": {"$eq": filters.section}})

    if filters.document_ids:
        conditions.append({"document_id": {"$in": filters.document_ids}})

    if filters.user_id:
        conditions.append({"user_id": {"$eq": filters.user_id}})

    if filters.tags:
        # Tags are stored as comma-separated string in ChromaDB
        # Use $in with the tags list (partial match workaround)
        conditions.append({"tags": {"$in": filters.tags}})

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


# ─── Chunk Deduplication ──────────────────────────────────────────────────────

def deduplicate_chunks(chunks: list[ScoredChunk]) -> list[ScoredChunk]:
    """Remove duplicate chunks by chunk_id, keeping the highest-scored one."""
    seen = {}
    for chunk in chunks:
        cid = chunk.chunk_id
        if cid not in seen or chunk.rrf_score > seen[cid].rrf_score:
            seen[cid] = chunk
    return list(seen.values())


# ─── Reciprocal Rank Fusion ───────────────────────────────────────────────────

def reciprocal_rank_fusion(
    result_lists: list[list[ScoredChunk]],
    k: int = None,
) -> list[ScoredChunk]:
    """
    Merge multiple ranked result lists using RRF.
    score(d) = sum(1 / (k + rank_i)) for each list i where document d appears.
    k=60 is the standard value from the original RRF paper.
    """
    k = k or settings.RRF_K
    rrf_scores: dict[str, float] = {}
    chunk_map: dict[str, ScoredChunk] = {}

    for result_list in result_lists:
        for rank, chunk in enumerate(result_list, start=1):
            cid = chunk.chunk_id
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + (1.0 / (k + rank))
            if cid not in chunk_map:
                chunk_map[cid] = chunk

    # Assign RRF scores and sort
    merged = []
    for cid, score in rrf_scores.items():
        chunk = chunk_map[cid]
        chunk.rrf_score = score
        merged.append(chunk)

    merged.sort(key=lambda x: x.rrf_score, reverse=True)
    return merged


# ─── Basic Vector Retrieval ───────────────────────────────────────────────────

async def vector_search(
    query: str,
    top_k: int = None,
    filters: Optional[MetadataFilter] = None,
    strategy_filter: str = "recursive",  # which chunk strategy to search
) -> list[ScoredChunk]:
    """Standard ChromaDB cosine similarity search."""
    top_k = top_k or settings.RETRIEVAL_TOP_K
    chroma = get_chroma_client()

    where = build_chroma_where(filters)
    # Default to recursive chunks unless parent_child strategy
    if not (filters and filters.chunk_strategy):
        if strategy_filter:
            if where:
                where = {"$and": [where, {"strategy": {"$eq": strategy_filter}}]}
            else:
                where = {"strategy": {"$eq": strategy_filter}}

    try:
        results = chroma.similarity_search_with_relevance_scores(
            query=query,
            k=top_k,
            filter=where if where else None,
        )
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return []

    chunks = []
    for rank, (doc, score) in enumerate(results):
        chunks.append(ScoredChunk(
            chunk_id=doc.metadata.get("chunk_id", f"vec_{rank}"),
            content=doc.page_content,
            metadata=doc.metadata,
            similarity_score=float(score),
            original_rank=rank + 1,
        ))

    return chunks


# ─── BM25 Retrieval ───────────────────────────────────────────────────────────

async def bm25_search(
    query: str,
    top_k: int = None,
    filters: Optional[MetadataFilter] = None,
) -> list[ScoredChunk]:
    """
    BM25 lexical search using rank_bm25.
    Builds BM25 index from ChromaDB corpus on each call (cached in production).
    """
    top_k = top_k or settings.RETRIEVAL_TOP_K

    # Fetch corpus from ChromaDB
    texts, metadatas, ids = get_bm25_corpus(user_id=filters.user_id if filters else None)

    if not texts:
        logger.warning("BM25: Empty corpus, returning empty results")
        return []

    # Apply metadata filters manually (BM25 doesn't support native filtering)
    if filters:
        filtered = []
        for text, meta, id_ in zip(texts, metadatas, ids):
            if filters.source and meta.get("source") != filters.source:
                continue
            if filters.chunk_strategy and filters.chunk_strategy != "all":
                if meta.get("strategy") != filters.chunk_strategy.value:
                    continue
            if filters.document_ids and meta.get("document_id") not in filters.document_ids:
                continue
            if filters.user_id and meta.get("user_id") != filters.user_id:
                continue
            filtered.append((text, meta, id_))
        if filtered:
            texts, metadatas, ids = zip(*filtered)
            texts, metadatas, ids = list(texts), list(metadatas), list(ids)
        else:
            return []

    # Tokenize corpus
    tokenized_corpus = [doc.lower().split() for doc in texts]
    bm25 = BM25Okapi(tokenized_corpus)

    # Score query against corpus
    tokenized_query = query.lower().split()
    scores = bm25.get_scores(tokenized_query)

    # Get top-k indices
    top_indices = np.argsort(scores)[::-1][:top_k]

    chunks = []
    for rank, idx in enumerate(top_indices):
        if scores[idx] <= 0:
            break
        chunks.append(ScoredChunk(
            chunk_id=ids[idx],
            content=texts[idx],
            metadata=metadatas[idx],
            bm25_score=float(scores[idx]),
            original_rank=rank + 1,
        ))

    return chunks


# ─── Hybrid Search ────────────────────────────────────────────────────────────

async def hybrid_search(
    query: str,
    top_k: int = None,
    filters: Optional[MetadataFilter] = None,
    semantic_weight: float = None,
) -> list[ScoredChunk]:
    """
    Hybrid retrieval: semantic (vector) + keyword (BM25) merged via RRF.
    semantic_weight: 0.0 = pure BM25, 1.0 = pure vector, 0.7 = default.
    """
    top_k = top_k or settings.RETRIEVAL_TOP_K
    semantic_weight = semantic_weight if semantic_weight is not None else settings.SEMANTIC_WEIGHT

    # Run both searches
    vec_chunks = await vector_search(query, top_k=top_k, filters=filters)
    bm25_chunks = await bm25_search(query, top_k=top_k, filters=filters)

    if not vec_chunks and not bm25_chunks:
        return []

    # Merge with RRF
    merged = reciprocal_rank_fusion([vec_chunks, bm25_chunks])

    # Re-apply scores from source (for transparency display)
    vec_map = {c.chunk_id: c.similarity_score for c in vec_chunks}
    bm25_map = {c.chunk_id: c.bm25_score for c in bm25_chunks}

    for chunk in merged:
        chunk.similarity_score = vec_map.get(chunk.chunk_id, 0.0)
        chunk.bm25_score = bm25_map.get(chunk.chunk_id, 0.0)

    return merged[:top_k]


# ─── Parent-Child Retrieval ───────────────────────────────────────────────────

async def parent_child_search(
    query: str,
    top_k: int = None,
    filters: Optional[MetadataFilter] = None,
) -> list[ScoredChunk]:
    """
    Search small child chunks for precision, but return large parent chunks for context.
    This is the core of parent-child retrieval strategy.
    """
    top_k = top_k or settings.RETRIEVAL_TOP_K
    chroma = get_chroma_client()

    # Build filter that targets child chunks only
    where = build_chroma_where(filters)
    child_filter = {"$and": [
        {"strategy": {"$eq": "parent_child"}},
        {"is_parent": {"$eq": "False"}},  # ChromaDB stores booleans as strings
    ]}
    if where:
        child_filter = {"$and": [where, child_filter]}

    try:
        child_results = chroma.similarity_search_with_relevance_scores(
            query=query,
            k=top_k * 2,  # get more children to find diverse parents
            filter=child_filter,
        )
    except Exception as e:
        logger.error(f"Parent-child child search failed: {e}")
        return []

    # Collect unique parent IDs from matched children
    parent_ids_seen = set()
    parent_order = []
    child_score_map = {}  # parent_id -> best child score

    for doc, score in child_results:
        parent_id = doc.metadata.get("parent_id")
        if parent_id and parent_id not in parent_ids_seen:
            parent_ids_seen.add(parent_id)
            parent_order.append(parent_id)
            child_score_map[parent_id] = float(score)
        elif parent_id:
            # Keep best score for this parent
            child_score_map[parent_id] = max(child_score_map.get(parent_id, 0), float(score))

    if not parent_ids_seen:
        # Fall back to regular vector search
        return await vector_search(query, top_k=top_k, filters=filters)

    # Fetch parent chunks by their IDs
    try:
        parent_results = chroma.get(
            ids=list(parent_ids_seen),
            include=["documents", "metadatas"],
        )
    except Exception as e:
        logger.error(f"Parent chunk fetch failed: {e}")
        return []

    parent_docs = parent_results.get("documents", []) or []
    parent_metas = parent_results.get("metadatas", []) or []
    parent_ids = parent_results.get("ids", []) or []

    chunks = []
    for pid, content, meta in zip(parent_ids, parent_docs, parent_metas):
        rank = parent_order.index(pid) if pid in parent_order else len(parent_order)
        chunks.append(ScoredChunk(
            chunk_id=pid,
            content=content,
            metadata=meta,
            similarity_score=child_score_map.get(pid, 0.0),
            original_rank=rank + 1,
        ))

    chunks.sort(key=lambda x: x.similarity_score, reverse=True)
    return chunks[:top_k]


# ─── Multi-Query Merged Retrieval ─────────────────────────────────────────────

async def multi_query_search(
    queries: list[str],
    top_k: int = None,
    filters: Optional[MetadataFilter] = None,
) -> list[ScoredChunk]:
    """
    Run hybrid search for each query variant, merge and deduplicate results.
    Uses RRF to combine results across all query variants.
    """
    top_k = top_k or settings.RETRIEVAL_TOP_K
    all_result_lists = []

    for query in queries:
        chunks = await hybrid_search(query, top_k=top_k, filters=filters)
        all_result_lists.append(chunks)

    if not all_result_lists:
        return []

    merged = reciprocal_rank_fusion(all_result_lists)
    merged = deduplicate_chunks(merged)
    return merged[:top_k]


# ─── Chunk Converter ─────────────────────────────────────────────────────────

def scored_chunks_to_schema(
    chunks: list[ScoredChunk],
) -> list[RetrievedChunk]:
    """Convert internal ScoredChunk objects to API schema."""
    return [
        RetrievedChunk(
            chunk_id=c.chunk_id,
            content=c.content,
            source=c.metadata.get("source") or c.metadata.get("filename"),
            page_number=c.metadata.get("page") or c.metadata.get("page_number"),
            section_header=c.metadata.get("section_header"),
            strategy=c.metadata.get("strategy", "unknown"),
            similarity_score=round(c.similarity_score, 4) if c.similarity_score else None,
            bm25_score=round(c.bm25_score, 4) if c.bm25_score else None,
            rerank_score=round(c.rerank_score, 4) if c.rerank_score else None,
            original_rank=c.original_rank,
            reranked_rank=c.reranked_rank,
        )
        for c in chunks
    ]
