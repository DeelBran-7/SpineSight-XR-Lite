# SpineSight XR Lite --- Codex Execution Tasks

**Version:** 1.0\
**Execution model:** One developer + Codex\
**Strategy:** Scaffold first, then milestone-based implementation, final
integration and acceptance.

Read `docs/PROJECT_SPEC.md` and `docs/API_CONTRACT.md` before every
milestone. These documents are the source of truth.

------------------------------------------------------------------------

## 1. Global Codex Rules

Paste these rules into Codex at the start of the project:

``` text
You are the implementation engineer for SpineSight XR Lite.

Before coding:
1. Read docs/PROJECT_SPEC.md.
2. Read docs/API_CONTRACT.md.
3. Read docs/CODEX_TASKS.md.
4. Inspect the current repository and report its state.

Non-negotiable rules:
- Do not change the approved product scope without asking.
- Do not add a database, authentication, user accounts, or history.
- Do not persist photos or chat messages.
- Do not send original photos to DeepSeek.
- Backend measurements are authoritative.
- Frontend MediaPipe is only for capture guidance.
- Do not fabricate pose landmarks or measurements.
- Do not create scoliosis diagnosis, disease probability, or Cobb angle.
- Do not use clinical normal/abnormal labels.
- Keep the app English-only.
- Keep the backend local.
- Keep DeepSeek credentials on the backend.
- Follow the API contract exactly.
- Add tests for implemented logic.
- Run tests and builds before declaring a milestone complete.
- If an external model asset or API key is missing, document the prerequisite and provide a clear error; never fake successful output.

At the end of each milestone:
1. List files created/changed.
2. List commands executed.
3. Report test results.
4. List known limitations and blockers.
5. Do not begin the next milestone until asked.
```

------------------------------------------------------------------------

## 2. M0 --- Project Scaffold

### Goal

Create a minimal, runnable monorepo and establish API types before
implementing the model.

### Tasks

1.  Create the directory structure in PROJECT_SPEC.md.
2.  Initialize React + TypeScript + Vite.
3.  Configure Tailwind CSS and shadcn/ui using current official
    installation instructions.
4.  Configure React Router.
5.  Initialize Python 3.11 backend and FastAPI.
6.  Add Pydantic schemas matching API_CONTRACT.md.
7.  Add `/api/health`.
8.  Add `.env.example` files.
9.  Add `.gitignore`.
10. Add a basic README.
11. Add a same-origin Vite `/api` proxy to local FastAPI.
12. Add frontend type definitions matching Pydantic schemas.

### Tests

-   Backend starts.
-   `GET /api/health` returns expected shape.
-   Frontend starts.
-   Frontend production build succeeds.
-   TypeScript check succeeds.

### Acceptance

Do not proceed until both frontend and backend start successfully and
the API contract is represented in code.

### Codex prompt

``` text
Implement M0 only.

Read all project docs first. Scaffold the repository, frontend, backend, schemas, environment templates, Vite API proxy, and health endpoint.

Do not implement MediaPipe or DeepSeek yet.

Run backend tests, frontend type checks, and frontend build. Fix all errors. Report files changed, commands, results, and remaining setup requirements.
```

------------------------------------------------------------------------

## 3. M1 --- Backend Computer Vision

### Goal

Implement real image-based pose detection and deterministic geometric
measurements.

### Tasks

1.  Add model loading at application startup.
2.  Verify model asset exists.
3.  Implement image upload validation.
4.  Enforce 8 MB upload limit.
5.  Validate JPEG, PNG, WebP and actual image decoding.
6.  Correct EXIF orientation.
7.  Convert image to the color format required by the installed
    MediaPipe API.
8.  Run Pose Landmarker in IMAGE mode.
9.  Extract indices 11, 12, 23, 24.
10. Validate visibility and geometry.
11. Calculate shoulder offset and angle.
12. Calculate hip offset and angle.
13. Calculate torso lean angle.
14. Implement deterministic rule-based observations.
15. Implement in-memory cache with 30-minute TTL.
16. Implement `POST /api/v1/analyze`.
17. Ensure original image is not written to disk or cached.

### Unit tests

Use synthetic landmark coordinates to test: - Horizontal shoulder
line. - Positive and negative shoulder angle conventions. - Horizontal
hip line. - Positive and negative torso lean conventions. - Degenerate
horizontal separation. - Missing landmark. - Low visibility. -
Non-finite coordinates. - Cache hit, expiry, and cache miss.

### Integration tests

Use a small consented or synthetic test image if available. Do not
assume all arbitrary images contain a detectable person.

### Acceptance

