from fastapi import APIRouter
from pydantic import ValidationError

from app.core.errors import ApiError, error_responses
from app.core.json_route import BoundedJSONRoute
from app.core.runtime import RuntimeDependency
from app.schemas import AssistantRequest, AssistantResponse
from app.services.llm_service import LLMError

router = APIRouter(prefix="/v1", route_class=BoundedJSONRoute)


@router.post("/assistant", responses=error_responses(400, 404, 413, 429, 502, 503, 500))
async def assistant(payload: AssistantRequest, runtime: RuntimeDependency) -> AssistantResponse:
    analysis = None
    if payload.analysis_id is not None:
        analysis = runtime.cache.require(payload.analysis_id).model_dump(mode="json")
    try:
        reply = await runtime.llm.assistant_reply(
            analysis,
            payload.message,
            [message.model_dump() for message in payload.history],
        )
        return AssistantResponse(analysis_id=payload.analysis_id, reply=reply)
    except LLMError as error:
        raise ApiError(error.status_code, error.code, error.message) from None
    except ValidationError:
        raise ApiError(
            502,
            "ASSISTANT_REQUEST_FAILED",
            "The assistant could not respond. Please try again.",
        ) from None
