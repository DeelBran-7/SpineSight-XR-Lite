import { useCallback, useEffect, useRef, useState } from "react";

type CameraState =
  | { status: "loading" }
  | { status: "ready" }
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
  const [state, setState] = useState<CameraState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
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
      if (disposed || !element) return;
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
        if (disposed) {
          stopTracks(cameraStream);
          return;
        }
        stream.current = cameraStream;
        element.srcObject = cameraStream;
        await element.play();
        if (!disposed) setState({ status: "ready" });
      } catch (error) {
        if (!disposed) {
          stop();
          setState({ status: "error", message: cameraErrorMessage(error) });
        }
      }
    }
    void Promise.resolve().then(start);
    return () => {
      disposed = true;
      stop();
      if (element) element.srcObject = null;
    };
  }, [attempt, stop]);

  return { video, state, stop, retry };
}