A real valid image must return actual MediaPipe landmarks and computed
values. Invalid images must return structured errors. No hardcoded
successful measurements.

### Codex prompt

``` text
Implement M1 only.

Read PROJECT_SPEC.md and API_CONTRACT.md.

Implement the backend image pipeline, MediaPipe Pose Landmarker IMAGE mode, landmark validation, geometric calculations, rule engine, in-memory TTL cache, and POST /api/v1/analyze.

Use synthetic coordinates for deterministic unit tests. Add integration tests where a valid test image is available.

Do not implement DeepSeek or frontend capture.

Do not write photos to disk. Do not create medical scores or diagnoses.

Run all tests and report exact results. If the model asset is missing, document the official source and fail clearly rather than using fake output.
```

------------------------------------------------------------------------

## 4. M2 --- Frontend Capture Engine

### Goal

Implement the phone camera workflow and live capture guidance.

### Tasks

1.  Implement Home page.
2.  Implement first-use privacy notice gate.
3.  Implement Instructions page.
4.  Implement `useCamera`.
5.  Request rear camera using `getUserMedia`.
6.  Implement frontend MediaPipe Tasks Vision VIDEO mode.
7.  Load the Pose Landmarker Lite asset.
8.  Implement current-frame capture checks:
    -   person detected,
    -   four core landmarks visible,
    -   center X within configured range,
    -   configured body-scale range.
9.  Add visible text guidance.
10. Add SpeechSynthesis guidance.
11. Add mute/unmute.
12. Enable capture when current frame passes checks.
13. Capture a still image.
14. Implement Preview page and Retake.
15. Stop camera tracks and close MediaPipe resources on unmount.

### Tests

-   Camera permission denied.
-   No camera available.
-   Model asset loading failure.
-   Pose unavailable.
-   Capture readiness state.
-   Retake.
-   Camera track cleanup.
-   Speech synthesis unavailable.

### Acceptance

A real phone can open the app over HTTPS, grant camera access, receive
guidance, capture a photo, and preview it.

### Codex prompt

``` text
Implement M2 only.

Build the mobile capture flow using React, TypeScript, MediaPipe Tasks Vision VIDEO mode, getUserMedia, and SpeechSynthesis API.

Follow PROJECT_SPEC.md. Use frontend MediaPipe only for capture guidance. Do not send video frames to the backend. Implement text guidance, mute control, one-frame capture readiness, preview, and retake.

Handle camera permission and model-loading errors. Stop all media tracks and release model resources correctly.

Do not implement the backend analysis result page or DeepSeek yet.

Run tests, type check, and production build.
```

------------------------------------------------------------------------

## 5. M3 --- Frontend/Backend Integration

### Goal

Connect the captured photo to real backend analysis and display the
authoritative results.

### Tasks

1.  Implement typed API client.
2.  Upload the preview image to `/api/v1/analyze`.
3.  Handle upload progress and loading state.
4.  Handle structured errors.
5.  Store analysis result in current frontend memory.
6.  Implement `PoseOverlay` using SVG.
7.  Use the original image aspect ratio as the SVG viewBox.
8.  Render backend-returned landmarks only.
9.  Draw shoulder and hip lines.
10. Draw torso center axis.
11. Display measurement cards.
12. Add expandable technical details.
13. Add image-quality information.

### Tests

-   Successful upload.
-   Invalid image response.
-   Low landmark visibility.
-   Expired session.
-   Overlay alignment at different screen widths.
-   Image aspect ratio preservation.
-   Missing result state.

### Acceptance

A user-captured image must produce actual backend results and a
correctly aligned SVG overlay.

### Codex prompt

``` text
Implement M3 only.

Connect the Preview page to POST /api/v1/analyze. Use the exact API contract and TypeScript types.

Build ResultsPage, PoseOverlay, MetricCard, and technical detail disclosure.

Render only backend-returned normalized landmarks. Preserve image aspect ratio and align the SVG coordinate system with the displayed original image.

Handle all backend errors. Do not fabricate measurements or add a medical score.

Run frontend and backend tests, type checks, and build.
```

------------------------------------------------------------------------

## 6. M4 --- DeepSeek Report and Assistant

### Goal

Implement report generation and contextual chat.

### Tasks

1.  Add backend configuration for DeepSeek key, base URL, and model.
2.  Implement report system prompt.
3.  Implement assistant system prompt.
4.  Implement Pydantic report response schema.
5.  Implement `POST /api/v1/report`.
6.  Retrieve analysis data from backend cache by ID.
7.  Validate DeepSeek JSON.
8.  Add one bounded format-repair attempt if needed.
9.  Implement `POST /api/v1/assistant`.
10. Reject client-supplied measurement overrides.
11. Validate and bound chat history.
12. Implement independent Assistant page.
13. Implement report quick-question links.
14. Implement retry UI.
15. Preserve CV results when DeepSeek fails.

