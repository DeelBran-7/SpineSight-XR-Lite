# SpineSight XR Lite --- Project Specification

**Version:** 1.2\
**Status:** Requirements baseline for MVP\
**Target:** Solo developer using Codex\
**Target schedule:** 48-hour prototype\
**Product language:** English

------------------------------------------------------------------------

## 1. Product Overview

SpineSight XR Lite is a mobile-first web application that uses 2D
human-pose estimation to describe selected visible posture geometry from
a user-captured back-view photograph.

The application guides a user through a standardized photo-capture
process, estimates selected body landmarks, calculates transparent
geometric measurements, and presents an understandable report. A
DeepSeek-powered assistant can explain the measurements and answer
questions using the current analysis context.

This is an educational and research prototype. It is **not** a medical
device, scoliosis screening test, diagnostic tool, or substitute for a
qualified healthcare professional.

### 1.1 Product goals

1.  Provide a simple self-guided smartphone capture experience.
2.  Use browser-side pose estimation to give basic live framing
    guidance.
3.  Re-run pose estimation on the captured still image in the Python
    backend.
4.  Calculate reproducible 2D geometric observations from four core
    landmarks.
5.  Visualize the backend landmarks over the original captured image.
6.  Generate an English report with DeepSeek.
7.  Provide a separate AI Assistant with access to the current analysis
    only.
8.  Avoid persistent storage of photos, reports, accounts, and history.

### 1.2 Explicit non-goals

The MVP must not implement or claim:

-   Scoliosis diagnosis, screening accuracy, or disease probability.
-   Cobb angle measurement.
-   Actual spinal curvature reconstruction.
-   3D skeletal or anatomical reconstruction.
-   Clinical normal/abnormal thresholds.
-   Treatment, rehabilitation, exercise, or medication recommendations.
-   HoloLens, full XR, or true spatial AR.
-   User accounts, database persistence, or long-term history.
-   Persistent storage of user photos.
-   Continuous video upload or server-side video streaming.

Use the phrase **2D posture observation** or **posture geometry
analysis**, not spinal diagnosis.

------------------------------------------------------------------------

## 2. Target User and User Journey

### 2.1 Target user

A general user without medical or computer-vision knowledge, using a
smartphone browser at home.

### 2.2 Capture setup

The user places their phone on a stable tripod or stand, with the rear
camera facing the user. The user stands with their back toward the
camera.

Capture framing target: head to upper thighs. The user should stand
naturally, with arms slightly away from the torso, without deliberately
correcting or exaggerating posture.

These are product capture instructions, not clinical examination
standards.

### 2.3 Main navigation

Use a linear workflow:

`Home → Instructions → Capture → Preview → Analysis Report`

The AI Assistant is a separate page reachable from the Home page and
from report-page quick questions.

### 2.4 Page requirements

#### Home Page

-   Product name and concise description.
-   Primary "Start observation" action.
-   "How It Works" explanation.
-   Privacy notice access.
-   First-use consent gate.
-   No history list.

#### Privacy Notice

Before the first observation, show a clear notice and require affirmative
confirmation.

The notice must explain: - The photo is sent to the developer's local
FastAPI backend through the configured HTTPS tunnel. - The application
does not intentionally persist the photo. - The backend returns
structured measurements. - Structured measurements and chat messages are
sent to DeepSeek when report or chat features are used. - The
application does not send the original photo to DeepSeek. - Users should
not enter identifying information. - This prototype does not diagnose or
rule out any condition.

Consent is a UI gate, not proof of regulatory compliance. Do not claim
HIPAA compliance or equivalent certification.

Store only the consent flag in in-memory application state for the
current browser session. Do not persist it to localStorage unless
explicitly approved later.

#### Instructions Page

Explain: 1. Place the phone on a stable stand. 2. Use the rear camera.
3. Stand with your back facing the camera. 4. Keep your head, shoulders,
torso, hips, and upper thighs in frame. 5. Stand naturally. 6. Keep arms
slightly away from the torso. 7. Use even lighting and a simple
background. 8. Keep the camera approximately level and facing the back.

Do not claim that the application can verify that the camera is
perfectly parallel to the body.

#### Capture Page

