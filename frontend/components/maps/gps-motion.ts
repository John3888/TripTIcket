export type MotionPoint = {
  latitude: number; longitude: number; recordedAt: string;
  speedKph?: number | null; motion?: "stationary" | "moving" | "unknown";
  accuracyMeters?: number | null;
};
export type MotionState<T extends MotionPoint> = {
  anchor: T; lastObservedAt: string; moving: boolean; stoppedSamples: number; candidates: T[];
  interrupted?: boolean;
};
export function usableTracePoint(point: MotionPoint, maxSpeedKph = 200) {
  return (point.speedKph == null || point.speedKph <= maxSpeedKph) && (point.accuracyMeters == null || point.accuracyMeters <= 30);
}
export function motionDistance(a: MotionPoint, b: MotionPoint) {
  const r = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Hysteresis: stopping and starting use different evidence. Low-speed coordinate
// drift never becomes movement just because it wandered outside a radius.
export function advanceMotion<T extends MotionPoint>(previous: MotionState<T> | undefined, point: T) {
  const gap = !!previous && Date.parse(point.recordedAt) - Date.parse(previous.lastObservedAt) > 60000;
  if (!previous || gap) return {
    state: { anchor: point, lastObservedAt: point.recordedAt, moving: false, stoppedSamples: 0, candidates: [] } as MotionState<T>,
    vertex: point as T | undefined, gap,
  };
  const state = { ...previous, lastObservedAt: point.recordedAt };
  const speed = point.speedKph;
  const known = speed != null && Number.isFinite(speed);
  const stopped = known ? speed < 1.5 : point.motion === "stationary";
  if (stopped) {
    state.stoppedSamples++;
    if (state.stoppedSamples >= 2) state.moving = false;
    state.candidates = [];
    return { state, vertex: undefined, gap: false };
  }
  state.stoppedSamples = 0;
  if (!state.moving) {
    const candidate = known ? speed >= 2.5 : point.motion !== "stationary";
    if (!candidate) { state.candidates = []; return { state, vertex: undefined, gap: false }; }
    state.candidates = [...state.candidates, point].slice(-3);
    if (state.candidates.length < 3) return { state, vertex: undefined, gap: false };
    const a = state.candidates[0]!, b = state.candidates[1]!, c = state.candidates[2]!;
    const ab = motionDistance(a, b), bc = motionDistance(b, c), ac = motionDistance(a, c);
    const elapsed = (Date.parse(c.recordedAt) - Date.parse(a.recordedAt)) / 1000;
    const consistent = ab >= 0.25 && bc >= 0.25 && ac >= (ab + bc) * 0.8 && elapsed > 0 && (ab + bc) / elapsed < 55;
    if (!consistent || motionDistance(state.anchor, point) < (known ? 8 : 20)) return { state, vertex: undefined, gap: false };
    state.moving = true; state.candidates = [];
  }
  // Accumulate short genuine steps rather than drawing sub-metre GPS noise.
  if (motionDistance(state.anchor, point) < 2) return { state, vertex: undefined, gap: false };
  state.anchor = point;
  const interrupted = state.interrupted ?? false;
  state.interrupted = false;
  return { state, vertex: point as T | undefined, gap: interrupted };
}
