from collections.abc import Sequence
from io import BytesIO
from math import atan2, degrees, isfinite
from uuid import uuid4

from app.core.errors import ApiError
from app.schemas import CoreLandmarks, ImageSize, Landmark, Measurements, PostureAnalysisResponse, Quality
from app.services.image_input import decode_image
from app.services.pose_detector import DetectedLandmark, PoseDetector
from app.services.rule_engine import observe

CORE_INDICES = {"left_shoulder": 11, "right_shoulder": 12, "left_hip": 23, "right_hip": 24}


def extract_landmarks(pose: Sequence[DetectedLandmark | None], threshold: float) -> CoreLandmarks:
    values = {}
    for name, index in CORE_INDICES.items():
        point = pose[index] if index < len(pose) else None
        if point is not None:
            x, y, visibility = point.x, point.y, point.visibility
            # An extrapolated landmark outside the image does not qualify as visible in-frame geometry.
            if all(value is not None and isfinite(value) and 0 <= value <= 1 for value in (x, y, visibility)):
                if visibility < threshold:
                    raise ApiError(
                        422,
                        "LOW_LANDMARK_VISIBILITY",
                        "The shoulder and hip landmarks were not visible enough. Retake the photo.",
                    )
                values[name] = Landmark(x=x, y=y, visibility=visibility)
                continue
        raise ApiError(
            422,
            "INSUFFICIENT_LANDMARKS",
            "Required shoulder or hip landmarks could not be detected reliably in the image.",
        )
    return CoreLandmarks(**values)


def degenerate_geometry() -> ApiError:
    return ApiError(
        422,
        "DEGENERATE_GEOMETRY",
        "The shoulder and hip landmarks are too close or poorly positioned. Retake the photo.",
    )


def line_metrics(left: Landmark, right: Landmark, width: int, height: int) -> tuple[float, float]:
    dx = (right.x - left.x) * width
    dy = (right.y - left.y) * height
    if abs(dx) < max(1, width * 0.001):
        raise degenerate_geometry()
    # Orient each segment toward screen right so the angle is signed and remains within ±90°.
    if dx < 0:
        dx, dy = -dx, -dy
    return 100 * abs(dy) / dx, degrees(atan2(dy, dx))


def measure(landmarks: CoreLandmarks, image: ImageSize) -> Measurements:
    ls, rs, lh, rh = landmarks.left_shoulder, landmarks.right_shoulder, landmarks.left_hip, landmarks.right_hip
    shoulder_offset, shoulder_angle = line_metrics(ls, rs, image.width, image.height)
    hip_offset, hip_angle = line_metrics(lh, rh, image.width, image.height)

    torso_dx = ((ls.x + rs.x) - (lh.x + rh.x)) * image.width / 2
    torso_up = ((lh.y + rh.y) - (ls.y + rs.y)) * image.height / 2
    if torso_up < max(1, image.height * 0.001):
        raise degenerate_geometry()

    return Measurements(
        shoulder_asymmetry_percent=shoulder_offset,
        shoulder_angle_deg=shoulder_angle,
        hip_asymmetry_percent=hip_offset,
        hip_angle_deg=hip_angle,
        torso_lean_angle_deg=degrees(atan2(torso_dx, torso_up)),
    )


def analyze_photo(source: BytesIO, detector: PoseDetector, threshold: float) -> PostureAnalysisResponse:
    pixels = decode_image(source)
    height, width = pixels.shape[:2]
    image = ImageSize(width=width, height=height)
    landmarks = extract_landmarks(detector.detect(pixels), threshold)
    return PostureAnalysisResponse(
        analysis_id=uuid4(),
        image=image,
        landmarks=landmarks,
        measurements=measure(landmarks, image),
        quality=Quality(
            message="Required landmarks detected successfully.",
            landmark_visibility_threshold=threshold,
        ),
        observations=observe(landmarks),
    )