-   Request rear-camera access using `getUserMedia`.
-   Display the live preview.
-   Run browser-side MediaPipe Pose Landmarker in VIDEO mode.
-   Use pose landmarks for basic capture guidance only.
-   Draw a lightweight pose overlay or framing guide.
-   Display text instructions and optional speech guidance.
-   Provide a mute/unmute control.
-   Enable the capture button when the current frame passes the basic
    capture checks.
-   Do not upload live video frames.
-   Stop camera tracks when leaving the page or when capture is
    complete.

Speech guidance uses browser `SpeechSynthesis API`. Trigger speech only
when guidance state changes; avoid repeated announcements on every
frame.

#### Preview Page

-   Display the captured still image.
-   Provide "Retake" and "Analyze" actions.
-   Retaking discards the previous in-memory image.
-   "Analyze" sends one still image to the backend.
-   Do not persist the image in browser storage.

#### Analysis Report Page

Default view: - Original image with SVG overlay based on
backend-returned landmarks. - Shoulder relative vertical offset and
shoulder line angle. - Hip relative vertical offset and hip line
angle. - Torso lean angle. - Analysis quality status. - Simple-language
summary. - Quick questions for the AI Assistant.

Expandable technical details: - Normalized landmark coordinates. -
Landmark visibility values. - Formula definitions. - Rule-based
observation labels. - Measurement limitations.

Never display an invented "health score", disease probability, or
clinical normal/abnormal badge.

#### AI Assistant Page

-   Separate chat page.
-   English only.
-   Current analysis context is available when entered from a report.
-   Suggested questions are available.
-   Chat history exists only in frontend memory for the current analysis
    session.
-   Starting a new analysis clears the previous chat context.
-   Refreshing or closing the page may lose the chat history.
-   Do not persist chat history to localStorage, IndexedDB, or a
    database.
-   If the user enters the assistant without an analysis, provide
    general capture/process guidance and state that no current analysis
    is attached.

------------------------------------------------------------------------

## 3. Visual Design

Use an Apple Health-inspired minimalist visual language, without copying
proprietary assets.

-   Mobile-first responsive layout.
-   White or very light neutral background.
-   Soft blue primary accent.
-   Subtle green and amber status accents where appropriate.
-   Dark navy or charcoal text.
-   Rounded cards and restrained shadows.
-   System font stack or Inter.
-   Lucide icons.
-   Clear hierarchy and generous spacing.
-   Avoid dense clinical dashboards.
-   Technical details are collapsed by default.

Use React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router,
Axios, and Lucide React.

------------------------------------------------------------------------

## 4. System Architecture

### 4.1 Frontend

-   React + TypeScript + Vite.
-   Tailwind CSS + shadcn/ui.
-   React Router.
-   Axios or fetch wrapper.
-   `@mediapipe/tasks-vision`.
-   Browser `getUserMedia`.
-   Browser `SpeechSynthesis API`.
-   SVG overlay for backend landmarks.

Frontend responsibilities: 1. Consent and navigation. 2. Camera access
and capture. 3. Browser-side pose estimation for capture guidance. 4.
Capture-state validation. 5. Still-image preview. 6. API communication.
7. SVG visualization. 8. Report and chat UI. 9. Current-session state
management.

### 4.2 Backend

-   Python 3.11.
-   FastAPI.
-   Pydantic.
-   MediaPipe Python Pose Landmarker.
-   OpenCV.
-   NumPy.
-   Pillow.
-   OpenAI Python SDK compatible client for DeepSeek.

Backend responsibilities: 1. Validate and decode uploaded still image.
2. Apply EXIF orientation correction. 3. Run authoritative MediaPipe
inference on the still image. 4. Validate core landmarks. 5. Calculate
geometric measurements. 6. Generate deterministic rule-based
observations. 7. Store structured analysis in an in-memory TTL cache. 8.
Generate report and chat responses through DeepSeek. 9. Never persist
original photos.

### 4.3 Authoritative analysis rule

Frontend and backend use Pose Landmarker Lite, but their outputs may
differ because of runtime, preprocessing, and inference differences.

**Only backend measurements are authoritative for the report.**

Frontend landmarks are used only for live capture guidance. Do not send
frontend measurements as authoritative analysis data.

### 4.4 Local backend and phone access

