"""
Evaluation router: single eval, batch eval, results retrieval.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import get_db, EvaluationResult as DBEval, User
from app.models.schemas import (
    EvaluationRequest, EvaluationResponse,
    BatchEvaluationRequest, BatchEvaluationResponse,
    RetrievalStrategy, MetadataFilter
)
from app.services.auth import get_current_user
from app.services.evaluator import evaluate_single, run_batch_evaluation
from app.services.llm_errors import llm_http_exception

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/evaluate", tags=["evaluation"])


@router.post("", response_model=EvaluationResponse)
async def evaluate_query(
    request: EvaluationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evaluate a single question-answer pair."""
    try:
        result = await evaluate_single(
            question=request.question,
            reference_answer=request.reference_answer,
            strategy=request.strategy,
            filters=_owned_filters(request.filters, current_user.id),
        )
    except Exception as exc:
        mapped = llm_http_exception(exc)
        if mapped:
            raise mapped
        raise

    # Persist evaluation result
    db_eval = DBEval(
        id=result.id,
        user_id=current_user.id,
        strategy=result.strategy,
        question=result.question,
        reference_answer=result.reference_answer,
        generated_answer=result.generated_answer,
        faithfulness=result.metrics.faithfulness,
        answer_relevancy=result.metrics.answer_relevancy,
        context_precision=result.metrics.context_precision,
        context_recall=result.metrics.context_recall,
        faithfulness_details=result.details.get("faithfulness"),
        relevancy_details=result.details.get("relevancy"),
    )
    db.add(db_eval)
    await db.commit()

    return result


@router.post("/batch", response_model=BatchEvaluationResponse)
async def batch_evaluate(
    request: BatchEvaluationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run batch evaluation across multiple strategies."""
    try:
        result = await run_batch_evaluation(
            strategies=request.strategies,
            dataset_path=request.dataset_path,
            filters=_owned_filters(None, current_user.id),
        )

        # Persist all results
        for item in result.per_question_results:
            db_eval = DBEval(
                id=item.id,
                user_id=current_user.id,
                strategy=item.strategy,
                question=item.question,
                reference_answer=item.reference_answer,
                generated_answer=item.generated_answer,
                faithfulness=item.metrics.faithfulness,
                answer_relevancy=item.metrics.answer_relevancy,
                context_precision=item.metrics.context_precision,
                context_recall=item.metrics.context_recall,
                batch_id=result.batch_id,
            )
            db.add(db_eval)
        await db.commit()

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as exc:
        mapped = llm_http_exception(exc)
        if mapped:
            raise mapped
        raise


@router.get("/results", response_model=list[EvaluationResponse])
async def get_evaluation_results(
    strategy: str = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get past evaluation results."""
    query = (
        select(DBEval)
        .where(DBEval.user_id == current_user.id)
        .order_by(DBEval.created_at.desc())
        .limit(limit)
    )
    if strategy:
        query = query.where(DBEval.strategy == strategy)

    result = await db.execute(query)
    evals = result.scalars().all()

    from app.models.schemas import EvaluationMetrics
    return [
        EvaluationResponse(
            id=e.id,
            question=e.question,
            reference_answer=e.reference_answer or "",
            generated_answer=e.generated_answer,
            strategy=e.strategy,
            metrics=EvaluationMetrics(
                faithfulness=e.faithfulness or 0,
                answer_relevancy=e.answer_relevancy or 0,
                context_precision=e.context_precision or 0,
                context_recall=e.context_recall or 0,
                average=round((
                    (e.faithfulness or 0) + (e.answer_relevancy or 0) +
                    (e.context_precision or 0) + (e.context_recall or 0)
                ) / 4, 4),
            ),
            retrieved_chunks=[],
            details={},
        )
        for e in evals
    ]


def _owned_filters(filters: MetadataFilter | None, user_id: str) -> MetadataFilter:
    if filters:
        return filters.model_copy(update={"user_id": user_id})
    return MetadataFilter(user_id=user_id)
