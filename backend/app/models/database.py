"""
SQLAlchemy async database models for RAG Platform.
Handles: documents, query history, evaluation logs, pipeline traces.
"""
from datetime import datetime
from typing import Optional
import json

from sqlalchemy import (
    Column, String, Integer, Float, Boolean,
    DateTime, Text, ForeignKey, JSON
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship

from app.config import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    pass


# ─── Document Model ────────────────────────────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)        # pdf, txt, docx, md
    file_size = Column(Integer, nullable=False)        # bytes
    total_pages = Column(Integer, default=0)
    upload_date = Column(DateTime, default=datetime.utcnow)
    tags = Column(JSON, default=list)                  # user-defined tags
    status = Column(String, default="processing")      # processing | ready | failed
    error_message = Column(Text, nullable=True)

    # Chunk counts per strategy
    chunks_recursive = Column(Integer, default=0)
    chunks_semantic = Column(Integer, default=0)
    chunks_parent_child = Column(Integer, default=0)
    chunks_section = Column(Integer, default=0)

    # Relationships
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    queries = relationship("QueryHistory", back_populates="document")


# ─── Document Chunk Model ──────────────────────────────────────────────────────

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    chroma_id = Column(String, nullable=True)          # ChromaDB vector ID
    strategy = Column(String, nullable=False)           # recursive | semantic | parent_child | section
    chunk_index = Column(Integer, default=0)
    content = Column(Text, nullable=False)
    content_preview = Column(String(200), nullable=True)

    # Metadata
    source = Column(String, nullable=True)
    page_number = Column(Integer, nullable=True)
    section_header = Column(String, nullable=True)
    parent_id = Column(String, nullable=True)           # For parent-child chunking
    is_parent = Column(Boolean, default=False)

    token_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="chunks")


# ─── Query History Model ───────────────────────────────────────────────────────

class QueryHistory(Base):
    __tablename__ = "query_history"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=True)
    query = Column(Text, nullable=False)
    strategy = Column(String, nullable=False)           # which retrieval strategy was used
    answer = Column(Text, nullable=True)
    latency_ms = Column(Float, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)

    # Filters applied
    filters = Column(JSON, default=dict)

    # Pipeline trace (stored as JSON)
    pipeline_trace = Column(JSON, nullable=True)

    # Retrieved chunk IDs
    retrieved_chunk_ids = Column(JSON, default=list)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="queries")
    evaluation = relationship("EvaluationResult", back_populates="query", uselist=False)


# ─── Evaluation Result Model ───────────────────────────────────────────────────

class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id = Column(String, primary_key=True)
    query_id = Column(String, ForeignKey("query_history.id"), nullable=True)
    strategy = Column(String, nullable=False)
    question = Column(Text, nullable=False)
    reference_answer = Column(Text, nullable=True)
    generated_answer = Column(Text, nullable=False)

    # Metrics (0.0 to 1.0)
    faithfulness = Column(Float, nullable=True)
    answer_relevancy = Column(Float, nullable=True)
    context_precision = Column(Float, nullable=True)
    context_recall = Column(Float, nullable=True)

    # Detailed breakdown (JSON)
    faithfulness_details = Column(JSON, nullable=True)
    relevancy_details = Column(JSON, nullable=True)

    batch_id = Column(String, nullable=True)           # For batch evaluations
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    query = relationship("QueryHistory", back_populates="evaluation")


# ─── Database Engine & Session ─────────────────────────────────────────────────

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    """Create all tables on startup."""
    import os
    os.makedirs(settings.DB_DIR, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Dependency: yield async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()