The backend always runs on the developer's computer. For phone camera
access, serve the frontend through a trusted HTTPS tunnel.

Recommended topology:

`Phone Browser (HTTPS) → Protected Tunnel → Vite HTTPS/HTTP origin → Vite /api proxy → FastAPI bound to 127.0.0.1:8000`

Prefer a single HTTPS origin and proxy `/api` to FastAPI to avoid
unnecessary CORS complexity.

Do not expose FastAPI directly to the public internet. Protect the
tunnel with access controls where possible. Do not place API keys in
URLs.

------------------------------------------------------------------------

## 5. Computer Vision Specification

### 5.1 Model

Use MediaPipe Pose Landmarker Lite for both browser guidance and backend
analysis.

-   Frontend: `@mediapipe/tasks-vision`, VIDEO mode.
-   Backend: MediaPipe Python API, IMAGE mode.
-   Use the same model asset version where compatible.
-   Record the exact model asset source and checksum/version in project
    documentation.
-   Do not silently substitute a different model.

Model file locations: - Frontend asset:
`frontend/public/models/pose_landmarker_lite.task` - Backend asset:
`backend/models/pose_landmarker_lite.task`

The model asset is an external prerequisite. Document its official
download source and verify that the file exists at startup. Do not
fabricate or commit a placeholder model.

### 5.2 Core landmarks

MediaPipe Pose landmark indices:

    Index Landmark         Use
  ------- ---------------- -----------------------------------
       11 LEFT_SHOULDER    Core analysis
       12 RIGHT_SHOULDER   Core analysis
       23 LEFT_HIP         Core analysis
       24 RIGHT_HIP        Core analysis
        0 NOSE             Capture framing guidance
        7 LEFT_EAR         Optional head visibility guidance
        8 RIGHT_EAR        Optional head visibility guidance

Left and right refer to the model's anatomical landmark labels, not the
viewer's screen-left and screen-right.

### 5.3 Coordinate conventions

-   Use normalized image coordinates `x, y` in `[0, 1]` for API output.
-   Image origin is top-left.
-   X increases to the right.
-   Y increases downward.
-   Apply EXIF orientation correction before backend inference.
-   Frontend SVG must use the original displayed image's matching aspect
    ratio and coordinate transform.
-   Do not mirror the rear-camera still image unless the capture
    pipeline explicitly mirrors it; document any transform.

### 5.4 Visibility

Use an initial engineering threshold of `0.60` for the four core
landmarks. This is a configurable engineering threshold, not a clinical
threshold.

If any required landmark is missing, below threshold, non-finite, or
geometrically degenerate, return a structured quality failure rather
than fabricating measurements.

### 5.5 Geometric measurements

The API returns normalized coordinates. Before geometric calculations, restore
an isotropic pixel coordinate system using the EXIF-corrected image dimensions:
`X = x * width`, `Y = y * height`. Using independently normalized axes directly
would distort angles and relative vertical offsets on non-square images.

Let `LS`, `RS`, `LH`, `RH` refer to these pixel coordinates.
Reject degenerate shoulder/hip horizontal separation and nonpositive torso
height instead of using an epsilon to fabricate a finite result.

#### Shoulder relative vertical offset and line angle

`shoulder_asymmetry_percent = 100 * abs(LS.y - RS.y) / abs(LS.x - RS.x)`

`shoulder_angle_deg = line_angle(LS, RS)`

#### Hip relative vertical offset and line angle

`hip_asymmetry_percent = 100 * abs(LH.y - RH.y) / abs(LH.x - RH.x)`

`hip_angle_deg = line_angle(LH, RH)`

For either line, compute `degrees(atan2(B.y-A.y, B.x-A.x))` and wrap
modulo 180 into `[-90, 90)`. A positive line angle slopes down toward screen
right; a negative line angle slopes up toward screen right. The anatomical
left/right height label is determined separately from the landmark Y values.
This avoids an artificial 180-degree flip when anatomical labels run in the
opposite screen direction.

#### Torso lean angle

`shoulder_midpoint = (LS + RS) / 2`

`hip_midpoint = (LH + RH) / 2`

`torso_lean_angle_deg = degrees(atan2(shoulder_midpoint.x - hip_midpoint.x, hip_midpoint.y - shoulder_midpoint.y))`

