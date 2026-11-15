import { afterEach, describe, expect, it, vi } from "vitest";
import { api, APIError, CHAT_HISTORY_LIMIT, CHAT_MESSAGE_LIMIT, clearAPIRequests, type ChatMessage } from "./api";

const signal = new AbortController().signal;

afterEach(() => { clearAPIRequests(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const analysis = {
  success: true, analysis_id: "existing-analysis", image: { width: 1080, height: 1440 },
  quality: { valid: true, message: "Measured", landmark_visibility_threshold: 0.6 },
  landmarks: Object.fromEntries(["left_shoulder", "right_shoulder", "left_hip", "right_hip"].map((key) => [key, { x: 0.5, y: 0.5, visibility: 0.9 }])),
  measurements: { shoulder_asymmetry_percent: 0, shoulder_angle_deg: 0, hip_asymmetry_percent: 0, hip_angle_deg: 0, torso_lean_angle_deg: 0 },
  observations: Object.fromEntries(["shoulder", "hip", "torso"].map((key) => [key, { status: "measurement_available", direction: "level" }])),
};
const report = {
  success: true, analysis_id: "existing-analysis", report: {
    simple_summary: "Summary", technical_summary: "Technical", disclaimer: "Educational only",
    findings: { shoulder: "Shoulder", hip: "Hip", torso: "Torso" }, limitations: ["2D geometry only"],
  },
};

describe("SpineSight requests", () => {
  it("uploads one still file using the contract field and no additional data", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(analysis));
    vi.stubGlobal("fetch", fetcher);
    const still = new File(["test image bytes"], "photo.jpg", { type: "image/jpeg" });
    await api.analyze(still, signal);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("/api/v1/analyze");
    expect(options.method).toBe("POST");
    expect([...options.body.entries()]).toEqual([["file", still]]);
    expect(options.signal.aborted).toBe(false);
    expect(options.cache).toBe("no-store");
  });

  it("requests a report using only the analysis ID", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(report));
    vi.stubGlobal("fetch", fetcher);
    await api.report("existing-analysis", signal);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/report");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ analysis_id: "existing-analysis" });
  });

  it("sends a nullable analysis ID and bounded recent chat history", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, reply: "Reply", analysis_id: null }));
    vi.stubGlobal("fetch", fetcher);
    const history: ChatMessage[] = Array.from({ length: CHAT_HISTORY_LIMIT + 1 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user", content: `Message ${index} ${"a".repeat(CHAT_MESSAGE_LIMIT)}`,
    }));
    await api.assistant(null, "How do I set up?", history, signal);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("/api/v1/assistant");
    const body = JSON.parse(options.body);
    expect(body.analysis_id).toBeNull();
    expect(body.message).toBe("How do I set up?");
    expect(body.history).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(body.history[0]).toEqual({ role: "assistant", content: history[1].content.slice(0, CHAT_MESSAGE_LIMIT) });
  });

  it("preserves structured expiry for the report and assistant", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({
      success: false, error: { code: "ANALYSIS_SESSION_EXPIRED", message: "The observation expired." },
    }, { status: 404 })));
    const expected = { code: "ANALYSIS_SESSION_EXPIRED", status: 404, message: "The observation expired." };
    await expect(api.report("expired", signal)).rejects.toMatchObject(expected);
    await expect(api.assistant("expired", "What does this mean?", [], signal)).rejects.toMatchObject(expected);
  });

  it("handles network outages and non-JSON proxy failures", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(api.health()).rejects.toBeInstanceOf(APIError);
    await expect(api.health()).rejects.toMatchObject({ code: "SERVICE_ERROR", status: 502 });
  });
});


describe("request lifetime and response integrity", () => {
  it("rejects incomplete and non-finite results before they can reach the report UI", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ ...analysis, measurements: { ...analysis.measurements, hip_angle_deg: null } })));
    const still = new File(["test"], "photo.jpg");
    await expect(api.analyze(still, signal)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.analyze(still, signal)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects a report or reply attached to a different observation", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ ...report, analysis_id: "wrong-session" }))
      .mockResolvedValueOnce(Response.json({ success: true, analysis_id: "wrong-session", reply: "Reply" })));
    await expect(api.report("existing-analysis", signal)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.assistant(null, "Setup?", [], signal)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("bounds a request even if fetch never settles and aborts the transport", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const expected = expect(api.health()).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(8000);
    await expected;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("bounds response-body reading too", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const expected = expect(api.health()).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(8000);
    await expected;
  });

  it("does not send a cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(api.report("existing-analysis", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(api.health(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reuses a paid report across navigation without cancelling the shared network request", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const firstPage = new AbortController();
    const first = api.report("existing-analysis", firstPage.signal);
    const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
    firstPage.abort();
    await cancelled;
    const second = api.report("existing-analysis", signal);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
    finish(Response.json(report));
    await expect(second).resolves.toEqual(report);
    await expect(api.report("existing-analysis", signal)).resolves.toEqual(report);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("deduplicates identical chat context but never a changed message or history", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ success: true, analysis_id: null, reply: "Reply" })));
    vi.stubGlobal("fetch", fetcher);
    await Promise.all([api.assistant(null, "Setup?", [], signal), api.assistant(null, "Setup?", [], signal)]);
    await api.assistant(null, "Setup?", [], signal);
    await api.assistant(null, "Lighting?", [], signal);
    await api.assistant(null, "Setup?", [{ role: "user", content: "Lighting?" }], signal);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("clears paid request data when an observation ends", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(report)));
    vi.stubGlobal("fetch", fetcher);
    await api.report("existing-analysis", signal);
    clearAPIRequests();
    await api.report("existing-analysis", signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
