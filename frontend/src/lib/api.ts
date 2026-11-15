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

type Validator<T> = (body: unknown) => body is T;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const unit = (value: unknown) => finite(value) && value >= 0 && value <= 1;
const positiveInteger = (value: unknown) => finite(value) && Number.isInteger(value) && value > 0;
const FEATURES = ["shoulder", "hip", "torso"] as const;
const MEASUREMENTS: (keyof AnalysisMeasurements)[] = ["shoulder_asymmetry_percent", "shoulder_angle_deg", "hip_asymmetry_percent", "hip_angle_deg", "torso_lean_angle_deg"];

function isAnalysis(body: unknown): body is PostureAnalysisResponse {
  if (!object(body) || body.success !== true || !text(body.analysis_id)
    || !object(body.image) || !positiveInteger(body.image.width) || !positiveInteger(body.image.height)
    || !object(body.quality) || body.quality.valid !== true || !text(body.quality.message) || !unit(body.quality.landmark_visibility_threshold)
    || !object(body.landmarks) || !object(body.measurements) || !object(body.observations)) return false;
  const { landmarks, measurements, observations } = body;
  return Object.keys(LANDMARK_NAMES).every((key) => {
    const point = landmarks[key];
    return object(point) && unit(point.x) && unit(point.y) && unit(point.visibility);
  }) && MEASUREMENTS.every((key) => finite(measurements[key]))
    && FEATURES.every((key) => object(observations[key]) && observations[key].status === "measurement_available" && text(observations[key].direction));
}

function isReport(body: unknown): body is ReportResponse {
  if (!object(body) || body.success !== true || !text(body.analysis_id) || !object(body.report)) return false;
  const report = body.report;
  return text(report.simple_summary) && text(report.technical_summary) && text(report.disclaimer)
    && object(report.findings) && FEATURES.every((key) => text((report.findings as Record<string, unknown>)[key]))
    && Array.isArray(report.limitations) && report.limitations.length > 0 && report.limitations.every(text);
}

function isAssistant(body: unknown): body is AssistantResponse {
  return object(body) && body.success === true && (body.analysis_id === null || text(body.analysis_id)) && text(body.reply);
}

function isHealth(body: unknown): body is HealthResponse {
  return object(body) && body.status === "ok" && text(body.service) && text(body.version)
    && typeof body.pose_model_ready === "boolean" && typeof body.llm_configured === "boolean";
}

// A route may stop listening while a paid request continues for the current session.
function listen<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
  });
}

async function read<T>(url: string, validate: Validator<T>, timeoutMs: number, init?: RequestInit): Promise<T> {
  if (init?.signal?.aborted) throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(init?.signal?.reason);
  if (init?.signal?.aborted) cancel();
  else init?.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await listen(fetch(url, { cache: "no-store", ...init, signal: controller.signal }), controller.signal);
    const body: unknown = await listen(response.json().catch(() => null), controller.signal);
    if (isErrorResponse(body)) throw new APIError(body.error.code, body.error.message, response.status);
    if (!response.ok) throw new APIError("SERVICE_ERROR", "The service could not complete that request. Please try again.", response.status);
    if (!validate(body)) throw new APIError("INVALID_RESPONSE", "The service returned an incomplete result. Please try again.", response.status);
    return body;
  } catch (error) {
    if (timedOut) throw new APIError("REQUEST_TIMEOUT", "The service took too long to respond. Please try again.");
    if (init?.signal?.aborted || error instanceof APIError) throw error;
    throw new APIError("NETWORK_ERROR", "Could not reach the analysis service. Try again in a moment.");
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", cancel);
  }
}

interface SharedRequest {
  controller: AbortController;
  promise: Promise<unknown>;
  settled: boolean;
}
const paidRequests = new Map<string, SharedRequest>();
const MAX_SAVED_REQUESTS = 32;

export function clearAPIRequests() {
  for (const request of paidRequests.values()) request.controller.abort();
  paidRequests.clear();
}

function paidPost<T>(endpoint: string, body: { analysis_id: string | null } & Record<string, unknown>, validate: Validator<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  const key = JSON.stringify([endpoint, body]);
  let request = paidRequests.get(key);
  if (!request) {
    const controller = new AbortController();
    const pending = read<T>(`/api/v1/${endpoint}`, validate, 100_000, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal,
    }).then((result) => {
      if ((result as ReportResponse | AssistantResponse).analysis_id !== body.analysis_id) {
        throw new APIError("INVALID_RESPONSE", "The service returned a result for a different observation. Please try again.");
      }
      return result;
    });
    request = { controller, promise: pending, settled: false };
    paidRequests.set(key, request);
    const entry = request;
    // Keep successful responses so navigating away and back cannot duplicate a paid call.
    void pending.then(() => {
      entry.settled = true;
      for (const [savedKey, saved] of paidRequests) {
        if (paidRequests.size <= MAX_SAVED_REQUESTS) break;
        if (saved.settled) paidRequests.delete(savedKey);
      }
    }, () => { if (paidRequests.get(key) === entry) paidRequests.delete(key); });
  }
  return listen(request.promise as Promise<T>, signal);
}

export const CHAT_MESSAGE_LIMIT = 1200;
export const CHAT_HISTORY_LIMIT = 8;

export const api = {
  health: (signal?: AbortSignal) => read<HealthResponse>("/api/health", isHealth, 8_000, { signal }),
  analyze(file: File, signal: AbortSignal) {
    const form = new FormData();
    form.set("file", file);
    return read<PostureAnalysisResponse>("/api/v1/analyze", isAnalysis, 60_000, { method: "POST", body: form, signal });
  },
  report: (analysisId: string, signal: AbortSignal) =>
    paidPost<ReportResponse>("report", { analysis_id: analysisId }, isReport, signal),
  assistant: (analysisId: string | null, message: string, history: ChatMessage[], signal: AbortSignal) =>
    paidPost<AssistantResponse>("assistant", {
      analysis_id: analysisId,
      message,
      history: history.slice(-CHAT_HISTORY_LIMIT).map((item) => ({
        role: item.role,
        content: item.content.slice(0, CHAT_MESSAGE_LIMIT),
      })),
    }, isAssistant, signal),
};

export function readableError(error: unknown, fallback: string) {
  return error instanceof APIError ? error.message : fallback;
}
