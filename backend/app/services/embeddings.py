"""
Embedding backends used by ChromaDB and semantic chunking.

The default backend is intentionally lightweight so the app can run on small
hosts without loading torch/sentence-transformers into memory.
"""
import hashlib
import logging
import math
import re
from typing import Iterable

from langchain_core.embeddings import Embeddings

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class HashingEmbeddings(Embeddings):
    """Deterministic bag-of-words hashing embeddings with no model dependency."""

    def __init__(self, dimension: int = 384):
        self.dimension = dimension

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimension
        for token in self._tokens(text):
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
            value = int.from_bytes(digest, "big", signed=False)
            index = value % self.dimension
            sign = 1.0 if (value >> 8) & 1 else -1.0
            vector[index] += sign

        norm = math.sqrt(sum(v * v for v in vector))
        if norm == 0:
            return vector
        return [v / norm for v in vector]

    @staticmethod
    def _tokens(text: str) -> Iterable[str]:
        return re.findall(r"[a-z0-9]+", text.lower())


def create_embeddings() -> Embeddings:
    """Create the configured embedding backend."""
    provider = settings.EMBEDDING_PROVIDER.lower()

    if provider in {"hashing", "lightweight"}:
        logger.info(
            "Using lightweight hashing embeddings (%s dimensions)",
            settings.EMBEDDING_DIMENSION,
        )
        return HashingEmbeddings(dimension=settings.EMBEDDING_DIMENSION)

    if provider in {"huggingface", "sentence-transformers", "sentence_transformers"}:
        logger.info("Loading Hugging Face embedding model: %s", settings.EMBEDDING_MODEL)
        from langchain_huggingface import HuggingFaceEmbeddings

        return HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": settings.EMBEDDING_DEVICE},
            encode_kwargs={"normalize_embeddings": True},
        )

    raise ValueError(
        f"Unsupported EMBEDDING_PROVIDER '{settings.EMBEDDING_PROVIDER}'. "
        "Use 'hashing' or 'huggingface'."
    )