A positive torso angle means the shoulder midpoint is toward screen right of
the hip midpoint. Preserve the signed value. Verify all conventions with
synthetic coordinates, including non-square images and reversed labels.

### 5.6 Mathematical interpretation

The normalized relative offset and the corresponding line angle are
mathematically related. They are two presentations of the same 2D
geometry, not independent clinical findings.

Do not combine them as independent weighted evidence. Do not create an
overall numerical score.

### 5.7 Rule engine

Python produces deterministic labels describing geometry only, for
example: - `relative_height_difference_detected` -
`small_relative_height_difference` - `measurement_available` -
`measurement_unavailable` - `left_landmark_higher_in_image` -
`right_landmark_higher_in_image` - `leftward_lateral_offset` -
`rightward_lateral_offset`

Do not use `normal`, `abnormal`, `scoliosis_positive`, or
`scoliosis_negative`.

The rule engine may describe direction and availability. It must not
classify disease or health status.

------------------------------------------------------------------------

## 6. Live Capture Quality Checks

The frontend uses browser MediaPipe only for capture guidance.

Initial rules: 1. A pose must be detected. 2. Require the four core
landmarks. 3. Each core landmark visibility should be at least `0.60`.
4. Calculate the center X coordinate of the four core landmarks and
require it to be within `0.35–0.65` as an initial framing range. 5.
Use visible head landmarks to strengthen framing when available; head
visibility is not a hard requirement for a back-facing user. Otherwise apply
conservative shoulder-to-hip span and frame-margin bounds without inventing
head landmarks. These checks do not prove that the head or upper thighs are in frame. 6. Display clear
instructions when a check fails. 7. Enable capture if the current frame
passes all configured checks.

The single-frame capture decision is intentional. Do not require ten
consecutive passing frames.

The app must not claim that 2D pose landmarks prove: - the user faces
exactly away from the camera, - the camera is perfectly parallel to the
back, - the body is free from rotation, - the image is clinically
standardized.

For the MVP, instruct the user to ensure only one person is in the
frame. Pose Landmarker is not a reliable general-purpose multi-person
detector; do not claim robust crowd detection based solely on its
`numPoses` setting.

### 6.1 Voice and text guidance

Use browser SpeechSynthesis API, with visible text and a mute toggle.

Example guidance: - "Please stand in front of the camera." - "Please
move slightly backward." - "Please move closer to the camera." - "Please
move to the center." - "Please adjust your position and improve the
lighting." - "Your position looks good. You can take the photo now."

Trigger speech only on guidance-state changes. Avoid repeated speech on
every frame. Handle browsers where speech synthesis is unavailable.

### 6.2 Performance

-   Use VIDEO mode.
-   Throttle inference to an initial target of approximately 5--10 FPS.
-   Keep camera preview rendering independent of inference.
-   Do not upload video frames.
-   Stop all camera tracks on navigation, unmount, capture completion, and
    when the tab is hidden. Cancel countdowns and pending captures while hidden.
-   Reject stale inference/photo results, recover stalled workers, and use a
    default ten-second countdown for self-capture.
-   Test on at least one real iOS or Android phone if available.

------------------------------------------------------------------------

## 7. Analysis Report

### 7.1 Report layers

Default user-friendly layer: - Visual posture overlay. - Shoulder
observation. - Hip observation. - Torso observation. - Overall
plain-language summary. - Analysis quality. - Quick questions.

Expandable technical layer: - Normalized landmark coordinates. -
Visibility values. - Measurements and units. - Formula descriptions. -
Rule-based observation labels. - Known limitations.

### 7.2 DeepSeek report generation

DeepSeek receives structured measurements and deterministic observations
only. It does not receive the original photo.

Use a separate report-generation prompt and a strict Pydantic output
schema.

Required report fields: - `simple_summary: str` -
`technical_summary: str` - `findings.shoulder: str` -
`findings.hip: str` - `findings.torso: str` - `limitations: list[str]` -
`disclaimer: str`

The model must: - Use English. - Explain the supplied values without
changing them. - Avoid clinical normal/abnormal labels. - Avoid
diagnosis or disease probability. - Avoid treatment or exercise
advice. - State that 2D image geometry is affected by camera position,
body rotation, clothing, and pose-estimation error. - Never claim that
the result confirms or rules out scoliosis.

