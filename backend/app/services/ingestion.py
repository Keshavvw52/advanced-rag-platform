import os
import uuid
import logging
import hashlib
from datetime import datetime
from pathlib import Path

from langchain_core.documents import Document
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    Docx2txtLoader,
    UnstructuredMarkdownLoader,
)
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.models.database import Document as DBDocument, DocumentChunk as DBChunk
from app.services.chunking_strategies import chunk_documents
from app.services.embeddings import create_embeddings

logger = logging.getLogger(__name__)
settings = get_settings()

# Singleton embeddings
_embeddings: Embeddings = None
_chroma_client: Chroma = None


def get_embeddings() -> Embeddings:
    """Return or initialize the embedding backend singleton."""
    global _embeddings
    if _embeddings is None:
        _embeddings = create_embeddings()
    return _embeddings


def get_chroma_client() -> Chroma:
    """Return or initialize ChromaDB client singleton."""
    global _chroma_client
    if _chroma_client is None:
        os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)
        _chroma_client = Chroma(
            collection_name=settings.CHROMA_COLLECTION_NAME,
            embedding_function=get_embeddings(),
            persist_directory=settings.CHROMA_PERSIST_DIR,
        )
    return _chroma_client


# ─── Document Loaders ──────────────────────────────────────────────────────────

def load_document(file_path: str, file_type: str) -> list[Document]:
    """
    Load a document using the appropriate LangChain loader.
    Returns a list of LangChain Document objects with base metadata.
    """
    file_path = str(file_path)

    loaders = {
        ".pdf": lambda p: PyPDFLoader(p),
        ".txt": lambda p: TextLoader(p, encoding="utf-8"),
        ".docx": lambda p: Docx2txtLoader(p),
        ".md": lambda p: UnstructuredMarkdownLoader(p),
        ".markdown": lambda p: UnstructuredMarkdownLoader(p),
    }

    ext = f".{file_type.lower()}" if not file_type.startswith(".") else file_type.lower()
    loader_fn = loaders.get(ext)

    if loader_fn is None:
        raise ValueError(f"Unsupported file type: {file_type}")

    loader = loader_fn(file_path)
    documents = loader.load()

    # Normalize source metadata
    for doc in documents:
        doc.metadata["file_type"] = file_type
        doc.metadata.setdefault("source", os.path.basename(file_path))

    return documents


def enrich_document_metadata(
    documents: list[Document],
    document_id: str,
    user_id: str,
    filename: str,
    file_type: str,
    tags: list[str],
    upload_date: datetime,
) -> list[Document]:
    """
    Enrich each document chunk with standardized metadata fields.
    This ensures consistent filtering capabilities at query time.
    """
    for doc in documents:
        doc.metadata.update({
            "document_id": document_id,
            "user_id": user_id,
            "filename": filename,
            "file_type": file_type,
            "tags": ",".join(tags),  # ChromaDB requires string values
            "upload_date": upload_date.isoformat(),
        })
        # Extract section headers from content (simple heuristic)
        lines = doc.page_content.split("\n")
        for line in lines[:5]:  # check first 5 lines for a header
            stripped = line.strip()
            if stripped.startswith("#") or (len(stripped) < 80 and stripped.isupper()):
                doc.metadata["section_header"] = stripped.lstrip("#").strip()
                break
    return documents


# ─── Main Ingestion Pipeline ──────────────────────────────────────────────────

