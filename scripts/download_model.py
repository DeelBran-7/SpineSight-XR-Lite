#!/usr/bin/env python3
"""Fetch and checksum the official MediaPipe Lite model for both runtimes."""
from __future__ import annotations

import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
SHA256 = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a"
TARGETS = [ROOT / "backend/models/pose_landmarker_lite.task", ROOT / "frontend/public/models/pose_landmarker_lite.task"]


def valid(path: Path) -> bool:
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == SHA256


def main() -> None:
    source = next((p for p in TARGETS if valid(p)), None)
    with tempfile.TemporaryDirectory(prefix="spinesight-model-") as directory:
        if source is None:
            source = Path(directory) / "pose_landmarker_lite.task"
            curl = shutil.which("curl")
            if curl:
                subprocess.run([curl, "--fail", "--location", "--retry", "2", "--max-time", "120", URL, "--output", str(source)], check=True)
            else:
                import ssl
                import urllib.request
                import certifi
                with urllib.request.urlopen(URL, context=ssl.create_default_context(cafile=certifi.where()), timeout=120) as response:
                    source.write_bytes(response.read(16 * 1024 * 1024))
            if not valid(source):
                raise SystemExit("Model checksum mismatch. Review the official model release before updating the pinned checksum.")
        with zipfile.ZipFile(source) as archive:
            if set(archive.namelist()) != {"pose_detector.tflite", "pose_landmarks_detector.tflite"}:
                raise SystemExit("Unexpected model bundle contents.")
        for target in TARGETS:
            target.parent.mkdir(parents=True, exist_ok=True)
            if not valid(target):
                shutil.copyfile(source, target)
    print(f"Both Pose Landmarker Lite models verified (SHA-256 {SHA256}).")


if __name__ == "__main__":
    main()
