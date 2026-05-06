"""
Advanced RAG Platform - FastAPI Application Entry Point
Initializes app, middleware, routers, and startup tasks.
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.database import init_db
from app.routers import auth, documents, query, evaluation

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan: startup and shutdown tasks."""
    # ── Startup ──
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # Ensure directories exist
    for dir_path in [settings.DB_DIR, settings.CHROMA_PERSIST_DIR, settings.UPLOAD_DIR]:
        os.makedirs(dir_path, exist_ok=True)

    # Initialize SQLite database
    await init_db()
    logger.info("Database initialized")

    # Pre-warm embedding model (loads on first use anyway)
    # Uncomment to pre-load on startup (slower start, faster first query):
    # from app.services.ingestion import get_embeddings
    # get_embeddings()
    # logger.info("Embedding model loaded")

    logger.info("Application ready!")
    yield

    # ── Shutdown ──
    logger.info("Shutting down...")


# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
Advanced RAG Platform with:
- Multiple chunking strategies (Recursive, Semantic, Parent-Child, Section)
- Hybrid search (Vector + BM25) with Reciprocal Rank Fusion
- Cross-encoder reranking
- Query transformations (MultiQuery, HyDE, Decomposition)
- RAG evaluation pipeline
- Full pipeline transparency
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(query.router)
app.include_router(evaluation.router)


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "status": "running",
    }
