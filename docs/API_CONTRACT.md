# SpineSight XR Lite --- API Contract

**Version:** 1.2\
**Backend:** FastAPI\
**Base path:** `/api`\
**Content type:** JSON except image upload

This document is the single source of truth for frontend/backend
contracts. Any schema change must update the backend Pydantic models,
frontend TypeScript types, tests, and this document together.

------------------------------------------------------------------------

## 1. Conventions

-   JSON field names use `snake_case`.
-   Coordinates are normalized floats in `[0, 1]`.
-   Image origin is top-left; X increases right; Y increases down.
-   Angles are degrees, calculated after multiplying normalized coordinates by
    EXIF-corrected width and height. Line angles use `[-90, 90)`; positive
    means down toward screen right. Positive torso lean is toward screen right.
-   Anatomical left/right follow MediaPipe labels, not viewer screen
    direction.
-   Backend measurements are authoritative.
-   Frontend must not submit measurements for report/chat generation.
-   All error responses use a consistent structure.
-   No endpoint persists original photos.

## 2. Common Error Schema

``` json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_LANDMARKS",
    "message": "Required shoulder or hip landmarks could not be detected reliably."
  }
}
```

Recommended HTTP status mapping:

    HTTP Error / meaning
  ------ --------------------------------------------
     400 Invalid request or unsupported image
     408 Request body upload timed out
     413 Image exceeds upload limit
     422 Valid request but unusable image/landmarks
     404 Analysis ID not found or expired
     429 AI concurrency/request budget or upstream rate limit
     502 DeepSeek/upstream failure
     503 Model asset or backend service unavailable
     500 Unexpected server error

Error codes: - `INVALID_IMAGE` - `UNSUPPORTED_IMAGE_TYPE` -
`IMAGE_TOO_LARGE` - `NO_PERSON_DETECTED` - `INSUFFICIENT_LANDMARKS` -
`LOW_LANDMARK_VISIBILITY` - `DEGENERATE_GEOMETRY` -
`ANALYSIS_SESSION_EXPIRED` - `REPORT_GENERATION_FAILED` -
`ASSISTANT_REQUEST_FAILED` - `MODEL_ASSET_MISSING` - `LLM_NOT_CONFIGURED` - `INVALID_REQUEST` - `AI_BUSY` -
`AI_RATE_LIMITED` - `ANALYSIS_BUSY` - `REQUEST_TIMEOUT` - `INTERNAL_ERROR`

## 3. `GET /api/health`

### Purpose

Check backend readiness.

### Response 200

``` json
{
  "status": "ok",
  "service": "SpineSight XR Lite",
  "version": "1.0.0",
  "pose_model_ready": true,
  "llm_configured": true
}
```

`llm_configured` indicates that required configuration exists, not that
DeepSeek is currently reachable.

Do not expose secrets, local file paths, or environment values.

## 4. `POST /api/v1/analyze`

### Purpose

Run authoritative pose estimation and geometric analysis on a
user-captured still image.

### Request

`multipart/form-data`

  Field    Type   Required   Description
  -------- ------ ---------- --------------------------------
  `file`   File   Yes        JPEG, PNG, or WebP still image

Limits: - Maximum upload: 8 MB. - Validate actual image decoding, not
just filename/MIME. - Correct EXIF orientation. - Convert to expected
color channel order. - Do not save the image to disk. - Do not log image
bytes or image content.

### Successful response 200

``` json
{
  "success": true,
  "analysis_id": "b6d7dba0-5b93-4e30-9b4a-a3f95e8c0f12",
  "image": {
    "width": 1080,
    "height": 1440
  },
  "landmarks": {
    "left_shoulder": {
      "x": 0.35,
      "y": 0.28,
      "visibility": 0.98
    },
    "right_shoulder": {
      "x": 0.66,
      "y": 0.30,
      "visibility": 0.97
    },
    "left_hip": {
      "x": 0.40,
      "y": 0.68,
      "visibility": 0.95
    },
    "right_hip": {
      "x": 0.61,
      "y": 0.69,
      "visibility": 0.96
    }
  },
  "measurements": {
    "shoulder_asymmetry_percent": 8.6022,
    "shoulder_angle_deg": 4.9166,
    "hip_asymmetry_percent": 6.3492,
    "hip_angle_deg": 3.6330,
    "torso_lean_angle_deg": 0.0
  },
  "quality": {
    "valid": true,
    "message": "Required landmarks detected successfully.",
    "landmark_visibility_threshold": 0.6
  },
  "observations": {
    "shoulder": {
      "status": "measurement_available",
      "direction": "left_landmark_higher_in_image"
    },
    "hip": {
      "status": "measurement_available",
      "direction": "left_landmark_higher_in_image"
    },
    "torso": {
      "status": "measurement_available",
      "direction": "no_lateral_offset"
    }
  }
}
```

