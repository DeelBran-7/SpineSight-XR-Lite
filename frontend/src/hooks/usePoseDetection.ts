import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { FRAME_INTERVAL_MS, FRAME_MAX_AGE_MS } from "@/lib/framing";
import type { PoseFrame, WorkerRequest, WorkerResponse } from "@/lib/vision";

type PoseState =
  | { status: "loading" }
  | { status: "running" }
  | { status: "error"; message: string };

function canvasPhoto(canvas: HTMLCanvasElement) {
  return new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), "image/jpeg", 0.9);
  });
}

export function usePoseDetection(video: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [state, setState] = useState<PoseState>({ status: "loading" });
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [attempt, setAttempt] = useState(0);
  const nextRequest = useRef(0);
  const queuedCapture = useRef<number | null>(null);

  const requestCapture = useCallback(() => {
    const request = ++nextRequest.current;
    queuedCapture.current = request;
    return request;
  }, []);
  const cancelCapture = useCallback(() => { queuedCapture.current = null; }, []);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setFrame(null);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const element = video.current;
    if (!element) return;
    let active = true;
    let busy = false;
    let worker: Worker | null = null;
    let model: PoseLandmarker | null = null;
    let sampleCanvas: HTMLCanvasElement | null = null;
    let sampleContext: CanvasRenderingContext2D | null = null;
    let animation = 0;
    let workerTimeout = 0;
    let lastTime = -Infinity;
    let lastVideoTime = -1;
    let lastPublished = -Infinity;
    let usingFallback = false;

    function publish(result: PoseFrame) {
      if (!active) return;
      busy = false;
      lastPublished = result.sampledAt;
      setFrame(result);
    }

    function fail(message: string) {
      if (!active) return;
      busy = false;
      queuedCapture.current = null;
      cancelAnimationFrame(animation);
      setFrame(null);
      setState({ status: "error", message });
    }

    function terminateWorker() {
      clearTimeout(workerTimeout);
      worker?.terminate();
      worker = null;
    }

    async function beginFallback() {
      if (usingFallback || !active) return;
      usingFallback = true;
      terminateWorker();
      try {
        const { createPoseLandmarker } = await import("@/lib/vision");
        const localModel = await createPoseLandmarker(window.location.href, false);
        if (!active) {
          localModel.close();
          return;
        }
        model = localModel;
        sampleCanvas = document.createElement("canvas");
        sampleContext = sampleCanvas.getContext("2d", { alpha: false });
        if (!sampleContext) throw new Error("Frame canvas unavailable.");
        busy = false;
        setState({ status: "running" });
        cancelAnimationFrame(animation);
        animation = requestAnimationFrame(tick);
      } catch {
        fail("Live framing guidance could not start. Try again or choose an existing photo.");
      }
    }

    async function sample(source: HTMLVideoElement, time: number, capture: number | null) {
      try {
        if (worker) {
          const bitmap = await createImageBitmap(source);
          if (!active || !worker) {
            bitmap.close();
            return;
          }
          const message: WorkerRequest = { type: "frame", image: bitmap, sampledAt: time, capture };
          worker.postMessage(message, [bitmap]);
        } else if (model && sampleCanvas && sampleContext) {
          const { detectPose } = await import("@/lib/vision");
          if (!active || !model) return;
          sampleCanvas.width = source.videoWidth;
          sampleCanvas.height = source.videoHeight;
          sampleContext.drawImage(source, 0, 0);
          const result = detectPose(model, sampleCanvas, time, capture);
          if (capture && result.status === "ready") result.photo = await canvasPhoto(sampleCanvas);
          publish(result);
        }
      } catch {
        if (worker) {
          busy = true;
          await beginFallback();
        } else {
          fail("Live framing guidance stopped. Try again or choose an existing photo.");
        }
      }
    }

    function tick(now: number) {
      if (!active || !element) return;
      animation = requestAnimationFrame(tick);
      if (now - lastPublished > FRAME_MAX_AGE_MS && lastPublished !== -Infinity) {
        lastPublished = -Infinity;
        setFrame((current) => current?.photo ? current : null);
      }
      if (busy || now - lastTime < FRAME_INTERVAL_MS || element.readyState < 2
        || !element.videoWidth || element.currentTime === lastVideoTime) return;
      busy = true;
      lastTime = now;
      lastVideoTime = element.currentTime;
      const capture = queuedCapture.current;
      queuedCapture.current = null;
      void sample(element, now, capture);
    }

    if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined"
      && typeof createImageBitmap === "function") {
      try {
        worker = new Worker(new URL("../lib/vision.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          if (!active) return;
          if (data.type === "ready") {
            clearTimeout(workerTimeout);
            setState({ status: "running" });
            animation = requestAnimationFrame(tick);
          } else if (data.type === "frame") {
            publish(data.frame);
          } else {
            void beginFallback();
          }
        };
        worker.onerror = () => { void beginFallback(); };
        const message: WorkerRequest = { type: "initialize", rootUrl: window.location.href };
        worker.postMessage(message);
        workerTimeout = window.setTimeout(() => { void beginFallback(); }, 20000);
      } catch {
        void beginFallback();
      }
    } else {
      void beginFallback();
    }

    return () => {
      active = false;
      queuedCapture.current = null;
      cancelAnimationFrame(animation);
      terminateWorker();
      model?.close();
      model = null;
    };
  }, [attempt, enabled, video]);

  return { state, frame, requestCapture, cancelCapture, retry };
}
