from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StringConstraints


class ImmutableModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


UnitFloat = Annotated[FiniteFloat, Field(ge=0, le=1)]
ChatText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)]
ReportText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2400)]


class ErrorDetail(ImmutableModel):
    code: str
    message: str


class ErrorResponse(ImmutableModel):
    success: Literal[False] = False
    error: ErrorDetail


class HealthResponse(ImmutableModel):
    status: Literal["ok"] = "ok"
    service: Literal["SpineSight XR Lite"] = "SpineSight XR Lite"
    version: Literal["1.0.0"] = "1.0.0"
    pose_model_ready: bool
    llm_configured: bool


class ImageSize(ImmutableModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class Landmark(ImmutableModel):
    x: UnitFloat
    y: UnitFloat
    visibility: UnitFloat


class CoreLandmarks(ImmutableModel):
    left_shoulder: Landmark
    right_shoulder: Landmark
    left_hip: Landmark
    right_hip: Landmark


class Measurements(ImmutableModel):
    shoulder_asymmetry_percent: FiniteFloat
    shoulder_angle_deg: FiniteFloat
    hip_asymmetry_percent: FiniteFloat
    hip_angle_deg: FiniteFloat
    torso_lean_angle_deg: FiniteFloat


class Quality(ImmutableModel):
    valid: Literal[True] = True
    message: str
    landmark_visibility_threshold: UnitFloat


class FeatureObservation(ImmutableModel):
    status: Literal["measurement_available"] = "measurement_available"
    direction: str


class Observations(ImmutableModel):
    shoulder: FeatureObservation
    hip: FeatureObservation
    torso: FeatureObservation


class PostureAnalysisResponse(ImmutableModel):
    success: Literal[True] = True
    analysis_id: UUID
    image: ImageSize
    landmarks: CoreLandmarks
    measurements: Measurements
    quality: Quality
    observations: Observations


class ReportRequest(ImmutableModel):
    analysis_id: UUID


class ReportFindings(ImmutableModel):
    shoulder: ReportText
    hip: ReportText
    torso: ReportText


class Report(ImmutableModel):
    simple_summary: ReportText
    technical_summary: ReportText
    findings: ReportFindings
    limitations: tuple[ReportText, ...] = Field(min_length=1, max_length=10)
    disclaimer: ReportText


class ReportResponse(ImmutableModel):
    success: Literal[True] = True
    analysis_id: UUID
    report: Report


class ChatMessage(ImmutableModel):
    role: Literal["user", "assistant"]
    content: ChatText


class AssistantRequest(ImmutableModel):
    analysis_id: UUID | None = None
    message: ChatText
    history: list[ChatMessage] = Field(default_factory=list, max_length=8)


class AssistantResponse(ImmutableModel):
    success: Literal[True] = True
    analysis_id: UUID | None
    reply: ReportText
