# Model assets

Both runtimes use the official MediaPipe Pose Landmarker Lite float16 bundle.

- Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- Download: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
- Verified on: 2026-11-15
- Size: 5,777,746 bytes
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`
- Bundle entries: `pose_detector.tflite`, `pose_landmarks_detector.tflite`

Run `python3 scripts/download_model.py` from the repository root. The script checks the exact checksum before copying the bundle into `backend/models/` and `frontend/public/models/`. Although the official URL uses `latest`, unexpected changed bytes are rejected. Model files are excluded from Git and reproduced through this script. Browser WASM files are copied from the locked `@mediapipe/tasks-vision` npm package by the frontend preparation script.

No user photographs are included in model assets or stored by the application.
