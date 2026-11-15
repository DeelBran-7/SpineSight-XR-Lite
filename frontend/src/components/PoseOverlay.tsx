import type { Landmark } from "@/lib/api";
import type { PosePoint } from "@/lib/framing";

type OverlayPoints = {
  left_shoulder: Omit<Landmark, "visibility">;
  right_shoulder: Omit<Landmark, "visibility">;
  left_hip: Omit<Landmark, "visibility">;
  right_hip: Omit<Landmark, "visibility">;
};

function midpoint(a: PosePoint | Pick<PosePoint, "x" | "y">, b: Pick<PosePoint, "x" | "y">) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function PoseOverlay({ landmarks, width, height, live = false }: {
  landmarks: OverlayPoints;
  width: number;
  height: number;
  live?: boolean;
}) {
  const { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh } = landmarks;
  const shoulder = midpoint(ls, rs);
  const hip = midpoint(lh, rh);
  const color = live ? "#a9f5e0" : "#97ddff";

  return (
    <svg className="pose-overlay" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {[[ls, rs], [lh, rh], [shoulder, hip]].map(([start, end], index) => (
        <g key={index}>
          <line x1={start.x * width} y1={start.y * height} x2={end.x * width} y2={end.y * height}
            stroke="#162c42" strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          <line x1={start.x * width} y1={start.y * height} x2={end.x * width} y2={end.y * height}
            stroke={color} strokeWidth={2} strokeDasharray={index === 2 ? "4 6" : undefined}
            vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        </g>
      ))}
      {[ls, rs, lh, rh].map((point, index) => (
        <circle key={index} cx={point.x * width} cy={point.y * height} r={Math.max(width, height) * 0.009}
          fill={color} stroke="#16425d" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

export function liveOverlayPoints(points: PosePoint[]): OverlayPoints | null {
  const [ls, rs, lh, rh] = [points[11], points[12], points[23], points[24]];
  if (![ls, rs, lh, rh].every((point) => point && point.visibility >= 0.6
    && Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  return { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh };
}
