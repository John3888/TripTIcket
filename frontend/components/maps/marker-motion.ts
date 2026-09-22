import type { LatLngTuple, Marker } from "leaflet";

// Interpolate distance along the observed road geometry, never a predicted route.
export function motionPath(start: LatLngTuple, end: LatLngTuple, segments: number[][][]): LatLngTuple[] | null {
  const distance = (a: LatLngTuple, b: LatLngTuple) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180));
  for (const coordinates of [...segments].reverse()) {
    const path = coordinates.map(([lng, lat]) => [lat, lng] as LatLngTuple);
    const project = (point: LatLngTuple) => {
      let best = { index: 0, t: 0, point, distance: Infinity };
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const scale = Math.cos(point[0] * Math.PI / 180);
        const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0];
        const t = Math.max(0, Math.min(1, (((point[1] - a[1]) * scale * dx) + (point[0] - a[0]) * dy) / (dx * dx + dy * dy || 1)));
        const candidate: LatLngTuple = [a[0] + t * dy, a[1] + t * (b[1] - a[1])];
        const d = distance(point, candidate);
        if (d < best.distance) best = { index: i, t, point: candidate, distance: d };
      }
      return best;
    };
    const a = project(start), b = project(end);
    if (a.distance <= 25 && b.distance <= 3 && b.index + b.t >= a.index + a.t) {
      const result = [a.point, ...path.slice(a.index + 1, b.index + 1), b.point];
      const length = result.slice(1).reduce((sum, point, i) => sum + distance(result[i], point), 0);
      // Avoid replaying a prior loop when a road is visited more than once.
      if (length <= Math.max(100, distance(start, end) * 3) && length < 1000) return result;
    }
  }
  return null;
}

export function animateMarker(marker: Marker, path: LatLngTuple[], duration: number) {
  const lengths = path.slice(1).map((p, i) =>
    Math.hypot((p[0] - path[i][0]) * 111320, (p[1] - path[i][1]) * 111320 * Math.cos(p[0] * Math.PI / 180)));
  const total = lengths.reduce((sum, d) => sum + d, 0);
  let frame = 0;
  const started = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - started) / duration);
    let remaining = total * progress;
    let index = 0;
    while (index < lengths.length - 1 && remaining > lengths[index]) remaining -= lengths[index++];
    const t = Math.min(1, remaining / (lengths[index] || 1));
    const a = path[index], b = path[index + 1] ?? a;
    marker.setLatLng([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    if (progress < 1) frame = requestAnimationFrame(step);
    else marker.setLatLng(path[path.length - 1]);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