If backend analysis quality is invalid, do not call DeepSeek for a
definitive report.

### 7.3 Report failure

If DeepSeek fails: - Keep the CV result visible. - Display a
report-generation error. - Provide a Retry button. - Do not replace the
failure with fabricated AI text. - Do not require the user to upload the
photo again.

------------------------------------------------------------------------

## 8. AI Assistant

The Assistant is a separate page and can also be opened through report
quick questions.

### 8.1 Responsibilities

-   Explain current geometric observations.
-   Explain how the measurements are calculated.
-   Explain capture and measurement limitations.
-   Answer general questions about the app's process.
-   Encourage professional assessment when the user has health concerns.

### 8.2 Context

The frontend sends: - `analysis_id` - current user message - recent
conversation history

The backend retrieves authoritative measurements and observations from
its own cache using `analysis_id`.

Do not trust measurement values supplied by the frontend.

The model must not: - diagnose scoliosis or any other condition, - infer
disease probability, - prescribe treatment, exercises, or medication, -
fabricate measurements, - override the backend's quality status.

### 8.3 Chat history

-   Store in frontend memory only.
-   No localStorage, IndexedDB, database, or server-side history.
-   Clear when a new analysis begins.
-   Send only the most recent bounded number of messages.
-   If the analysis cache expires, return a clear session-expired error.

------------------------------------------------------------------------

## 9. Privacy and Security

-   No user account.
-   No database.
-   No persistent photo storage.
-   No image logging.
-   Validate file type, actual decoding, and file size.
-   Set a maximum upload size of 8 MB.
-   Correct EXIF orientation.
-   Process image in memory.
-   Release image references and temporary buffers after request
    completion.
-   Do not send the original image to DeepSeek.
-   Store DeepSeek credentials only in backend environment variables.
-   Never expose API keys in frontend environment variables.
-   Bind FastAPI to `127.0.0.1` for local use.
-   Use a protected HTTPS tunnel for phone access.
-   Use CORS and appropriate request protections, but do not treat CORS
    as authentication.
-   Do not put secrets in tunnel URLs.
-   Do not claim that Python memory deallocation guarantees physical
    memory zeroization.
-   Clearly disclose that measurements and chat messages are sent to
    DeepSeek when those features are used.
-   Verify the current DeepSeek API data handling and retention terms
    before public demonstrations.

------------------------------------------------------------------------

## 10. Local Session Cache

Use a simple in-memory TTL cache, not a database.

-   Key: UUID `analysis_id`.
-   TTL: 30 minutes.
-   Cache only structured measurements, landmarks, quality metadata, and
    rule observations.
-   Never cache the original image.
-   No persistent report or chat history. For retry deduplication, a separate
    bounded in-memory report map may retain at most 64 generated reports for
    60 seconds, capped by each analysis session’s remaining TTL. Chat is not
    cached on the backend.
-   Expired or unknown ID returns `ANALYSIS_SESSION_EXPIRED`.
-   Clear entries periodically or lazily on access.
-   Starting a new analysis creates a new ID.
-   Do not claim cache data survives backend restarts.

------------------------------------------------------------------------

## 11. DeepSeek Configuration

Use environment variables:

``` env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=
```

The model name must be configurable. Do not hard-code a model name
throughout application code.

Use the OpenAI Python SDK compatible client. Verify the current official
DeepSeek model identifier and API compatibility before configuring the
default.

Report and assistant tasks use separate prompts and separate response
schemas.

Validate all model output with Pydantic. If invalid, allow one
controlled format-repair attempt; if still invalid, return a retryable
error.

------------------------------------------------------------------------

## 12. API Contract Summary

### `GET /api/health`

Returns service health and version.

### `POST /api/v1/analyze`

-   Content type: multipart/form-data.
-   Field: `file`.
-   Validates and decodes image.
-   Runs authoritative backend MediaPipe inference.
-   Computes measurements and observations.
-   Creates in-memory analysis session.
-   Returns `analysis_id`, image dimensions, landmarks, measurements,
    quality, observations.
-   Does not call DeepSeek.
-   Does not persist the image.

### `POST /api/v1/report`

Request:

``` json
{
  "analysis_id": "uuid"
}
```

