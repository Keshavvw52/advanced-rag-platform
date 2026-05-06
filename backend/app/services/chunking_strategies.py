import re
import uuid
import logging
from typing import Optional
from dataclasses import dataclass, field

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_experimental.text_splitter import SemanticChunker
from langchain_huggingface import HuggingFaceEmbeddings

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class ChunkResult:
    """Container for chunks produced by a strategy."""
    strategy: str
    chunks: list[Document]
    parent_chunks: list[Document] = field(default_factory=list)  # for parent-child


# ─── Helper: Token Counter ─────────────────────────────────────────────────────

def count_tokens(text: str) -> int:
    """Rough token count (word-based approximation for speed)."""
    return len(text.split())


# ─── Helper: Metadata Enricher ─────────────────────────────────────────────────

def enrich_metadata(
    doc: Document,
    document_id: str,
    strategy: str,
    chunk_index: int,
    extra: dict = None
) -> Document:
    """Add standard metadata fields to a LangChain Document."""
    doc.metadata.update({
        "document_id": document_id,
        "strategy": strategy,
        "chunk_index": chunk_index,
        "chunk_id": str(uuid.uuid4()),
        "token_count": count_tokens(doc.page_content),
        **(extra or {}),
    })
    return doc


# ─── Strategy 1: Recursive Character Splitting ────────────────────────────────

def recursive_chunking(
    documents: list[Document],
    document_id: str,
    chunk_size: int = None,
    chunk_overlap: int = None,
) -> ChunkResult:
    """
    LangChain RecursiveCharacterTextSplitter.
    Splits on paragraph -> sentence -> word boundaries for clean breaks.
    Default: 500 tokens chunk size, 50 token overlap.
    """
    chunk_size = chunk_size or settings.RECURSIVE_CHUNK_SIZE
    chunk_overlap = chunk_overlap or settings.RECURSIVE_CHUNK_OVERLAP

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size * 4,       # ~4 chars per token
        chunk_overlap=chunk_overlap * 4,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
        add_start_index=True,
    )

    raw_chunks = splitter.split_documents(documents)
    enriched = []

    for idx, chunk in enumerate(raw_chunks):
        enriched.append(enrich_metadata(chunk, document_id, "recursive", idx))

    logger.info(f"Recursive chunking: {len(enriched)} chunks from {len(documents)} docs")
    return ChunkResult(strategy="recursive", chunks=enriched)


# ─── Strategy 2: Semantic Chunking ────────────────────────────────────────────

def semantic_chunking(
    documents: list[Document],
    document_id: str,
    embeddings: Optional[HuggingFaceEmbeddings] = None,
) -> ChunkResult:
    """
    SemanticChunker splits on embedding similarity thresholds.
    Consecutive sentences with similar embeddings stay together.
    A new chunk starts when similarity drops below threshold.
    """
    if embeddings is None:
        embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": settings.EMBEDDING_DEVICE},
        )

    splitter = SemanticChunker(
        embeddings=embeddings,
        breakpoint_threshold_type="percentile",
        breakpoint_threshold_amount=85,  # split at 85th percentile similarity drops
    )

    raw_chunks = splitter.split_documents(documents)
    enriched = []

    for idx, chunk in enumerate(raw_chunks):
        enriched.append(enrich_metadata(chunk, document_id, "semantic", idx))

    logger.info(f"Semantic chunking: {len(enriched)} chunks from {len(documents)} docs")
    return ChunkResult(strategy="semantic", chunks=enriched)


# ─── Strategy 3: Parent-Child Chunking ───────────────────────────────────────

def parent_child_chunking(
    documents: list[Document],
    document_id: str,
    parent_size: int = None,
    child_size: int = None,
) -> ChunkResult:
    """
    Creates small child chunks (200 tokens) for retrieval precision.
    Each child links to its large parent chunk (1000 tokens) for full context.
    At query time: retrieve by child, but return parent to the LLM.
    """
    parent_size = (parent_size or settings.PARENT_CHUNK_SIZE) * 4
    child_size = (child_size or settings.CHILD_CHUNK_SIZE) * 4

    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=parent_size,
        chunk_overlap=100,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=child_size,
        chunk_overlap=20,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    parent_chunks = []
    child_chunks = []

    # First pass: create parent chunks
    raw_parents = parent_splitter.split_documents(documents)
    for p_idx, parent in enumerate(raw_parents):
        parent_id = str(uuid.uuid4())
        parent = enrich_metadata(
            parent, document_id, "parent_child", p_idx,
            extra={"is_parent": True, "parent_id": parent_id, "chunk_id": parent_id}
        )
        parent.metadata["chunk_id"] = parent_id
        parent_chunks.append(parent)

        # Second pass: create child chunks from each parent
        raw_children = child_splitter.split_text(parent.page_content)
        for c_idx, child_text in enumerate(raw_children):
            child_doc = Document(
                page_content=child_text,
                metadata={**parent.metadata},  # inherit parent metadata
            )
            child_doc = enrich_metadata(
                child_doc, document_id, "parent_child", c_idx,
                extra={
                    "is_parent": False,
                    "parent_id": parent_id,
                    "parent_chunk_index": p_idx,
                }
            )
            child_chunks.append(child_doc)

    logger.info(
        f"Parent-child chunking: {len(parent_chunks)} parents, "
        f"{len(child_chunks)} children from {len(documents)} docs"
    )

    return ChunkResult(
        strategy="parent_child",
        chunks=child_chunks,         # index child chunks for retrieval
        parent_chunks=parent_chunks, # keep parents for context
    )


