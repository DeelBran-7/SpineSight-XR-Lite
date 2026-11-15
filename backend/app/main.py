import logging
from asyncio import Semaphore
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from app.api import analyze, assistant, health, report
from app.core.config import Settings
from app.core.errors import ApiError
from app.core.runtime import Runtime
from app.schemas import ErrorDetail, ErrorResponse
from app.services.llm_service import LLMService
from app.services.pose_detector import PoseDetector
from app.services.session_cache import SessionCache

logger = logging.getLogger(__name__)


def failure(status: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    error = ErrorResponse(error=ErrorDetail(code=code, message=message))
    return JSONResponse(error.model_dump(), status_code=status, headers=headers)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        detector = PoseDetector()
        try:
            await run_in_threadpool(detector.load, settings.model_asset)
        except (ImportError, OSError, RuntimeError, ValueError):
            logger.warning("Pose model initialization failed.")
        key = settings.deepseek_api_key
        llm = LLMService(
            api_key=key.get_secret_value() if key else None,
            base_url=settings.deepseek_base_url,
            model=settings.deepseek_model,
            timeout_seconds=settings.deepseek_timeout_seconds,
        )
        app.state.runtime = Runtime(settings, detector, SessionCache(), llm, Semaphore(2))
        try:
            yield
        finally:
            try:
                await app.state.runtime.reports.aclose()
                await llm.aclose()
            finally:
                await run_in_threadpool(detector.close)

    app = FastAPI(title="SpineSight XR Lite", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(ApiError)
    async def api_error(_: Request, error: ApiError) -> JSONResponse:
        return failure(error.status_code, error.code, error.detail)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, __: RequestValidationError) -> JSONResponse:
        return failure(400, "INVALID_REQUEST", "The request fields are invalid. Check your input and try again.")

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, error: HTTPException) -> JSONResponse:
        return failure(error.status_code, "INVALID_REQUEST", "The request could not be processed.", error.headers)

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, __: Exception) -> JSONResponse:
        logger.error("An unexpected request error occurred.")
        return failure(500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.")

    for router in (health.router, analyze.router, report.router, assistant.router):
        app.include_router(router, prefix="/api")

    return app


app = create_app()