async def ingest_document(
    file_path: str,
    document_id: str,
    filename: str,
    file_type: str,
    file_size: int,
    tags: list[str],
    user_id: str,
    db: AsyncSession,
) -> DBDocument:
    """
    Full ingestion pipeline:
    1. Load document
    2. Enrich metadata
    3. Run all chunking strategies
    4. Store vectors in ChromaDB
    5. Persist metadata in SQLite
    """
    upload_date = datetime.utcnow()

    # ── Step 1: Load document ──
    logger.info(f"Loading document: {filename} ({file_type})")
    raw_documents = load_document(file_path, file_type)
    total_pages = max(
        (doc.metadata.get("page", 0) for doc in raw_documents), default=0
    ) + 1

    # ── Step 2: Metadata enrichment ──
    enriched_docs = enrich_document_metadata(
        raw_documents, document_id, user_id, filename, file_type, tags, upload_date
    )

    # ── Step 3: Run all chunking strategies ──
    embeddings = get_embeddings()
    chunk_results = chunk_documents(
        enriched_docs,
        document_id,
        strategies=["recursive", "semantic", "parent_child", "section"],
        embeddings=embeddings,
    )

    # ── Step 4: Store in ChromaDB ──
    chroma = get_chroma_client()
    chunk_counts = {}

    for strategy_name, result in chunk_results.items():
        all_chunks = result.chunks + result.parent_chunks

        if not all_chunks:
            chunk_counts[strategy_name] = 0
            continue

        # Prepare for ChromaDB
        texts = [c.page_content for c in all_chunks]
        metadatas = []
        ids = []

        for chunk in all_chunks:
            chunk_id = chunk.metadata.get("chunk_id", str(uuid.uuid4()))
            # ChromaDB only supports string/int/float/bool metadata values
            clean_meta = {
                k: (str(v) if not isinstance(v, (str, int, float, bool)) else v)
                for k, v in chunk.metadata.items()
                if v is not None
            }
            metadatas.append(clean_meta)
            ids.append(chunk_id)

        # Batch upsert into ChromaDB
        try:
            chroma.add_texts(texts=texts, metadatas=metadatas, ids=ids)
            logger.info(f"Stored {len(texts)} chunks for strategy '{strategy_name}' in ChromaDB")
        except Exception as e:
            logger.error(f"ChromaDB storage failed for strategy '{strategy_name}': {e}")

        chunk_counts[strategy_name] = len(result.chunks)  # count only child/leaf chunks

        # ── Step 5: Persist chunk metadata to SQLite ──
        for chunk in all_chunks:
            db_chunk = DBChunk(
                id=chunk.metadata.get("chunk_id", str(uuid.uuid4())),
                document_id=document_id,
                chroma_id=chunk.metadata.get("chunk_id"),
                strategy=strategy_name,
                chunk_index=chunk.metadata.get("chunk_index", 0),
                content=chunk.page_content,
                content_preview=chunk.page_content[:200],
                source=chunk.metadata.get("source"),
                page_number=chunk.metadata.get("page"),
                section_header=chunk.metadata.get("section_header"),
                parent_id=chunk.metadata.get("parent_id"),
                is_parent=chunk.metadata.get("is_parent", False),
                token_count=chunk.metadata.get("token_count", 0),
            )
            db.add(db_chunk)

    # ── Step 6: Update document record in DB ──
    db_doc = await db.get(DBDocument, document_id)
    if db_doc:
        db_doc.status = "ready"
        db_doc.total_pages = total_pages
        db_doc.chunks_recursive = chunk_counts.get("recursive", 0)
        db_doc.chunks_semantic = chunk_counts.get("semantic", 0)
        db_doc.chunks_parent_child = chunk_counts.get("parent_child", 0)
        db_doc.chunks_section = chunk_counts.get("section", 0)

    await db.commit()
    await db.refresh(db_doc)

    logger.info(
        f"Ingestion complete: {filename} | "
        f"Pages: {total_pages} | "
        f"Chunks: {chunk_counts}"
    )
    return db_doc


async def delete_document(document_id: str, db: AsyncSession) -> bool:
    """
    Remove a document and all its chunks from ChromaDB and SQLite.
    """
    try:
        chroma = get_chroma_client()

        # Delete all chunks for this document from ChromaDB
        results = chroma.get(
            where={"document_id": document_id},
            include=[],
        )
        chunk_ids = results.get("ids", []) or []
        if chunk_ids:
            chroma.delete(ids=chunk_ids)

        # Delete from SQLite (cascade handles chunks)
        db_doc = await db.get(DBDocument, document_id)
        if db_doc:
            await db.delete(db_doc)
            await db.commit()

        return True
    except Exception as e:
        logger.error(f"Delete failed for document {document_id}: {e}")
        return False


def get_bm25_corpus(document_id: str = None, user_id: str = None) -> tuple[list[str], list[dict]]:
    """
    Retrieve text corpus from ChromaDB for BM25 index building.
    Optionally filtered to a specific document.
    Returns (texts, metadatas).
    """
    chroma = get_chroma_client()

    where_filter = {"strategy": "recursive"}  # Use recursive chunks for BM25
    if document_id:
        where_filter["document_id"] = document_id
    if user_id:
        where_filter["user_id"] = user_id

    results = chroma.get(
        where=where_filter,
        include=["documents", "metadatas"],
    )

    texts = results.get("documents", []) or []
    metadatas = results.get("metadatas", []) or []
    ids = results.get("ids", []) or []

    return texts, metadatas, ids
