// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCamera } from "./useCamera";

let root: Root;
let camera: ReturnType<typeof useCamera>;
let getUserMedia: ReturnType<typeof vi.fn>;
let visibility: DocumentVisibilityState;

function Probe() {
  camera = useCamera();
  return <video ref={camera.video} />;
}
function stream() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn() });
  const media = new MediaStream();
  Object.assign(media, { getTracks: () => [track], getVideoTracks: () => [track] });
  return { track, media };
}
async function mount() { await act(async () => root.render(<StrictMode><Probe /></StrictMode>)); }
async function show(next: DocumentVisibilityState) {
  visibility = next;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => visibility === "hidden");
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); });

it("opens one camera under StrictMode and releases it on unmount", async () => {
  const first = stream();
  getUserMedia.mockResolvedValue(first.media);
  await mount();
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(camera.state.status).toBe("ready");
  await act(async () => root.render(null));
  expect(first.track.stop).toHaveBeenCalledOnce();
});

it("stops background tracks and opens a fresh camera on return", async () => {
  const first = stream();
  const second = stream();
  getUserMedia.mockResolvedValueOnce(first.media).mockResolvedValueOnce(second.media);
  await mount();
  await show("hidden");
  expect(first.track.stop).toHaveBeenCalledOnce();
  expect(camera.state.status).toBe("paused");
  expect(camera.video.current?.srcObject).toBeNull();
  await show("visible");
  expect(camera.state.status).toBe("ready");
  expect(camera.video.current?.srcObject).toBe(second.media);
});

it("releases a late permission response instead of reopening a hidden camera", async () => {
  const first = stream();
  let finish!: (value: MediaStream) => void;
  getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => { finish = resolve; }));
  await mount();
  await show("hidden");
  await act(async () => finish(first.media));
  expect(first.track.stop).toHaveBeenCalledOnce();
  expect(camera.state.status).toBe("paused");
  expect(camera.video.current?.srcObject).toBeNull();
});

it("discards an older camera permission response after a rapid hide and resume", async () => {
  const older = stream();
  const newer = stream();
  let finish!: (value: MediaStream) => void;
  getUserMedia.mockReturnValueOnce(new Promise<MediaStream>((resolve) => { finish = resolve; })).mockResolvedValueOnce(newer.media);
  await mount();
  await show("hidden");
  await show("visible");
  await act(async () => finish(older.media));
  expect(older.track.stop).toHaveBeenCalledOnce();
  expect(newer.track.stop).not.toHaveBeenCalled();
  expect(camera.video.current?.srcObject).toBe(newer.media);
});

it("reports an ended camera track and supports retry", async () => {
  const first = stream();
  const second = stream();
  getUserMedia.mockResolvedValueOnce(first.media).mockResolvedValueOnce(second.media);
  await mount();
  await act(async () => first.track.dispatchEvent(new Event("ended")));
  expect(camera.state.status).toBe("error");
  await act(async () => camera.retry());
  expect(camera.state.status).toBe("ready");
  expect(camera.video.current?.srcObject).toBe(second.media);
});
