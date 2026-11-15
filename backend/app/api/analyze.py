from io import BytesIO

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from app.core.errors import ApiError, error_responses
from app.core.runtime import RuntimeDependency
from app.schemas import PostureAnalysisResponse
from app.services.image_input import read_image_upload
from app.services.posture_analyzer import analyze_photo

router = APIRouter(prefix="/v1")


@router.post(
    "/analyze",
    responses=error_responses(400, 413, 422, 503, 500),
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file"],
                        "properties": {"file": {"type": "string", "format": "binary"}},
                    }
                }
            },
        }
    },
)
async def analyze(request: Request, runtime: RuntimeDependency) -> PostureAnalysisResponse:
    if not runtime.detector.ready:
        raise ApiError(503, "MODEL_ASSET_MISSING", "The pose model is unavailable.")

    # Bound the number of simultaneous photo buffers as well as their individual sizes.
    async with runtime.photo_slots:
        with BytesIO() as source:
            await read_image_upload(request, source)
            result = await run_in_threadpool(
                analyze_photo, source, runtime.detector, runtime.settings.landmark_visibility_threshold
            )
    runtime.cache.add(result)
    return result