# ─── Strategy 4: Section-Based Chunking ──────────────────────────────────────

def section_chunking(
    documents: list[Document],
    document_id: str,
) -> ChunkResult:
    """
    Split documents by detected section headers (H1, H2, H3 patterns).
    Best for structured documents: reports, manuals, legal docs.
    Each detected section becomes one chunk with its header as metadata.
    """
    # Patterns to detect markdown and text headers
    header_patterns = [
        r"^#{1,3}\s+(.+)$",                    # Markdown: # Header
        r"^([A-Z][A-Z\s]{4,50})\s*$",          # ALL CAPS headers
        r"^\d+\.\s+([A-Z].{3,60})$",            # Numbered: "1. Introduction"
        r"^([A-Z].{3,50})\n[-=]{3,}$",          # Underlined headers
    ]

    chunks = []

    for doc in documents:
        text = doc.page_content
        lines = text.split("\n")

        sections = []
        current_section = {"header": "Introduction", "lines": []}

        for line in lines:
            is_header = False
            for pattern in header_patterns:
                match = re.match(pattern, line.strip(), re.MULTILINE)
                if match:
                    # Save previous section if it has content
                    if current_section["lines"]:
                        sections.append(current_section)
                    header_text = match.group(1) if match.lastindex else line.strip()
                    current_section = {"header": header_text, "lines": []}
                    is_header = True
                    break

            if not is_header:
                current_section["lines"].append(line)

        # Don't forget the last section
        if current_section["lines"]:
            sections.append(current_section)

        # Fall back to recursive if no sections detected
        if len(sections) <= 1:
            logger.debug("No sections detected, falling back to recursive chunking for section strategy")
            fallback = recursive_chunking([doc], document_id)
            for chunk in fallback.chunks:
                chunk.metadata["strategy"] = "section"
            chunks.extend(fallback.chunks)
            continue

        for idx, section in enumerate(sections):
            content = "\n".join(section["lines"]).strip()
            if not content:
                continue

            chunk = Document(
                page_content=content,
                metadata={**doc.metadata},
            )
            chunk = enrich_metadata(
                chunk, document_id, "section", idx,
                extra={"section_header": section["header"]}
            )
            chunks.append(chunk)

    logger.info(f"Section chunking: {len(chunks)} chunks from {len(documents)} docs")
    return ChunkResult(strategy="section", chunks=chunks)


# ─── Unified Chunking Runner ──────────────────────────────────────────────────

def chunk_documents(
    documents: list[Document],
    document_id: str,
    strategies: list[str] = None,
    embeddings: Optional[HuggingFaceEmbeddings] = None,
) -> dict[str, ChunkResult]:
    """
    Run all (or specified) chunking strategies on a document list.
    Returns a dict mapping strategy name -> ChunkResult.
    """
    if strategies is None:
        strategies = ["recursive", "semantic", "parent_child", "section"]

    results = {}

    for strategy in strategies:
        try:
            if strategy == "recursive":
                results["recursive"] = recursive_chunking(documents, document_id)
            elif strategy == "semantic":
                results["semantic"] = semantic_chunking(documents, document_id, embeddings)
            elif strategy == "parent_child":
                results["parent_child"] = parent_child_chunking(documents, document_id)
            elif strategy == "section":
                results["section"] = section_chunking(documents, document_id)
            else:
                logger.warning(f"Unknown strategy: {strategy}")
        except Exception as e:
            logger.error(f"Chunking strategy '{strategy}' failed: {e}", exc_info=True)
            results[strategy] = ChunkResult(strategy=strategy, chunks=[])

    return results