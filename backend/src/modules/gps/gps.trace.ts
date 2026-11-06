import { advanceMotion, usableTracePoint, type MotionState } from "./gps.motion.js";
export type Point = { id: string; latitude: number; longitude: number; recordedAt: string; accuracyMeters: number | null; speedKph?: number | null };
export type Segment = { coordinates: number[][]; distanceMeters: number; estimated: boolean; kind: "observed" };

export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Raw records remain intact; the displayed path contains confirmed movement.
export function motionTrace(points: Point[], maxSpeedKph = 200) {
  const groups: Point[][] = [];
  let state: MotionState<Point> | undefined;
  let lastTrusted: Point | undefined;
  for (const point of points) {
    if (!usableTracePoint(point, maxSpeedKph)) {
      if (state) state = { ...state, moving: false, candidates: [], interrupted: true };
      continue;
    }
    lastTrusted = point;
    const next = advanceMotion(state, point); state = next.state;
    if (!next.vertex) continue;
    if (!groups.length || next.gap) groups.push([next.vertex]);
    else groups.at(-1)!.push(next.vertex);
  }
  return { groups, state, lastTrusted };
}

export function cleanTrace(points: Point[]) { return motionTrace(points).groups; }

export function observed(points: Point[]): Segment {
  return {
    coordinates: points.map((p) => [p.longitude, p.latitude]),
    distanceMeters: points.slice(1).reduce((sum, p, i) => sum + distance(points[i]!, p), 0),
    estimated: false, kind: "observed",
  };
}
