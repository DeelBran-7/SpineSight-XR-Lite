import { useCallback, useEffect, useRef, useState } from "react";

type CameraState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "paused" }
  | { status: "error"; message: string };

export function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access is blocked. Allow it in your browser settings and try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found. Connect a camera or choose an existing photo.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is unavailable. Close other apps using it and try again.";
    default:
      return "The camera could not start. Try again or choose an existing photo.";
  }
}

export function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [state, setState] = useState<CameraState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    generation.current += 1;
    stopTracks(stream.current);
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const element = video.current;
    let disposed = false;
    async function start() {
      if (disposed || !element || document.visibilityState === "hidden") return;
      const request = ++generation.current;
      setState({ status: "loading" });
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ status: "error", message: window.isSecureContext
          ? "This browser does not provide camera access. You can choose an existing photo."
          : "This browser needs an HTTPS connection to open the camera. You can still choose an existing photo." });
        return;
      }

      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1440 } },
        });
        if (disposed || request !== generation.current || document.hidden) {
          stopTracks(cameraStream);
          return;
        }
        stream.current = cameraStream;
        cameraStream.getVideoTracks().forEach((track) => track.addEventListener("ended", () => {
          if (!disposed && stream.current === cameraStream) {
            stop();
            setState({ status: "error", message: "The camera was disconnected. Reconnect it and try again." });
          }
        }, { once: true }));
        element.srcObject = cameraStream;
        await element.play();
        if (!disposed && request === generation.current) setState({ status: "ready" });
      } catch (error) {
        if (!disposed && request === generation.current) {
          stop();
          setState({ status: "error", message: cameraErrorMessage(error) });
        }
      }
    }
    function visibilityChanged() {
      if (document.visibilityState === "hidden") {
        stop();
        setState({ status: "paused" });
      } else {
        void start();
      }
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    if (document.visibilityState === "hidden") setState({ status: "paused" });
    else void Promise.resolve().then(start);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibilityChanged);
      stop();
      if (element) element.srcObject = null;
    };
  }, [attempt, stop]);

  return { video, state, stop, retry };
}