The example measurements are calculated from the displayed 1080 × 1440
coordinates and rounded. Runtime values must use actual backend inference.

### Landmark object

``` json
{
  "x": 0.35,
  "y": 0.28,
  "visibility": 0.98
}
```

All values must be finite. Clamp or reject out-of-range coordinates
according to a documented policy. Do not silently fabricate missing
coordinates.

### Measurements

``` json
{
  "shoulder_asymmetry_percent": 0.0,
  "shoulder_angle_deg": 0.0,
  "hip_asymmetry_percent": 0.0,
  "hip_angle_deg": 0.0,
  "torso_lean_angle_deg": 0.0
}
```

The numbers above are type examples, not defaults.

### Quality failure

Return an appropriate 422 response, for example:

``` json
{
  "success": false,
  "error": {
    "code": "LOW_LANDMARK_VISIBILITY",
    "message": "The shoulder and hip landmarks were not visible enough. Please retake the photo."
  }
}
```

Do not create an analysis cache entry for invalid analysis.

## 5. `POST /api/v1/report`

### Purpose

Generate an English report from an existing backend analysis session.

### Request

``` json
{
  "analysis_id": "b6d7dba0-5b93-4e30-9b4a-a3f95e8c0f12"
}
```

The backend must retrieve the authoritative measurements and
observations from its own in-memory cache. Do not accept client-supplied
measurements as authoritative input.

### Successful response 200

``` json
{
  "success": true,
  "analysis_id": "b6d7dba0-5b93-4e30-9b4a-a3f95e8c0f12",
  "report": {
    "simple_summary": "The image contains visible shoulder and hip landmarks that can be described geometrically.",
    "technical_summary": "The report describes normalized 2D landmark relationships in the captured image.",
    "findings": {
      "shoulder": "The detected shoulder landmarks have a relative vertical offset in the image.",
      "hip": "The detected hip landmarks have a relative vertical offset in the image.",
      "torso": "The shoulder midpoint and hip midpoint have a measurable lateral relationship in the image."
    },
    "limitations": [
      "This is a two-dimensional image-based observation.",
      "Camera position, body rotation, clothing, and pose-estimation error may affect measurements."
    ],
    "disclaimer": "This result does not diagnose or rule out scoliosis or any other medical condition."
  }
}
```

### Failure

If DeepSeek fails or the output cannot be validated:

``` json
{
  "success": false,
  "error": {
    "code": "REPORT_GENERATION_FAILED",
    "message": "The AI report could not be generated. Your posture measurements are still available. Please try again."
  }
}
```

Use HTTP 502 for upstream failures and preserve the analysis cache entry
so the user can retry. Concurrent requests for the same valid analysis share
one generation. A successful report may be reused in RAM for up to 60 seconds
(and at most the remaining analysis TTL), with a 64-entry bound. Failures are
not cached. Report reuse never creates long-term report history.

## 6. `POST /api/v1/assistant`

### Purpose

Answer a user question using the current analysis context. `analysis_id` may
be null or omitted for general capture/process guidance; supplying an expired
ID still returns 404 and never silently downgrades to general advice.

### Request

``` json
{
  "analysis_id": "b6d7dba0-5b93-4e30-9b4a-a3f95e8c0f12",
  "message": "Why is my left shoulder higher?",
  "history": [
    {
      "role": "user",
      "content": "Explain my shoulder alignment."
    },
    {
      "role": "assistant",
      "content": "The detected shoulder landmarks have a relative vertical offset in the image."
    }
  ]
}
```