-   Retrieves analysis from backend cache.
-   Calls DeepSeek report prompt.
-   Validates response.
-   Returns structured report.

### `POST /api/v1/assistant`

Request:

``` json
{
  "analysis_id": "uuid",
  "message": "Explain my shoulder alignment.",
  "history": []
}
```

-   Retrieves authoritative analysis from cache.
-   Ignores any client-supplied measurement values.
-   Calls DeepSeek assistant prompt.
-   Returns reply.

All endpoints use consistent error response schemas and appropriate HTTP
status codes.

------------------------------------------------------------------------

## 13. Project Structure

``` text
SpineSight-XR-Lite/
├── frontend/
│   ├── public/models/
│   │   └── pose_landmarker_lite.task
│   ├── src/
│   │   ├── components/
│   │   │   ├── CameraPreview.tsx
│   │   │   ├── PoseOverlay.tsx
│   │   │   ├── VoiceGuidance.tsx
│   │   │   ├── MetricCard.tsx
│   │   │   ├── AnalysisReport.tsx
│   │   │   └── ChatAssistant.tsx
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── InstructionsPage.tsx
│   │   │   ├── CapturePage.tsx
│   │   │   ├── PreviewPage.tsx
│   │   │   ├── ResultsPage.tsx
│   │   │   └── AssistantPage.tsx
│   │   ├── services/api.ts
│   │   ├── hooks/
│   │   │   ├── useCamera.ts
│   │   │   ├── usePoseDetection.ts
│   │   │   └── useVoiceGuidance.ts
│   │   ├── store/sessionStore.ts
│   │   ├── types/analysis.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── backend/
│   ├── models/pose_landmarker_lite.task
│   ├── app/
│   │   ├── api/
│   │   │   ├── health.py
│   │   │   ├── analyze.py
│   │   │   ├── report.py
│   │   │   └── assistant.py
│   │   ├── services/
│   │   │   ├── pose_detector.py
│   │   │   ├── posture_analyzer.py
│   │   │   ├── rule_engine.py
│   │   │   ├── llm_service.py
│   │   │   └── session_cache.py
│   │   ├── schemas/
│   │   ├── core/config.py
│   │   └── main.py
│   ├── tests/
│   └── requirements.txt
├── docs/
│   ├── PROJECT_SPEC.md
│   ├── API_CONTRACT.md
│   └── CODEX_TASKS.md
├── .env.example
├── .gitignore
└── README.md
```

------------------------------------------------------------------------

## 14. Definition of Done

The MVP is complete only when:

1.  Frontend and backend start locally.
2.  Phone browser can access the app over HTTPS.
3.  First-use privacy notice blocks screening until accepted.
4.  Rear camera capture works on a real phone.
5.  Browser MediaPipe provides live capture guidance.
6.  Speech and text guidance work, with mute control.
7.  User can preview and retake.
8.  Backend runs real MediaPipe inference on the still image.
9.  Backend returns actual landmarks and computed measurements.
10. Geometric formulas pass deterministic unit tests.
11. Invalid or low-visibility landmarks are handled safely.
12. React overlays backend landmarks accurately on the original image.
13. Report generation works when DeepSeek is configured.
14. Assistant uses current backend analysis context.
15. DeepSeek failures do not destroy CV results.
16. Cache expires after 30 minutes.
17. Original images are not persisted or sent to DeepSeek.
18. No diagnostic or clinical claims appear in UI or prompts.
19. README provides exact setup and troubleshooting steps.
20. A complete phone-based demo can be performed.

------------------------------------------------------------------------

## 15. References

Use current official documentation during implementation:

-   MediaPipe Pose Landmarker:
    https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
-   MediaPipe Web:
    https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
-   FastAPI: https://fastapi.tiangolo.com/
-   React: https://react.dev/
-   Vite: https://vite.dev/
-   Tailwind CSS: https://tailwindcss.com/docs
-   shadcn/ui: https://ui.shadcn.com/docs
-   DeepSeek API: https://api-docs.deepseek.com/
-   MDN MediaDevices:
    https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
-   MDN SpeechSynthesis:
    https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis

Do not assume package versions or model identifiers from memory. Verify
current official documentation and pin compatible versions during
implementation.
