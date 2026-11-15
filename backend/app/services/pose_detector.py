from collections.abc import Sequence
from pathlib import Path
from threading import Lock
from typing import Protocol

import numpy as np

from app.core.errors import ApiError


class DetectedLandmark(Protocol):
    x: float | None
    y: float | None
    visibility: float | None


class PoseDetector:
    def __init__(self) -> None:
        self._landmarker = None
        self._lock = Lock()

    @property
    def ready(self) -> bool:
        return self._landmarker is not None

    def load(self, model_asset: Path) -> None:
        if not model_asset.is_file():
            return
        import mediapipe as mp

        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(model_asset)),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_poses=1,
            output_segmentation_masks=False,
        )
        self._landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(options)

    def detect(self, pixels: np.ndarray) -> Sequence[DetectedLandmark]:
        import mediapipe as mp

        with self._lock:
            if self._landmarker is None:
                raise ApiError(503, "MODEL_ASSET_MISSING", "The pose model is unavailable.")
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=pixels)
            result = self._landmarker.detect(image)
        if not result.pose_landmarks:
            raise ApiError(422, "NO_PERSON_DETECTED", "No pose was detected. Retake the photo with your full body in frame.")
        return result.pose_landmarks[0]

    def close(self) -> None:
        with self._lock:
            if self._landmarker is not None:
                self._landmarker.close()
                self._landmarker = None
