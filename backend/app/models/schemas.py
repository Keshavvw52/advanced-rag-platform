from datetime import datetime
from typing import Optional, Any
from enum import Enum
from pydantic import BaseModel, Field


# ─── Enums ─────────────────────────────────────────────────────────────────────

class ChunkStrategy(str, Enum):
    RECURSIVE = "recursive"
    SEMANTIC = "semantic"
    PARENT_CHILD = "parent_child"
    SECTION = "section"
    ALL = "all"


class RetrievalStrategy(str, Enum):
    BASIC_VECTOR = "basic_vector"
    HYBRID = "hybrid"
    HYBRID_RERANK = "hybrid_rerank"
    PARENT_CHILD = "parent_child"
    MULTI_QUERY = "multi_query"
    HYDE = "hyde"
    DECOMPOSITION = "decomposition"


class DocumentStatus(str, Enum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


# ─── Auth Schemas ──────────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None


class AuthRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    name: Optional[str] = Field(None, max_length=120)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ─── Document Schemas ──────────────────────────────────────────────────────────

class DocumentUploadResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    status: str
    message: str


class ChunkCounts(BaseModel):
    recursive: int = 0
    semantic: int = 0
    parent_child: int = 0
    section: int = 0
    total: int = 0


class DocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    file_type: str
    file_size: int
    total_pages: int
    upload_date: datetime
    tags: list[str]
    status: str
    chunk_counts: ChunkCounts
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class DocumentChunkResponse(BaseModel):
    id: str
    document_id: str
    strategy: str
    chunk_index: int
    content: str
    content_preview: str
    source: Optional[str]
    page_number: Optional[int]
    section_header: Optional[str]
    token_count: int
    is_parent: bool = False

    class Config:
        from_attributes = True


# ─── Query Schemas ─────────────────────────────────────────────────────────────

class MetadataFilter(BaseModel):
    """Filters applied to retrieval."""
    source: Optional[str] = Field(None, description="Filter by source document name")
    page_min: Optional[int] = Field(None, description="Minimum page number")
    page_max: Optional[int] = Field(None, description="Maximum page number")
    section: Optional[str] = Field(None, description="Filter by section header")
    tags: Optional[list[str]] = Field(None, description="Filter by document tags")
    chunk_strategy: Optional[ChunkStrategy] = Field(None, description="Filter by chunk strategy")
    document_ids: Optional[list[str]] = Field(None, description="Restrict to specific document IDs")
    user_id: Optional[str] = Field(None, description="Internal user ownership filter")


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    strategy: RetrievalStrategy = RetrievalStrategy.HYBRID_RERANK
    filters: Optional[MetadataFilter] = None
    top_k: int = Field(5, ge=1, le=20)
    semantic_weight: float = Field(0.7, ge=0.0, le=1.0)
    stream: bool = False


class RetrievedChunk(BaseModel):
    chunk_id: str
    content: str
    source: Optional[str]
    page_number: Optional[int]
    section_header: Optional[str]
    strategy: str
    similarity_score: Optional[float] = None
    bm25_score: Optional[float] = None
    rerank_score: Optional[float] = None
    original_rank: Optional[int] = None
    reranked_rank: Optional[int] = None


class PipelineStep(BaseModel):
    """Single step in the pipeline trace."""
    step_name: str
    description: str
    input: Any = None
    output: Any = None
    latency_ms: Optional[float] = None
    Field(default_factory=dict)


class PipelineTrace(BaseModel):
    """Full pipeline transparency trace."""
    query_id: str
    original_query: str
    transformed_queries: list[str] = []
    strategy: str
    steps: list[PipelineStep] = []
    retrieved_chunks: list[RetrievedChunk] = []
    reranked_chunks: list[RetrievedChunk] = []
    final_context: str = ""
    prompt_sent: str = ""
    total_latency_ms: float = 0
    input_tokens: int = 0
    output_tokens: int = 0


class QueryResponse(BaseModel):
    query_id: str
    query: str
    answer: str
    strategy: str
    retrieved_chunks: list[RetrievedChunk]
    pipeline_trace: PipelineTrace
    latency_ms: float
    input_tokens: int
    output_tokens: int


class CompareRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    strategy_a: RetrievalStrategy
    strategy_b: RetrievalStrategy
    filters: Optional[MetadataFilter] = None


class CompareResponse(BaseModel):
    query: str
    result_a: QueryResponse
    result_b: QueryResponse
    overlap_chunk_ids: list[str]


# ─── Evaluation Schemas ────────────────────────────────────────────────────────

class EvaluationRequest(BaseModel):
    question: str
    reference_answer: str
    strategy: RetrievalStrategy = RetrievalStrategy.HYBRID_RERANK
    filters: Optional[MetadataFilter] = None


class EvaluationMetrics(BaseModel):
    faithfulness: float = Field(0.0, ge=0.0, le=1.0)
    answer_relevancy: float = Field(0.0, ge=0.0, le=1.0)
    context_precision: float = Field(0.0, ge=0.0, le=1.0)
    context_recall: float = Field(0.0, ge=0.0, le=1.0)
    average: float = Field(0.0, ge=0.0, le=1.0)


class EvaluationResponse(BaseModel):
    id: str
    question: str
    reference_answer: str
    generated_answer: str
    strategy: str
    metrics: EvaluationMetrics
    retrieved_chunks: list[RetrievedChunk]
    details: dict = {}


class BatchEvaluationRequest(BaseModel):
    strategies: list[RetrievalStrategy] = [RetrievalStrategy.HYBRID_RERANK]
    dataset_path: Optional[str] = None  # defaults to built-in dataset


class StrategyEvalSummary(BaseModel):
    strategy: str
    avg_faithfulness: float
    avg_relevancy: float
    avg_precision: float
    avg_recall: float
    avg_overall: float
    num_questions: int


class BatchEvaluationResponse(BaseModel):
    batch_id: str
    strategies_evaluated: list[str]
    summaries: list[StrategyEvalSummary]
    per_question_results: list[EvaluationResponse]
    leaderboard: list[StrategyEvalSummary]  # sorted by avg_overall


# ─── Stats & Info Schemas ──────────────────────────────────────────────────────

class StatsResponse(BaseModel):
    total_documents: int
    total_chunks: int
    total_queries: int
    avg_latency_ms: float
    total_tokens_used: int
    chunks_by_strategy: dict[str, int]
    queries_by_strategy: dict[str, int]


class HealthResponse(BaseModel):
    status: str
    version: str
    chroma_ok: bool
    db_ok: bool
    llm_ok: bool
