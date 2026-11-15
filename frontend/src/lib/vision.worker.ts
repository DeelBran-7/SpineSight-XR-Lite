import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { createPoseLandmarker, detectPose, type WorkerRequest, type WorkerResponse } from "./vision";

const worker = self as DedicatedWorkerGlobalScope;
let model: PoseLandmarker | null = null;

function send(response: WorkerResponse) {
  worker.postMessage(response);
}

worker.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === "initialize") {
    try {
      model = await createPoseLandmarker(data.rootUrl, true);
      send({ type: "ready" });
    } catch {
      send({ type: "error", stage: "initialize" });
    }
    return;
  }

  try {
    if (!model) throw new Error("Pose model is unavailable.");
    const frame = detectPose(model, data.image, data.sampledAt, data.capture);
    if (data.capture && frame.status === "ready") {
      try {
        const canvas = new OffscreenCanvas(data.image.width, data.image.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Photo canvas is unavailable.");
        context.drawImage(data.image, 0, 0);
        frame.photo = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
      } catch {
        frame.photo = undefined;
      }
    }
    send({ type: "frame", frame });
  } catch {
    send({ type: "error", stage: "infer" });
  } finally {
    data.image.close();
  }
};
