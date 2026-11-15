export interface PosePoint {
  x: number;
  y: number;
  visibility: number;
}

export const CORE_INDICES = [11, 12, 23, 24];
const HEAD_INDICES = [0, 7, 8];
export const FRAME_INTERVAL_MS = 140;
export const FRAME_MAX_AGE_MS = 600;
const MIN_VISIBILITY = 0.6;
const MIN_CENTER = 0.35;
const MAX_CENTER = 0.65;
const MIN_BODY_SCALE = 0.36;
const MAX_BODY_SCALE = 0.82;
const FRAME_MARGIN = 0.025;

export const guidance = {
  waiting: { title: "Looking for a pose", detail: "Step into frame with your back toward the camera." },
  no_pose: { title: "Step into the frame", detail: "Show your back from head to upper thighs." },
  low_visibility: { title: "Make your shoulders and hips visible", detail: "Use even light and leave space on either side of your body." },
  center: { title: "Move toward the center", detail: "Line up the middle of your back with the guide." },
  closer: { title: "Move a little closer", detail: "Keep your head and upper thighs inside the frame." },
  farther: { title: "Move a little farther back", detail: "Leave space above your head and below your hips." },
  ready: { title: "Ready to capture", detail: "Hold your natural posture." },
} as const;

export type Guidance = keyof typeof guidance;

function visible(point: PosePoint | undefined): point is PosePoint {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Number.isFinite(point.visibility) && point.visibility >= MIN_VISIBILITY;
}

export function evaluateFraming(points: PosePoint[]): Guidance {
  if (points.length === 0) return "no_pose";
  const core = CORE_INDICES.map((index) => points[index]).filter(visible);
  if (core.length !== CORE_INDICES.length) return "low_visibility";
  const center = core.reduce((sum, point) => sum + point.x, 0) / core.length;
  if (center < MIN_CENTER || center > MAX_CENTER) return "center";

  const head = HEAD_INDICES.map((index) => points[index]).filter(visible);
  const framePoints = [...core, ...head];
  const highest = Math.min(...framePoints.map(({ y }) => y));
  const lowest = Math.max(...framePoints.map(({ y }) => y));
  const clipped = framePoints.some(({ x, y }) => x < FRAME_MARGIN || x > 1 - FRAME_MARGIN
    || y < FRAME_MARGIN || y > 1 - FRAME_MARGIN);
  const minScale = head.length ? MIN_BODY_SCALE : 0.22;
  const maxScale = head.length ? MAX_BODY_SCALE : 0.65;
  if (clipped || lowest - highest > maxScale) return "farther";
  if (lowest - highest < minScale) return "closer";
  return "ready";
}

export function mayCapture(guidanceState: Guidance, capturedAt: number, now: number) {
  const age = now - capturedAt;
  return guidanceState === "ready" && Number.isFinite(age) && age >= 0 && age <= FRAME_MAX_AGE_MS;
}

// Preserve the camera's aspect ratio; guidance need not copy a full sensor frame.
export function frameSize(width: number, height: number, capturing: boolean) {
  const scale = Math.min(1, (capturing ? 1600 : 768) / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
