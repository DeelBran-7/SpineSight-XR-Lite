import { afterEach, describe, expect, it, vi } from "vitest";
import { api, APIError, CHAT_HISTORY_LIMIT, CHAT_MESSAGE_LIMIT, type ChatMessage } from "./api";

const signal = new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe("SpineSight requests", () => {
  it("uploads one still file using the contract field and no additional data", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetcher);
    const still = new File(["test image bytes"], "photo.jpg", { type: "image/jpeg" });
    await api.analyze(still, signal);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("/api/v1/analyze");
    expect(options.method).toBe("POST");
    expect([...options.body.entries()]).toEqual([["file", still]]);
    expect(options.signal).toBe(signal);
    expect(options.cache).toBe("no-store");
  });

  it("requests a report using only the analysis ID", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true }));
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
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Response.json({
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
