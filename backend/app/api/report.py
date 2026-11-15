from fastapi import APIRouter
from pydantic import ValidationError

from app.core.errors import ApiError, error_responses
from app.core.json_route import BoundedJSONRoute
from app.core.runtime import RuntimeDependency
from app.schemas import Report, ReportRequest, ReportResponse
from app.services.llm_service import LLMError

router = APIRouter(prefix="/v1", route_class=BoundedJSONRoute)


@router.post("/report", responses=error_responses(400, 404, 413, 429, 502, 503, 500))
async def report(payload: ReportRequest, runtime: RuntimeDependency) -> ReportResponse:
    analysis = runtime.cache.require(payload.analysis_id)
    try:
        data = await runtime.llm.generate_report(analysis.model_dump(mode="json"))
        generated = Report.model_validate(data)
    except LLMError as error:
        raise ApiError(error.status_code, error.code, error.message) from None
    except ValidationError:
        raise ApiError(
            502,
            "REPORT_GENERATION_FAILED",
            "The AI report could not be generated. Your posture measurements are still available. Please try again.",
        ) from None
    return ReportResponse(analysis_id=analysis.analysis_id, report=generated)