Validation: - `message` must be non-empty and length-limited. -
`history` allows at most eight messages, each 1–1200 characters. The current
message also permits 1–1200 characters. - Allow only
`user` and `assistant` roles in history. - Do not accept `system` or
`developer` roles from the client. - Do not trust any measurements
supplied by the client. - Retrieve analysis data from cache using
`analysis_id`.

### Successful response 200

``` json
{
  "success": true,
  "analysis_id": "b6d7dba0-5b93-4e30-9b4a-a3f95e8c0f12",
  "reply": "The detected shoulder landmarks appear at different vertical positions in this image. This is a geometric observation and does not establish a medical condition."
}
```

### Failure

``` json
{
  "success": false,
  "error": {
    "code": "ASSISTANT_REQUEST_FAILED",
    "message": "The assistant could not respond. Please try again."
  }
}
```

## 7. In-memory Cache Contract

Cache key: UUID `analysis_id`.

TTL: 30 minutes.

Cache value: - Image width and height. - Four core normalized landmarks
and visibility values. - Measurements. - Quality metadata. - Rule-based
observations. - Creation timestamp.

Never cache: - Original photo. - Encoded image. - User identity. - Chat
history. - Long-term report history.

Use monotonic time for TTL calculations. Expire entries lazily and/or
with a lightweight cleanup mechanism. Do not create unbounded background
tasks.

On cache miss or expiry, return HTTP 404 with
`ANALYSIS_SESSION_EXPIRED`.

Backend restart clears the cache.

## 8. Pydantic / TypeScript Synchronization

Backend Pydantic models are canonical. Frontend TypeScript interfaces
must match them exactly.

Suggested TypeScript types:

``` ts
export interface Landmark {
  x: number;
  y: number;
  visibility: number;
}

export interface AnalysisMeasurements {
  shoulder_asymmetry_percent: number;
  shoulder_angle_deg: number;
  hip_asymmetry_percent: number;
  hip_angle_deg: number;
  torso_lean_angle_deg: number;
}

export interface FeatureObservation {
  status: string;
  direction: string;
}

export interface PostureAnalysisResponse {
  success: true;
  analysis_id: string;
  image: {
    width: number;
    height: number;
  };
  landmarks: {
    left_shoulder: Landmark;
    right_shoulder: Landmark;
    left_hip: Landmark;
    right_hip: Landmark;
  };
  measurements: AnalysisMeasurements;
  quality: {
    valid: boolean;
    message: string;
    landmark_visibility_threshold: number;
  };
  observations: {
    shoulder: FeatureObservation;
    hip: FeatureObservation;
    torso: FeatureObservation;
  };
}

export interface ReportResponse {
  success: true;
  analysis_id: string;
  report: {
    simple_summary: string;
    technical_summary: string;
    findings: {
      shoulder: string;
      hip: string;
      torso: string;
    };
    limitations: string[];
    disclaimer: string;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
```

The actual implementation must also define typed error responses and
handle all optional/null states explicitly.

## 9. API Security

-   Configure allowed origins.
-   Prefer same-origin Vite proxy during local development.
-   Protect the HTTPS tunnel.
-   Do not expose DeepSeek API credentials.
-   Apply request size limits.
-   Do not log image data or secrets.
-   Consider a lightweight per-session/request rate limit for public
    tunnel demos.
-   Do not treat CORS as authentication.


## Runtime bounds

The local service allows two concurrent AI generations and up to 20 new AI
requests per rolling 60 seconds. Report coalescing/reuse does not spend another
upstream request. Report/chat generation and its optional format repair share
one timeout budget (default 30 seconds). Truncated/refused upstream output does
not trigger format repair. The gateway permits 16 connections and four API
requests concurrently and rejects cross-origin mutation requests.

Image upload reading is limited to 20 seconds, waiting for a vision slot to two
seconds, and JSON body reading to ten seconds. Failures keep the common error
schema: `AI_BUSY` and `AI_RATE_LIMITED` use 429, `ANALYSIS_BUSY` uses 503, and
`REQUEST_TIMEOUT` uses 408. These are transient service conditions, not image
quality or health findings.
