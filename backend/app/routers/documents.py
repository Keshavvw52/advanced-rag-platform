"""
Documents router: upload, list, retrieve, delete documents.
Handles multipart file uploads with background ingestion.
"""
import os
import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.config import get_settings
from app.models.database import get_db, Document as DBDocument, DocumentChunk as DBChunk
from app.models.schemas import (
    DocumentUploadResponse, DocumentResponse, DocumentChunkResponse, ChunkCounts
)
from app.services.ingestion import ingest_document, delete_document

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api/documents", tags=["documents"])


def _doc_to_response(doc: DBDocument) -> DocumentResponse:
    """Convert DB document to response schema."""
    total = (
        doc.chunks_recursive + doc.chunks_semantic +
        doc.chunks_parent_child + doc.chunks_section
    )
    return DocumentResponse(
        id=doc.id,
        filename=doc.filename,
        original_filename=doc.original_filename,
        file_type=doc.file_type,
        file_size=doc.file_size,
        total_pages=doc.total_pages,
        upload_date=doc.upload_date,
        tags=doc.tags or [],
        status=doc.status,
        chunk_counts=ChunkCounts(
            recursive=doc.chunks_recursive,
            semantic=doc.chunks_semantic,
            parent_child=doc.chunks_parent_child,
            section=doc.chunks_section,
            total=total,
        ),
        error_message=doc.error_message,
    )


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tags: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload and ingest a document.
    Supports: PDF, TXT, DOCX, Markdown.
    Ingestion runs as a background task.
    """
    # Validate file type
    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()

    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {settings.ALLOWED_EXTENSIONS}"
        )

    # Read file content
    content = await file.read()
    file_size = len(content)

    if file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max {settings.MAX_FILE_SIZE_MB}MB"
        )

    # Generate document ID and save file
    document_id = str(uuid.uuid4())
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{document_id}{ext}"
    file_path = upload_dir / safe_filename

    with open(file_path, "wb") as f:
        f.write(content)

    # Parse tags
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    # Create DB record immediately (status=processing)
    db_doc = DBDocument(
        id=document_id,
        filename=safe_filename,
        original_filename=filename,
        file_type=ext.lstrip("."),
        file_size=file_size,
        tags=tag_list,
        status="processing",
    )
    db.add(db_doc)
    await db.commit()

    # Run ingestion in background
    async def run_ingestion():
        from app.models.database import AsyncSessionLocal
        async with AsyncSessionLocal() as bg_db:
            try:
                await ingest_document(
                    file_path=str(file_path),
                    document_id=document_id,
                    filename=filename,
                    file_type=ext.lstrip("."),
                    file_size=file_size,
                    tags=tag_list,
                    db=bg_db,
                )
            except Exception as e:
                logger.error(f"Ingestion failed for {filename}: {e}", exc_info=True)
                doc = await bg_db.get(DBDocument, document_id)
                if doc:
                    doc.status = "failed"
                    doc.error_message = str(e)[:500]
                    await bg_db.commit()

    background_tasks.add_task(run_ingestion)

    return DocumentUploadResponse(
        id=document_id,
        filename=filename,
        file_type=ext.lstrip("."),
        file_size=file_size,
        status="processing",
        message="Document uploaded. Processing in background. Check status via GET /api/documents.",
    )


@router.get("", response_model=list[DocumentResponse])
async def list_documents(db: AsyncSession = Depends(get_db)):
    """List all ingested documents."""
    result = await db.execute(
        select(DBDocument).order_by(DBDocument.upload_date.desc())
    )
    docs = result.scalars().all()
    return [_doc_to_response(doc) for doc in docs]


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: str, db: AsyncSession = Depends(get_db)):
    """Get a specific document by ID."""
    doc = await db.get(DBDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_to_response(doc)


@router.get("/{document_id}/chunks", response_model=list[DocumentChunkResponse])
async def get_document_chunks(
    document_id: str,
    strategy: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Get all chunks for a document, optionally filtered by strategy."""
    query = select(DBChunk).where(DBChunk.document_id == document_id)
    if strategy:
        query = query.where(DBChunk.strategy == strategy)
    query = query.order_by(DBChunk.strategy, DBChunk.chunk_index)

    result = await db.execute(query)
    chunks = result.scalars().all()

    if not chunks and not await db.get(DBDocument, document_id):
        raise HTTPException(status_code=404, detail="Document not found")

    return [
        DocumentChunkResponse(
            id=c.id,
            document_id=c.document_id,
            strategy=c.strategy,
            chunk_index=c.chunk_index,
            content=c.content,
            content_preview=c.content_preview or c.content[:200],
            source=c.source,
            page_number=c.page_number,
            section_header=c.section_header,
            token_count=c.token_count,
            is_parent=c.is_parent,
        )
        for c in chunks
    ]


@router.delete("/{document_id}")
async def delete_document_endpoint(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a document and all associated chunks from DB and ChromaDB."""
    doc = await db.get(DBDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    success = await delete_document(document_id, db)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete document")

    return {"message": f"Document {document_id} deleted successfully"}