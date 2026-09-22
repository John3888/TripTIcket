export type Fix = { latitude: number; longitude: number; recordedAt: Date; accuracyMeters: number; speedKph: number | null };
export type FilterState = Fix & { variance: number };
export function signalQuality(body: { satellites?: number | null; hdop?: number | null; accuracyMeters?: number | null }) {
  if (body.satellites == null || body.satellites < 6) return "poor_satellites";
  if (body.hdop == null || body.hdop <= 0 || body.hdop > 2.5) return "poor_hdop";
  if ((body.accuracyMeters ?? body.hdop * 5) > 25) return "poor_accuracy";
  return null;
}
export function metersBetween(a: Pick<Fix, "latitude" | "longitude">, b: Pick<Fix, "latitude" | "longitude">) {
  const r = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Accuracy-weighted scalar Kalman update on each position axis; variance in m².
// Gates are deliberately applied before smoothing so a teleport cannot poison state.
export function filterFix(fix: Fix, previous?: FilterState | null): { reason: string; state: FilterState | null } {
  if (fix.accuracyMeters > 60) return { reason: "poor_accuracy", state: null };
  const variance = Math.max(5, fix.accuracyMeters) ** 2;
  if (!previous) return { reason: "accepted", state: { ...fix, variance } };
  const dt = (fix.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
  if (dt <= 0) return { reason: "out_of_order", state: null };
  if (dt > 60) return { reason: "reacquired", state: { ...fix, variance } };
  const displacement = metersBetween(previous, fix);
  if (displacement > 55 * dt + 3 * Math.sqrt(variance + previous.variance)) return { reason: "implausible_jump", state: null };
  const stationary = fix.speedKph != null && fix.speedKph < 3 && displacement < Math.min(25, Math.max(8, fix.accuracyMeters * 1.5));
  if (stationary) return { reason: "stationary", state: { ...fix, latitude: previous.latitude, longitude: previous.longitude, variance: previous.variance } };
  const processVariance = Math.max(2, (fix.speedKph ?? 18) / 3.6) ** 2 * dt;
  const predictedVariance = previous.variance + processVariance;
  const gain = predictedVariance / (predictedVariance + variance);
  return { reason: "accepted", state: { ...fix,
    latitude: previous.latitude + gain * (fix.latitude - previous.latitude),
    longitude: previous.longitude + gain * (fix.longitude - previous.longitude),
    variance: (1 - gain) * predictedVariance,
  } };
}
