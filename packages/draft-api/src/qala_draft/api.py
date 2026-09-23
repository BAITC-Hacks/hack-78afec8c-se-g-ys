from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from .core import Catalog, Decision, DraftValidation, validate_draft


class DecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    measure_id: str
    district_id: str | None = None


class DraftInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    decisions: list[DecisionInput]


def create_draft_router(catalog: Catalog) -> APIRouter:
    """Mount once with the host's trusted, server-owned catalogue."""
    router = APIRouter(prefix="/api/drafts", tags=["drafts"])

    @router.post("/validate", response_model=DraftValidation)
    def validate(request: DraftInput) -> DraftValidation:
        decisions = tuple(Decision(item.measure_id, item.district_id) for item in request.decisions)
        return validate_draft(catalog, decisions)

    return router
