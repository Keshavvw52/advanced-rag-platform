from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    # --- API Keys ---
    GROQ_API_KEY: str = Field(..., description="Groq API key for LLM inference")

    # --- App Settings ---
    APP_NAME: str = "Advanced RAG Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # --- Database ---
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/rag_platform.db"
    DB_DIR: str = "./data"

    # --- ChromaDB ---
    CHROMA_PERSIST_DIR: str = "./data/chroma_db"
    CHROMA_COLLECTION_NAME: str = "rag_documents"

    # --- Embeddings ---
    EMBEDDING_PROVIDER: str = "hashing"
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DEVICE: str = "cpu"
    EMBEDDING_DIMENSION: int = 384

    # --- Reranker ---
    RERANKER_ENABLED: bool = False
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    RERANKER_TOP_K: int = 5
    RETRIEVAL_TOP_K: int = 20

    # --- LLM ---
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 512

    # --- Chunking Defaults ---
    RECURSIVE_CHUNK_SIZE: int = 500
    RECURSIVE_CHUNK_OVERLAP: int = 50
    PARENT_CHUNK_SIZE: int = 1000
    CHILD_CHUNK_SIZE: int = 200
    SEMANTIC_BREAKPOINT_THRESHOLD: float = 0.85

    # --- Retrieval ---
    BM25_WEIGHT: float = 0.3
    SEMANTIC_WEIGHT: float = 0.7
    RRF_K: int = 60

    # --- File Upload ---
    UPLOAD_DIR: str = "./data/uploads"
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: list[str] = [".pdf", ".txt", ".docx", ".md", ".markdown"]

    # --- Evaluation ---
    EVAL_DATASET_PATH: str = "./app/data/eval_dataset.json"

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"dev", "development", "debug", "local"}:
                return True
            if normalized in {"prod", "production", "release"}:
                return False
        return value

    class Config:
        env_file = BASE_DIR / ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
