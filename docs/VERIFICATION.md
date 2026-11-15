# Verification — 2026-11-15

Test environment: macOS ARM64, Python 3.11.9, Node.js 22.22.3. This records actual checks, not a claim of clinical validation.

## Optimization verification

The Astra ultra optimization pass completed **153 tests**: 83 backend, 58
frontend, eight phone gateway, and four development launcher tests. Frontend
TypeScript and production build succeeded. Backend tests disable `.env` reads
and block real HTTP transport before importing the application; this pass made
**zero paid AI calls**.

Actual browser QA used a clearly labelled temporary test-image camera with the
real MediaPipe worker and application UI. About 357 frames were processed.
Freezing video stopped capture readiness; resuming restored it. The default
ten-second countdown, immediate capture, retake, and track release passed.
Backend analysis of the captured image also succeeded, with no browser warning
or error logs in that flow. The temporary test files were removed before the
final build. The final UI was also checked at 320 pixels (Home, Results,
Assistant: no horizontal overflow), Enter added a line without sending a
question, Home resumed the current result, and refresh cleared the session.
A clean startup through the development launcher succeeded after a real
TIME_WAIT restart issue was fixed.

Focused regressions cover stale/late frames, worker timeouts, hidden-tab camera
release, late permission resolution, StrictMode, session-owned AI requests,
navigation while a request finishes, duplicate submissions, malformed API
responses, expired-photo reuse, report retry deduplication/TTL/cancellation,
request budgets, slow uploads, gateway origin checks, process-tree shutdown, and a real TCP TIME_WAIT restart regression.
These deterministic checks do not substitute for a physical-phone test.

## Initial implementation checks

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
