import { describe, expect, it, vi } from "vitest";
import { cameraErrorMessage, stopTracks } from "@/hooks/useCamera";
import { speechAvailable } from "@/hooks/useVoiceGuidance";
import { evaluateFraming, FRAME_MAX_AGE_MS, frameSize, mayCapture, type PosePoint } from "./framing";

function pose(): PosePoint[] {
  const points: PosePoint[] = [];
  points[7] = { x: 0.5, y: 0.13, visibility: 0.85 };
  points[11] = { x: 0.35, y: 0.3, visibility: 0.9 };
  points[12] = { x: 0.65, y: 0.29, visibility: 0.93 };
  points[23] = { x: 0.41, y: 0.64, visibility: 0.88 };
  points[24] = { x: 0.59, y: 0.65, visibility: 0.9 };
  return points;
}

describe("live framing", () => {
  it("distinguishes absent pose and missing or low-visibility core landmarks", () => {
    expect(evaluateFraming([])).toBe("no_pose");
    const points = pose();
    delete points[11];
    expect(evaluateFraming(points)).toBe("low_visibility");
    points[11] = { x: 0.35, y: 0.3, visibility: 0.59 };
    expect(evaluateFraming(points)).toBe("low_visibility");
    points[11].visibility = Number.NaN;
    expect(evaluateFraming(points)).toBe("low_visibility");
  });

  it("allows back-view capture when face and ears are not visible", () => {
    const points = pose();
    points[7].visibility = 0.59;
    expect(evaluateFraming(points)).toBe("ready");
  });

  it("asks a person outside the center band to move toward the center", () => {
    const points = pose().map((point) => ({ ...point, x: point.x + 0.16 }));
    expect(evaluateFraming(points)).toBe("center");
  });

  it("detects small framing and clipped body landmarks", () => {
    const small = pose().map((point) => ({ ...point, y: 0.3 + point.y * 0.4 }));
    const clipped = pose();
    clipped[24].y = 0.99;
    expect(evaluateFraming(small)).toBe("closer");
    expect(evaluateFraming(clipped)).toBe("farther");
  });

  it("permits immediately on a good single frame and rejects stale frames", () => {
    const state = evaluateFraming(pose());
    expect(state).toBe("ready");
    expect(mayCapture(state, 100, 100)).toBe(true);
    expect(mayCapture(state, 100, 100 + FRAME_MAX_AGE_MS)).toBe(true);
    expect(mayCapture(state, 100, 101 + FRAME_MAX_AGE_MS)).toBe(false);
    expect(mayCapture("no_pose", 100, 100)).toBe(false);
    expect(mayCapture("ready", 101, 100)).toBe(false);
    expect(mayCapture("ready", Number.NaN, 100)).toBe(false);
  });
});

describe("camera and speech capability", () => {
  it("distinguishes blocked permissions and missing cameras", () => {
    expect(cameraErrorMessage(new DOMException("Denied", "NotAllowedError"))).toContain("Camera access is blocked");
    expect(cameraErrorMessage(new DOMException("Missing", "NotFoundError"))).toContain("No camera was found");
  });

  it("stops every camera track", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    const stream = { getTracks: () => [{ stop: stopA }, { stop: stopB }] } as unknown as MediaStream;
    stopTracks(stream);
    expect(stopA).toHaveBeenCalledOnce();
    expect(stopB).toHaveBeenCalledOnce();
    expect(() => stopTracks(null)).not.toThrow();
  });

  it("supports capture without speech synthesis", () => {
    expect(speechAvailable({})).toBe(false);
  });
});

it("bounds live and captured frame allocations without stretching the camera image", () => {
  expect(frameSize(3840, 2160, false)).toEqual({ width: 768, height: 432 });
  expect(frameSize(2160, 3840, true)).toEqual({ width: 900, height: 1600 });
  expect(frameSize(640, 480, false)).toEqual({ width: 640, height: 480 });
});
