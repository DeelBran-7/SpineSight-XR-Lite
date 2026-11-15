import {
  Camera,
  CameraOff,
  Check,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  ScanLine,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Notice, StepHeader } from "@/components/Layout";
import { liveOverlayPoints, PoseOverlay } from "@/components/PoseOverlay";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { useVoiceGuidance } from "@/hooks/useVoiceGuidance";
import { guidance, mayCapture } from "@/lib/framing";
import { checkPhoto } from "@/lib/photo";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const TIMERS = [0, 3, 5] as const;

export function CapturePage() {
  const navigate = useNavigate();
  const { setPhoto, id } = useSession();
  const { video, state: camera, stop, retry: retryCamera } = useCamera();
  const { state: pose, frame, requestCapture, cancelCapture, retry: retryPose } = usePoseDetection(video, camera.status === "ready");
  const [delay, setDelay] = useState<(typeof TIMERS)[number]>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [checkingFile, setCheckingFile] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const capturePending = useRef<number | null>(null);
  const active = useRef(false);
  const countdownEnd = useRef<number | null>(null);
  const status = frame?.status ?? "waiting";
  const voice = useVoiceGuidance(status);
  const cameraRunning = camera.status === "ready";
  const guideRunning = cameraRunning && pose.status === "running";
  const ready = guideRunning && status === "ready";
  const canSnap = ready && !snapping && countdown === null && !checkingFile;
  const points = guideRunning && frame ? liveOverlayPoints(frame.points) : null;
  const width = video.current?.videoWidth || 3;
  const height = video.current?.videoHeight || 4;

  function takeOnNextFrame() {
    setError("");
    capturePending.current = requestCapture();
    setSnapping(true);
  }

  function snap() {
    if (!canSnap || !frame || !mayCapture(frame.status, frame.sampledAt, performance.now())) return;
    takeOnNextFrame();
  }

  function armTimer() {
    if (!delay || !guideRunning || snapping || checkingFile || countdown !== null) return;
    setError("");
    countdownEnd.current = performance.now() + delay * 1000;
    setCountdown(delay);
  }

  function cancelTimer() {
    countdownEnd.current = null;
    setCountdown(null);
  }

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      capturePending.current = null;
    };
  }, []);

  useEffect(() => {
    if (countdown === null || !guideRunning) return;
    const timer = window.setInterval(() => {
      const end = countdownEnd.current;
      if (end === null) return;
      const remaining = Math.ceil((end - performance.now()) / 1000);
      if (remaining > 0) {
        setCountdown(remaining);
        return;
      }
      countdownEnd.current = null;
      setCountdown(null);
      capturePending.current = requestCapture();
      setSnapping(true);
    }, 100);
    return () => window.clearInterval(timer);
  }, [countdown, guideRunning, requestCapture]);

  useEffect(() => {
    if (!snapping) return;
    const timeout = window.setTimeout(() => {
      capturePending.current = null;
      cancelCapture();
      setSnapping(false);
      setError("The camera did not provide a fresh frame. Try taking the photo again.");
    }, 3500);
    return () => window.clearTimeout(timeout);
  }, [cancelCapture, snapping]);

  useEffect(() => {
    if (frame?.captureRequest == null || frame.captureRequest !== capturePending.current) return;
    capturePending.current = null;
    setSnapping(false);
    if (!frame.photo) {
      setError(frame.status === "ready"
        ? "The photo could not be created. Try again."
        : `No photo was taken. ${guidance[frame.status].title}. Try again when the guide shows Ready.`);
      return;
    }
    const file = new File([frame.photo], "posture-photo.jpg", { type: "image/jpeg" });
    stop();
    setPhoto(file, id);
    void navigate("/preview", { replace: true });
  }, [frame, id, navigate, setPhoto, stop]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    cancelTimer();
    setError("");
    setCheckingFile(true);
    try {
      const checked = await checkPhoto(file);
      if (!active.current) return;
      stop();
      setPhoto(checked, id);
      void navigate("/preview", { replace: true });
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : "Choose another photo.");
    } finally {
      if (active.current) setCheckingFile(false);
    }
  }

  return (
    <div className="page-shell narrow">
      <StepHeader step={1} back="/instructions" title="Capture your back view" description="Keep your back toward the camera, with your head through upper thighs in view." />
      <section className="surface capture-panel" aria-label="Capture controls">
        <div className="camera-stage" style={cameraRunning ? { aspectRatio: width / height, width: `min(100%, calc(var(--camera-max-height) * ${width / height}))` } : undefined}>
          <video ref={video} autoPlay muted playsInline aria-label="Live camera preview" />
          {cameraRunning && (
            <div className={cn("camera-guide", ready && "camera-guide-ready")} aria-hidden="true">
              <span /><span /><span /><span /><i />
            </div>
          )}
          {cameraRunning && points && <PoseOverlay landmarks={points} width={width} height={height} live />}
          {cameraRunning && <span className="live-label"><i /> Live camera</span>}
          {camera.status !== "ready" && (
            <div className="camera-placeholder">
              {camera.status === "loading" ? <LoaderCircle className="spin" size={30} /> : <CameraOff size={30} />}
              <strong>{camera.status === "loading" ? "Opening the camera" : "Camera unavailable"}</strong>
              {camera.status === "loading" && <p>Allow camera access when prompted.</p>}
            </div>
          )}
          {guideRunning && countdown !== null && <div className="countdown" role="status" aria-label={`Photo timer, ${countdown} seconds`}>{countdown}</div>}
        </div>
        <div className="capture-controls">
          {camera.status === "error" && (
            <Notice variant="error"><CircleAlert size={19} /><span>{camera.message}</span><Button variant="secondary" onClick={retryCamera}>Retry camera</Button></Notice>
          )}
          {cameraRunning && pose.status === "error" && (
            <Notice variant="error"><CircleAlert size={19} /><span>{pose.message}</span><Button variant="secondary" onClick={retryPose}>Retry guidance</Button></Notice>
          )}
          {cameraRunning && pose.status === "loading" && (
            <div className="framing-status" role="status"><LoaderCircle className="spin" size={23} /><div><strong>Loading live guidance</strong><p>Camera frames stay on this device.</p></div></div>
          )}
          {guideRunning && (
            <div className={cn("framing-status", ready && "framing-ready")} role="status">
              <span className="framing-icon">{ready ? <Check size={21} /> : <ScanLine size={21} />}</span>
              <div><strong>{guidance[status].title}</strong><p>{guidance[status].detail}</p></div>
            </div>
          )}
          {error && <Notice variant="error"><CircleAlert size={19} /><span>{error}</span></Notice>}
          {camera.status !== "error" && (
            <>
              <div className="capture-options">
                <fieldset className="timer-field" disabled={!guideRunning || countdown !== null || snapping || checkingFile}>
                  <legend className="sr-only">Photo timer</legend>
                  <Timer size={18} aria-hidden="true" />
                  {TIMERS.map((seconds) => (
                    <label className={delay === seconds ? "timer-selected" : undefined} key={seconds}>
                      <input type="radio" name="capture-timer" value={seconds} checked={delay === seconds} onChange={() => setDelay(seconds)} />
                      <span>{seconds ? `${seconds}s` : "Off"}</span>
                    </label>
                  ))}
                </fieldset>
                {voice.available && (
                  <Button type="button" variant="secondary" aria-pressed={!voice.muted} onClick={voice.toggle} className="voice-toggle">
                    {voice.muted ? <VolumeX size={19} /> : <Volume2 size={19} />} Voice {voice.muted ? "off" : "on"}
                  </Button>
                )}
              </div>
              {countdown !== null ? <Button size="large" variant="secondary" onClick={cancelTimer}>Cancel timer</Button> : (
                <div className="capture-actions">
                  <Button size="large" onClick={snap} disabled={!canSnap}>
                    {snapping ? <LoaderCircle className="spin" size={20} /> : <Camera size={20} />} {snapping ? "Taking photo…" : "Take photo"}
                  </Button>
                  {delay > 0 && (
                    <Button size="large" variant="secondary" onClick={armTimer} disabled={!guideRunning || snapping || checkingFile}>
                      <Timer size={19} /> Start {delay}-second timer
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          <input ref={input} hidden type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => void choosePhoto(event)} />
          <div className="capture-alternative">
            <Button variant="quiet" type="button" onClick={() => input.current?.click()} disabled={checkingFile || snapping}>
              {checkingFile ? <LoaderCircle className="spin" size={18} /> : <ImagePlus size={18} />}
              {checkingFile ? "Opening photo…" : "Choose an existing photo"}
            </Button>
            <Link to="/instructions" className="text-link">Setup tips</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
