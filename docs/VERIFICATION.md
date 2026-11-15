# Verification — 2026-11-15

Test environment: macOS ARM64, Python 3.11.9, Node.js 22.22.3. This records actual checks, not a claim of clinical validation.

## Passed

- Frontend: `npm test` — **17 passed**; `npm run typecheck` and `npm run build` both succeeded.
- Browser model/capture: Chrome with a local sample-image canvas video stream ran real MediaPipe worker inference for 109 frames. Immediate capture and three-second countdown produced previews; retake created a fresh live stream; all previous tracks reached `ended`. This test made zero uploads/AI requests. Temporary QA pages and the sample image were removed before the final production build.
- Protected HTTPS: a Cloudflare Quick Tunnel reached the built app. Unauthenticated requests returned 401; authenticated app, health, and model requests returned 200. No DeepSeek calls were made for the tunnel check.

- Backend: `SPINESIGHT_TEST_POSE_IMAGE=/tmp/spinesight-official-sample.jpg .venv/bin/python -m pytest -q` — **58 passed**.
- Python dependency consistency: `python -m pip check` — no broken requirements.
- Phone gateway: `python3 -m unittest discover -s scripts -p 'test_*.py' -q` — **5 passed**.
- Official Pose Landmarker Lite bundle: both runtime copies have the recorded SHA-256 and valid model bundle entries.
- Real backend inference: Google MediaPipe Python notebook's public reference photo produced four actual landmarks, valid quality, and five computed measurements. This reference photo is a seated/front-facing person and verifies integration, not the target back-view acquisition protocol. The photo remains a temporary QA fixture outside the application repository.
- Backend startup: `/api/health` returned model-ready and LLM-configured.
- One real report verification succeeded with the configured DeepSeek account. A minimal general assistant smoke request also succeeded. Automated AI tests use mocked HTTP; no camera frames or photos were sent to DeepSeek.
- Browser workflow: consent → instructions → upload a reference photo → preview → analyze → actual results and matching SVG overlay → technical details → assistant with attached context. Quick questions prefill without automatically sending a paid request.
- Responsive browser layout: 390-pixel width had no horizontal page overflow, including expanded technical details; desktop layout inspected at 1280 pixels.
- Local scripts compile, the startup command is executable, and `backend/.env` is ignored by Git.

## Remaining manual acceptance

- Actual iOS/Android rear-camera permission, sustained live framing on that device, speech output, countdown, capture, and retake.
- A real back-view photo taken according to the app's instructions, including lighting/rotation/framing variability.
- A phone recording of the complete demonstration, if required for the course.

No actual physical-phone test or clinical accuracy assessment has been claimed. All photos and reports are intentionally session-only; restarting the backend clears existing analysis IDs.
