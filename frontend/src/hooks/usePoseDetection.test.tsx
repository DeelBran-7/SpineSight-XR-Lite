// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePoseDetection } from "./usePoseDetection";
import type { WorkerRequest, WorkerResponse } from "@/lib/vision";

const fallback = vi.hoisted(() => ({ create: vi.fn(), detect: vi.fn(), close: vi.fn() }));
vi.mock("@/lib/vision", () => ({ createPoseLandmarker: fallback.create, detectPose: fallback.detect }));

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(message: WorkerRequest, transfer?: Transferable[]) => void>();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  emit(data: WorkerResponse) { this.onmessage?.({ data } as MessageEvent<WorkerResponse>); }
}
let root: Root;
let pose: ReturnType<typeof usePoseDetection>;
let source: { current: HTMLVideoElement };
let clock = 0;
let videoTime = 0;
let animations: Map<number, FrameRequestCallback>;
let sequence = 0;
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
function Probe({ enabled = true }: { enabled?: boolean }) { pose = usePoseDetection(source, enabled); return null; }
async function frame(time: number) {
  clock = time;
  videoTime += 0.14;
  const callbacks = [...animations.values()];
  animations.clear();
  await act(async () => callbacks.forEach((callback) => callback(time)));
}
async function mount() {
  await act(async () => root.render(<Probe />));
  const worker = FakeWorker.instances[0];
  await act(async () => worker.emit({ type: "ready" }));
  return worker;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  FakeWorker.instances = [];
  animations = new Map(); clock = 0; videoTime = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++sequence; animations.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => animations.delete(id));
  bitmap = { width: 768, height: 432, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  fallback.create.mockReset().mockResolvedValue({ close: fallback.close });
  fallback.close.mockReset();
  fallback.detect.mockReset().mockImplementation((_model, _source, sampledAt, captureRequest) => ({ status: "no_pose", points: [], sampledAt, captureRequest }));
  source = { current: { videoWidth: 1920, videoHeight: 1080, readyState: 2, get currentTime() { return videoTime; } } as HTMLVideoElement };
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("throttles live frames, bounds copied pixels, and times out a stuck worker", async () => {
  const worker = await mount();
  await frame(0);
  await frame(100);
  expect(worker.postMessage).toHaveBeenCalledTimes(2); // initialization plus one frame
  expect(createImageBitmap).toHaveBeenCalledWith(source.current, { resizeWidth: 768, resizeHeight: 432 });
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(fallback.create).toHaveBeenCalledOnce();
  expect(pose.state.status).toBe("running");
});

it("rejects a stale ready photo even when the worker eventually reports success", async () => {
  const worker = await mount();
  const request = pose.requestCapture();
  await frame(0);
  clock = 601;
  await act(async () => worker.emit({ type: "frame", frame: { status: "ready", points: [], sampledAt: 0, captureRequest: request, photo: new Blob(["still"]) } }));
  expect(pose.frame?.photo).toBeUndefined();
  expect(pose.frame?.status).toBe("waiting");
});

it("captures from a fresh higher-resolution frame and clears guidance when video freezes", async () => {
  const worker = await mount();
  const request = pose.requestCapture();
  await frame(0);
  expect(createImageBitmap).toHaveBeenCalledWith(source.current, { resizeWidth: 1600, resizeHeight: 900 });
  const photo = new Blob(["still"]);
  await act(async () => worker.emit({ type: "frame", frame: { status: "ready", points: [], sampledAt: 0, captureRequest: request, photo } }));
  expect(pose.frame?.photo).toBe(photo);
  await frame(601);
  expect(pose.frame).toBeNull();
});

it("closes a bitmap that finishes copying after the page unmounts", async () => {
  let finish!: (image: ImageBitmap) => void;
  vi.mocked(createImageBitmap).mockImplementation(() => new Promise((resolve) => { finish = resolve; }) as Promise<ImageBitmap>);
  const worker = await mount();
  await frame(0);
  await act(async () => root.render(null));
  await act(async () => finish(bitmap as unknown as ImageBitmap));
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("releases the worker when the camera pauses and discards late events", async () => {
  const worker = await mount();
  await act(async () => root.render(<Probe enabled={false} />));
  expect(worker.terminate).toHaveBeenCalledOnce();
  await act(async () => worker.emit({ type: "frame", frame: { status: "ready", points: [], sampledAt: 0, captureRequest: null } }));
  expect(pose.frame).toBeNull();
});


it("does not treat a moving video clock as a fresh frame when the camera freezes", async () => {
  let onVideoFrame!: VideoFrameRequestCallback;
  const cancel = vi.fn();
  source.current.requestVideoFrameCallback = vi.fn((callback: VideoFrameRequestCallback) => { onVideoFrame = callback; return 1; });
  source.current.cancelVideoFrameCallback = cancel;
  const worker = await mount();
  onVideoFrame(0, {} as VideoFrameCallbackMetadata);
  await frame(0);
  await act(async () => worker.emit({ type: "frame", frame: { status: "ready", points: [], sampledAt: 0, captureRequest: null } }));
  await frame(701);
  expect(pose.frame).toBeNull();
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  await act(async () => root.render(null));
  expect(cancel).toHaveBeenCalled();
});
