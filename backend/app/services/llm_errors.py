"""Helpers for turning provider LLM errors into API responses."""
from fastapi import HTTPException
from groq import APIStatusError, BadRequestError, RateLimitError


def llm_http_exception(exc: Exception) -> HTTPException | None:
    """Map known Groq errors to client-facing HTTP errors."""
    if isinstance(exc, RateLimitError):
        return HTTPException(
            status_code=429,
            detail=(
                "Groq rate limit reached for the current model. "
                "Please wait a few minutes and try again, or run fewer compare/evaluation requests."
            ),
        )

    if isinstance(exc, BadRequestError):
        return HTTPException(
            status_code=400,
            detail=f"Groq rejected the request: {_provider_message(exc)}",
        )

    if isinstance(exc, APIStatusError):
        return HTTPException(
            status_code=502,
            detail=f"Groq request failed: {_provider_message(exc)}",
        )

    return None


def _provider_message(exc: APIStatusError) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
    return str(exc)
