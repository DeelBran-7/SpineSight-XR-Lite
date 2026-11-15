from asyncio import Semaphore
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request

from app.core.config import Settings
from app.services.llm_service import LLMService
from app.services.pose_detector import PoseDetector
from app.services.report_requests import ReportRequests
from app.services.session_cache import SessionCache


@dataclass
class Runtime:
    settings: Settings
    detector: PoseDetector
    cache: SessionCache
    llm: LLMService
    photo_slots: Semaphore
    reports: ReportRequests = field(default_factory=ReportRequests)


def get_runtime(request: Request) -> Runtime:
    return request.app.state.runtime


RuntimeDependency = Annotated[Runtime, Depends(get_runtime)]
