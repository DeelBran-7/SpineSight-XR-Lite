from fastapi import APIRouter

from app.core.runtime import RuntimeDependency
from app.schemas import HealthResponse

router = APIRouter()


@router.get("/health")
async def health(runtime: RuntimeDependency) -> HealthResponse:
    return HealthResponse(pose_model_ready=runtime.detector.ready, llm_configured=runtime.llm.configured)
