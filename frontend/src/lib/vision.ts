import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { evaluateFraming, type Guidance, type PosePoint } from "./framing";

export interface PoseFrame {
  status: Guidance;
  points: PosePoint[];
  sampledAt: number;
  captureRequest: number | null;
  photo?: Blob;
}

export interface FrameRequest {
  type: "frame";
  image: ImageBitmap;
  sampledAt: number;
  capture: number | null;
}

export interface InitializeRequest {
  type: "initialize";
  rootUrl: string;
}

export type WorkerRequest = FrameRequest | InitializeRequest;
export type WorkerResponse = { type: "ready" }
  | { type: "frame"; frame: PoseFrame }
  | { type: "error"; stage: "initialize" | "infer" };

export async function createPoseLandmarker(rootUrl: string, inWorker: boolean, signal?: AbortSignal) {
  const base = new URL(import.meta.env.BASE_URL, rootUrl);
  const wasm = new URL("wasm", base).href;
  const model = new URL("models/pose_landmarker_lite.task", base);
  model.searchParams.set("v", "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a");
  const response = await fetch(model.href, { signal });
  if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Pose Landmarker Lite model is unavailable.");
  }
  const modelAssetBuffer = new Uint8Array(await response.arrayBuffer());
  const files = await FilesetResolver.forVisionTasks(wasm, inWorker);
  for (const key of ["wasmLoaderPath", "wasmBinaryPath", "assetLoaderPath", "assetBinaryPath"] as const) {
    if (files[key]) {
      const asset = new URL(files[key]);
      asset.searchParams.set("v", "1.2.3");
      files[key] = asset.href;
    }
  }
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetBuffer, delegate: "CPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    outputSegmentationMasks: false,
    ...(inWorker ? { canvas: new OffscreenCanvas(1, 1) } : {}),
  });
}

export function detectPose(model: PoseLandmarker, source: HTMLCanvasElement | ImageBitmap, sampledAt: number, captureRequest: number | null): PoseFrame {
  const detected = model.detectForVideo(source, sampledAt).landmarks[0] ?? [];
  const points = detected.map(({ x, y, visibility }) => ({ x, y, visibility }));
  return { status: evaluateFraming(points), points, sampledAt, captureRequest };
}
