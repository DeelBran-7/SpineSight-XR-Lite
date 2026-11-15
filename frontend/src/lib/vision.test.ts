import { afterEach, expect, it, vi } from "vitest";
import { createPoseLandmarker } from "./vision";

afterEach(() => vi.unstubAllGlobals());

it("reports a missing model when the server responds with its HTML route fallback", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("<html></html>", {
    headers: { "Content-Type": "text/html" },
  }));
  vi.stubGlobal("fetch", fetcher);
  await expect(createPoseLandmarker("http://localhost:5173/capture", false)).rejects.toThrow("model is unavailable");
  expect(fetcher.mock.calls[0][0]).toBe("http://localhost:5173/models/pose_landmarker_lite.task?v=59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a");
});

it("reports unavailable model assets after an HTTP error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  await expect(createPoseLandmarker("http://localhost:5173/capture", true)).rejects.toThrow("model is unavailable");
});