### Tests

-   Missing API key.
-   Upstream timeout.
-   Invalid JSON.
-   Missing report fields.
-   Chat with valid analysis ID.
-   Expired analysis ID.
-   Client attempts to inject fake measurements.
-   Chat history bounds.
-   Medical diagnosis request.
-   Treatment recommendation request.

### Acceptance

The report and chat must use backend-cached authoritative data. No
original image is sent to DeepSeek.

### Codex prompt

``` text
Implement M4 only.

Integrate DeepSeek through the backend OpenAI-compatible client.

Implement separate report and assistant prompts, Pydantic validation, one bounded format-repair attempt, and retryable error responses.

The backend must retrieve authoritative analysis data from its in-memory cache. Ignore client-supplied measurements.

Do not send images to DeepSeek. Do not diagnose or prescribe treatment.

Implement the report UI and separate assistant page with current-session history in frontend memory only.

Run tests with mocked upstream calls; tests must not require a real API key.
```

------------------------------------------------------------------------

## 7. M5 --- UI, Privacy, and Session Polish

### Goal

Complete the full product experience.

### Tasks

1.  Polish Apple Health-inspired UI.
2.  Ensure mobile-first responsiveness.
3.  Finalize first-use privacy gate.
4.  Add privacy information in the app.
5.  Ensure consent is not persisted beyond current browser session.
6.  Ensure chat history clears on new analysis.
7.  Ensure no analysis history is shown or saved.
8.  Add 30-minute cache expiry.
9.  Add loading, empty, error, and retry states.
10. Verify navigation and browser back behavior.
11. Ensure no original photo is persisted.
12. Add accessibility labels and keyboard support where relevant.

### Acceptance

The application behaves consistently across the entire user journey and
accurately communicates its privacy and medical limitations.

### Codex prompt

``` text
Implement M5 only.

Polish the complete application using the approved minimalist Apple Health-inspired visual system.

Verify consent, privacy disclosure, session reset, no-history behavior, cache expiry, responsive layout, accessibility labels, and all loading/error/empty states.

Do not add database persistence, accounts, or history features.

Run all tests and the production build.
```

------------------------------------------------------------------------

## 8. M6 --- Final Integration and Acceptance

### Goal

Verify the entire system on a real smartphone.

### Tasks

1.  Configure local Vite and FastAPI.
2.  Configure protected HTTPS tunnel.
3.  Verify phone camera access.
4.  Verify API proxy.
5.  Test one complete valid capture.
6.  Test retake.
7.  Test invalid image.
8.  Test missing landmarks.
9.  Test DeepSeek report success.
10. Test DeepSeek failure and retry.
11. Test Assistant context.
12. Test cache expiration.
13. Inspect logs for image or secret leakage.
14. Record a backup demo video.
15. Finalize README.

### Acceptance

A complete demo can run without manual code edits between user actions.

### Codex prompt

``` text
Perform M6 final integration and acceptance.

Read all project docs and inspect the complete codebase.

Do not add features. Focus on reliability, security, privacy, mobile behavior, error handling, and test coverage.

Run all backend tests, frontend tests, type checks, and production build.

Verify the local HTTPS tunnel and phone camera workflow where the environment permits.

Report:
- completed acceptance criteria,
- failed criteria,
- commands and test results,
- manual checks still required,
- known limitations.

Never claim a manual phone test was completed unless it was actually performed.
```

------------------------------------------------------------------------

## 9. Global Final Acceptance Checklist

-   [ ] Frontend starts.
-   [ ] Backend starts.
-   [ ] Model assets are present and versioned.
-   [ ] Phone browser can access app through HTTPS.
-   [ ] Privacy notice appears on first use.
-   [ ] Rear camera works.
-   [ ] Frontend pose detection works.
-   [ ] Voice and text guidance work.
-   [ ] Capture and retake work.
-   [ ] Backend detects actual landmarks.
-   [ ] Geometric calculations pass unit tests.
-   [ ] SVG overlays align with source image.
-   [ ] DeepSeek report generation works.
-   [ ] Assistant uses the current analysis context.
-   [ ] DeepSeek failures preserve CV results.
-   [ ] Cache expires after 30 minutes.
-   [ ] Original photos are not persisted.
-   [ ] No diagnostic claims are displayed.
-   [ ] Mobile demo completes end-to-end.
