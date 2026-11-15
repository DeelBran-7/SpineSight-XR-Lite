import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { FRAME_INTERVAL_MS, FRAME_MAX_AGE_MS, frameSize } from "@/lib/framing";
import type { PoseFrame, WorkerRequest, WorkerResponse } from "@/lib/vision";

type PoseState =
  | { status: "loading" }
  | { status: "running" }
  | { status: "error"; message: string };

const INFERENCE_TIMEOUT_MS = 3000;
const INITIALIZE_TIMEOUT_MS = 20000;

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
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!enabled || !video.current) return;
    const element = video.current;
    let active = true;
    let failed = false;
    let busy = false;
    let worker: Worker | null = null;
    let model: PoseLandmarker | null = null;
    let detect: typeof import("@/lib/vision").detectPose | null = null;
    let sampleCanvas: HTMLCanvasElement | null = null;
    let sampleContext: CanvasRenderingContext2D | null = null;
    let animation = 0;
    let watchdog = 0;
    let lastTime = -Infinity;
    let lastVideoTime = -1;
    let lastPublished = -Infinity;
    let deliveredFrame = 0;
    let deliveredAt = performance.now();
    let sampledFrame = -1;
    let videoCallback = 0;
    const receivesVideoFrames = typeof element.requestVideoFrameCallback === "function";
    function videoFrame(now: number) {
      if (!active || failed) return;
      deliveredFrame += 1;
      deliveredAt = now;
      videoCallback = element.requestVideoFrameCallback(videoFrame);
    }
    if (receivesVideoFrames) videoCallback = element.requestVideoFrameCallback(videoFrame);
    let usingFallback = false;
    const initialization = new AbortController();
    setState({ status: "loading" });
    setFrame(null);

    function terminateWorker() {
      worker?.terminate();
      worker = null;
    }

    function publish(result: PoseFrame) {
      if (!active || failed) return;
      clearTimeout(watchdog);
      busy = false;
      lastPublished = result.sampledAt;
      // Inference and JPEG encoding can complete after the person has moved.
      if (performance.now() - result.sampledAt > FRAME_MAX_AGE_MS) {
        setFrame(result.captureRequest === null ? null : { ...result, status: "waiting", photo: undefined });
      } else {
        setFrame(result);
      }
    }

    function fail(message: string) {
      if (!active || failed) return;
      failed = true;
      queuedCapture.current = null;
      clearTimeout(watchdog);
      cancelAnimationFrame(animation);
      if (receivesVideoFrames) element.cancelVideoFrameCallback(videoCallback);
      initialization.abort();
      terminateWorker();
      model?.close();
      model = null;
      setFrame(null);
      setState({ status: "error", message });
    }

    async function beginFallback() {
      if (usingFallback || !active || failed) return;
      usingFallback = true;
      clearTimeout(watchdog);
      cancelAnimationFrame(animation);
      terminateWorker();
      setFrame(null);
      setState({ status: "loading" });
      watchdog = window.setTimeout(() => fail("Live framing guidance took too long to start. Retry guidance or choose an existing photo."), INITIALIZE_TIMEOUT_MS);
      try {
        const vision = await import("@/lib/vision");
        if (!active || failed) return;
        const localModel = await vision.createPoseLandmarker(window.location.href, false, initialization.signal);
        if (!active || failed) {
          localModel.close();
          return;
        }
        clearTimeout(watchdog);
        model = localModel;
        detect = vision.detectPose;
        sampleCanvas = document.createElement("canvas");
        sampleContext = sampleCanvas.getContext("2d", { alpha: false });
        if (!sampleContext) throw new Error("Frame canvas unavailable.");
        busy = false;
        lastVideoTime = -1;
        setState({ status: "running" });
        animation = requestAnimationFrame(tick);
      } catch {
        fail("Live framing guidance could not start. Try again or choose an existing photo.");
      }
    }

    async function sample(time: number, capture: number | null) {
      const target = worker;
      watchdog = window.setTimeout(() => {
        if (target) void beginFallback();
        else fail("Live framing guidance stopped responding. Retry guidance or choose an existing photo.");
      }, INFERENCE_TIMEOUT_MS);
      try {
        const size = frameSize(element.videoWidth, element.videoHeight, capture !== null);
        if (target) {
          const bitmap = await createImageBitmap(element, { resizeWidth: size.width, resizeHeight: size.height });
          if (!active || failed || target !== worker) {
            bitmap.close();
            return;
          }
          const message: WorkerRequest = { type: "frame", image: bitmap, sampledAt: time, capture };
          try {
            target.postMessage(message, [bitmap]);
          } catch (error) {
            bitmap.close();
            throw error;
          }
        } else if (model && detect && sampleCanvas && sampleContext) {
          if (sampleCanvas.width !== size.width) sampleCanvas.width = size.width;
          if (sampleCanvas.height !== size.height) sampleCanvas.height = size.height;
          sampleContext.drawImage(element, 0, 0, size.width, size.height);
          const result = detect(model, sampleCanvas, time, capture);
          if (capture !== null && result.status === "ready") result.photo = await canvasPhoto(sampleCanvas);
          publish(result);
        }
      } catch {
        if (target && target === worker) await beginFallback();
        else if (!target) fail("Live framing guidance stopped. Try again or choose an existing photo.");
      }
    }

    function tick(now: number) {
      if (!active || failed) return;
      animation = requestAnimationFrame(tick);
      if (now - lastPublished > FRAME_MAX_AGE_MS && lastPublished !== -Infinity) {
        lastPublished = -Infinity;
        setFrame(null);
      }
      if (busy || document.visibilityState === "hidden" || now - lastTime < FRAME_INTERVAL_MS || element.readyState < 2
        || !element.videoWidth || (receivesVideoFrames && now - deliveredAt > FRAME_MAX_AGE_MS)
        || (receivesVideoFrames ? deliveredFrame === sampledFrame : element.currentTime === lastVideoTime)) return;
      busy = true;
      lastTime = now;
      lastVideoTime = element.currentTime;
      sampledFrame = deliveredFrame;
      const capture = queuedCapture.current;
      queuedCapture.current = null;
      void sample(receivesVideoFrames ? deliveredAt : now, capture);
    }

    if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined"
      && typeof createImageBitmap === "function") {
      try {
        const instance = new Worker(new URL("../lib/vision.worker.ts", import.meta.url), { type: "module" });
        worker = instance;
        instance.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          if (!active || failed || worker !== instance) return;
          if (data.type === "ready") {
            clearTimeout(watchdog);
            setState({ status: "running" });
            animation = requestAnimationFrame(tick);
          } else if (data.type === "frame") publish(data.frame);
          else void beginFallback();
        };
        instance.onerror = () => { if (worker === instance) void beginFallback(); };
        instance.onmessageerror = () => { if (worker === instance) void beginFallback(); };
        const message: WorkerRequest = { type: "initialize", rootUrl: window.location.href };
        instance.postMessage(message);
        watchdog = window.setTimeout(() => { void beginFallback(); }, INITIALIZE_TIMEOUT_MS);
      } catch {
        void beginFallback();
      }
    } else {
      void beginFallback();
    }

    return () => {
      active = false;
      queuedCapture.current = null;
      clearTimeout(watchdog);
      cancelAnimationFrame(animation);
      if (receivesVideoFrames) element.cancelVideoFrameCallback(videoCallback);
      initialization.abort();
      terminateWorker();
      model?.close();
      model = null;
      if (sampleCanvas) sampleCanvas.width = sampleCanvas.height = 0;
    };
  }, [attempt, enabled, video]);

  return { state, frame, requestCapture, cancelCapture, retry };
}
