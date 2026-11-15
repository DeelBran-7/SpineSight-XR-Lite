export interface Landmark {
  x: number;
  y: number;
  visibility: number;
}

export const LANDMARK_NAMES = {
  left_shoulder: "Left shoulder",
  right_shoulder: "Right shoulder",
  left_hip: "Left hip",
  right_hip: "Right hip",
} as const;

export type LandmarkName = keyof typeof LANDMARK_NAMES;

export type AnalysisMeasurements = {
  shoulder_asymmetry_percent: number;
  shoulder_angle_deg: number;
  hip_asymmetry_percent: number;
  hip_angle_deg: number;
  torso_lean_angle_deg: number;
};

export type FeatureObservation = { status: string; direction: string };

export interface PostureAnalysisResponse {
  success: true;
  analysis_id: string;
  image: { width: number; height: number };
  landmarks: Record<LandmarkName, Landmark>;
  measurements: AnalysisMeasurements;
  quality: { valid: boolean; message: string; landmark_visibility_threshold: number };
  observations: Record<"shoulder" | "hip" | "torso", FeatureObservation>;
}

export interface ReportResponse {
  success: true;
  analysis_id: string;
  report: {
    simple_summary: string;
    technical_summary: string;
    findings: Record<"shoulder" | "hip" | "torso", string>;
    limitations: string[];
    disclaimer: string;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResponse {
  success: true;
  analysis_id: string | null;
  reply: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  pose_model_ready: boolean;
  llm_configured: boolean;
}

interface ErrorResponse {
  success: false;
  error: { code: string; message: string };
}

export class APIError extends Error {
  constructor(public code: string, message: string, public status = 0) {
    super(message);
    this.name = "APIError";
  }
}

function isErrorResponse(data: unknown): data is ErrorResponse {
  if (!data || typeof data !== "object" || !("error" in data)) return false;
  const error = data.error;
  return !!error && typeof error === "object"
    && "code" in error && typeof error.code === "string"
    && "message" in error && typeof error.message === "string";
}

async function read<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new APIError("NETWORK_ERROR", "Could not reach the analysis service. Try again in a moment.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (isErrorResponse(body)) {
    throw new APIError(body.error.code, body.error.message, response.status);
  }
  if (!response.ok || !body || typeof body !== "object") {
    throw new APIError("SERVICE_ERROR", "The service could not complete that request. Please try again.", response.status);
  }
  return body as T;
}

function post<T>(endpoint: string, body: object, signal: AbortSignal) {
  return read<T>(`/api/v1/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export const CHAT_MESSAGE_LIMIT = 1200;
export const CHAT_HISTORY_LIMIT = 8;

export const api = {
  health: (signal?: AbortSignal) => read<HealthResponse>("/api/health", { signal }),
  analyze(file: File, signal: AbortSignal) {
    const form = new FormData();
    form.set("file", file);
    return read<PostureAnalysisResponse>("/api/v1/analyze", { method: "POST", body: form, signal });
  },
  report: (analysisId: string, signal: AbortSignal) =>
    post<ReportResponse>("report", { analysis_id: analysisId }, signal),
  assistant: (analysisId: string | null, message: string, history: ChatMessage[], signal: AbortSignal) =>
    post<AssistantResponse>("assistant", {
      analysis_id: analysisId,
      message,
      history: history.slice(-CHAT_HISTORY_LIMIT).map((item) => ({
        role: item.role,
        content: item.content.slice(0, CHAT_MESSAGE_LIMIT),
      })),
    }, signal),
};

export function readableError(error: unknown, fallback: string) {
  return error instanceof APIError ? error.message : fallback;
}
