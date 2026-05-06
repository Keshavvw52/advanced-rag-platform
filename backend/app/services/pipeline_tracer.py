"""
Pipeline tracer for full RAG transparency.
Records every step of the retrieval pipeline with timing, inputs, and outputs.
Enables users to debug why answers are good or bad.
"""
import time
import logging
from typing import Any, Optional
from contextlib import asynccontextmanager

from app.models.schemas import PipelineStep, PipelineTrace, RetrievedChunk

logger = logging.getLogger(__name__)


class PipelineTracer:
    """
    Records all pipeline steps during a RAG query.
    Usage: async with tracer.step("Vector Search") as step: ...
    """

    def __init__(self, query_id: str, original_query: str, strategy: str):
        self.query_id = query_id
        self.original_query = original_query
        self.strategy = strategy
        self.steps: list[PipelineStep] = []
        self.transformed_queries: list[str] = []
        self.retrieved_chunks: list[RetrievedChunk] = []
        self.reranked_chunks: list[RetrievedChunk] = []
        self.final_context: str = ""
        self.prompt_sent: str = ""
        self.start_time: float = time.time()
        self.input_tokens: int = 0
        self.output_tokens: int = 0

    def add_step(
        self,
        step_name: str,
        description: str,
        input_data: Any = None,
        output_data: Any = None,
        latency_ms: float = None,
        metadata: dict = None,
    ) -> PipelineStep:
        """Add a completed step to the trace."""
        step = PipelineStep(
            step_name=step_name,
            description=description,
            input=input_data,
            output=output_data,
            latency_ms=latency_ms,
            metadata=metadata or {},
        )
        self.steps.append(step)
        logger.debug(f"Pipeline step: {step_name} ({latency_ms:.1f}ms)")
        return step

    @asynccontextmanager
    async def timed_step(
        self,
        step_name: str,
        description: str,
        input_data: Any = None,
        metadata: dict = None,
    ):
        """Context manager for timing and recording a pipeline step."""
        t0 = time.time()
        output_holder = {"output": None}
        try:
            yield output_holder
        finally:
            latency_ms = (time.time() - t0) * 1000
            self.add_step(
                step_name=step_name,
                description=description,
                input_data=input_data,
                output_data=output_holder["output"],
                latency_ms=round(latency_ms, 2),
                metadata=metadata or {},
            )

    def set_transformed_queries(self, queries: list[str]):
        """Record transformed/expanded queries."""
        self.transformed_queries = queries

    def set_retrieved_chunks(self, chunks: list[RetrievedChunk]):
        """Record initially retrieved chunks (before reranking)."""
        self.retrieved_chunks = chunks

    def set_reranked_chunks(self, chunks: list[RetrievedChunk]):
        """Record final reranked chunks (sent to LLM)."""
        self.reranked_chunks = chunks

    def set_context(self, context: str, prompt: str):
        """Record final context and full prompt sent to LLM."""
        self.final_context = context
        self.prompt_sent = prompt

    def set_token_counts(self, input_tokens: int, output_tokens: int):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens

    def build_trace(self) -> PipelineTrace:
        """Build and return the complete pipeline trace."""
        total_latency = (time.time() - self.start_time) * 1000

        return PipelineTrace(
            query_id=self.query_id,
            original_query=self.original_query,
            transformed_queries=self.transformed_queries,
            strategy=self.strategy,
            steps=self.steps,
            retrieved_chunks=self.retrieved_chunks,
            reranked_chunks=self.reranked_chunks,
            final_context=self.final_context,
            prompt_sent=self.prompt_sent,
            total_latency_ms=round(total_latency, 2),
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
        )

    def to_dict(self) -> dict:
        """Convert trace to dict for JSON storage in SQLite."""
        return self.build_trace().model_dump()