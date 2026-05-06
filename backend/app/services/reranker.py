import logging
from typing import Optional

from sentence_transformers import CrossEncoder

from app.config import get_settings
from app.services.retrieval import ScoredChunk

logger = logging.getLogger(__name__)
settings = get_settings()

# Singleton cross-encoder model
_cross_encoder: Optional[CrossEncoder] = None


def get_cross_encoder() -> CrossEncoder:
    """Return or initialize the CrossEncoder singleton."""
    global _cross_encoder
    if _cross_encoder is None:
        logger.info(f"Loading cross-encoder: {settings.RERANKER_MODEL}")
        _cross_encoder = CrossEncoder(
            settings.RERANKER_MODEL,
            max_length=512,
            device=settings.EMBEDDING_DEVICE,
        )
    return _cross_encoder


async def rerank_chunks(
    query: str,
    chunks: list[ScoredChunk],
    top_k: int = None,
) -> list[ScoredChunk]:
    """
    Re-rank retrieved chunks using the cross-encoder model.
    
    Process:
    1. Take top-20 chunks from initial retrieval
    2. Score each (query, chunk) pair with cross-encoder
    3. Sort by cross-encoder score (descending)
    4. Return top-k chunks with original and new ranks annotated
    
    Returns chunks sorted by rerank score (best first).
    """
    top_k = top_k or settings.RERANKER_TOP_K

    if not chunks:
        return []

    cross_encoder = get_cross_encoder()

    # Prepare query-document pairs for batch scoring
    pairs = [(query, chunk.content[:512]) for chunk in chunks]

    try:
        scores = cross_encoder.predict(pairs)
    except Exception as e:
        logger.error(f"Cross-encoder scoring failed: {e}")
        # Fallback: return original order
        return chunks[:top_k]

    # Attach rerank scores and original ranks
    for i, (chunk, score) in enumerate(zip(chunks, scores)):
        chunk.rerank_score = float(score)
        chunk.original_rank = i + 1

    # Sort by rerank score
    reranked = sorted(chunks, key=lambda x: x.rerank_score, reverse=True)

    # Annotate new ranks
    for new_rank, chunk in enumerate(reranked):
        chunk.reranked_rank = new_rank + 1

    logger.info(
        f"Re-ranked {len(chunks)} chunks -> top {top_k} | "
        f"Score range: [{reranked[-1].rerank_score:.3f}, {reranked[0].rerank_score:.3f}]"
    )

    return reranked[:top_k]


def compute_rank_changes(
    original: list[ScoredChunk],
    reranked: list[ScoredChunk],
) -> list[dict]:
    """
    Compute rank changes for pipeline transparency display.
    Returns list of dicts showing rank movement per chunk.
    """
    orig_ranks = {c.chunk_id: i + 1 for i, c in enumerate(original)}
    changes = []

    for new_rank, chunk in enumerate(reranked, start=1):
        orig_rank = orig_ranks.get(chunk.chunk_id, "N/A")
        change = (orig_rank - new_rank) if isinstance(orig_rank, int) else 0
        changes.append({
            "chunk_id": chunk.chunk_id,
            "content_preview": chunk.content[:100],
            "original_rank": orig_rank,
            "reranked_rank": new_rank,
            "rank_change": change,      # positive = moved up, negative = moved down
            "rerank_score": round(chunk.rerank_score, 4),
            "similarity_score": round(chunk.similarity_score, 4),
        })

    return changes