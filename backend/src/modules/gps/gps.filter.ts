export type Fix = { latitude: number; longitude: number; recordedAt: Date; accuracyMeters: number; speedKph: number | null; motion?: "stationary" | "moving" | "unknown"; hdop?: number | null; satellites?: number | null; gnssFixOk?: boolean; fixType?: number; speedAccuracyKph?: number };
export type FilterState = Fix & { variance: number };
export function metersBetween(a: Pick<Fix, "latitude" | "longitude">, b: Pick<Fix, "latitude" | "longitude">) {
  const r = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Accuracy-weighted scalar Kalman update on each position axis; variance in m².
// Quality metadata changes Kalman confidence; it never suppresses a valid fix.
export function filterFix(fix: Fix, previous?: FilterState | null, maxSpeedKph = 200): { reason: string; state: FilterState | null } {
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) || Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180)
    return { reason: "invalid_coordinates", state: null };
  if (fix.hdop != null && fix.hdop > 4) return { reason: "poor_hdop", state: null };
  if (fix.satellites != null && fix.satellites > 0 && fix.satellites < 4) return { reason: "poor_satellites", state: null };
  if (fix.speedKph != null && fix.speedKph > maxSpeedKph) return { reason: "implausible_speed", state: null };
  if (fix.gnssFixOk === false || (fix.fixType != null && ![3, 4].includes(fix.fixType))) return { reason: "invalid_gnss_fix", state: null };
  if (fix.speedAccuracyKph != null && fix.speedAccuracyKph > 3.6) return { reason: "poor_speed_accuracy", state: null };
  if (fix.accuracyMeters > 30) return { reason: "poor_accuracy", state: null };
  const variance = Math.max(5, fix.accuracyMeters) ** 2;
  if (!previous) return { reason: "accepted", state: { ...fix, variance } };
  const dt = (fix.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
  if (dt <= 0) return { reason: "out_of_order", state: null };
  if (dt > 60) return { reason: "reacquired", state: { ...fix, variance } };
  const displacement = metersBetween(previous, fix);
  if (displacement > 55 * dt + 3 * Math.sqrt(variance + previous.variance))
    return { reason: "implausible_jump", state: null };
  const lowSpeed = fix.speedKph != null && fix.speedKph < 2.5;
  const quiet = fix.motion === "stationary" && lowSpeed;
  // Old firmware can still benefit from a small GPS-only deadband. Confirm
  // low speed across both readings; MPU motion always releases the hold.
  const slow = lowSpeed && previous.speedKph != null && previous.speedKph < 2.5;
  if (quiet || slow) {
    return { reason: "stationary", state: { ...fix, latitude: previous.latitude, longitude: previous.longitude, variance: previous.variance } };
  }
  const processVariance = Math.max(1, (fix.speedKph ?? 10) / 3.6) ** 2 * dt;
  const predictedVariance = previous.variance + processVariance;
  // Large innovations lower measurement confidence instead of dragging the
  // marker across the map. The reading is still recorded, with its timestamp.
  const allowance = Math.max(15, 3 * Math.sqrt(predictedVariance + variance)) + (fix.speedKph ?? 0) / 3.6 * dt;
  const measurementVariance = variance * Math.max(1, (displacement / allowance) ** 2);
  const gain = predictedVariance / (predictedVariance + measurementVariance);
  return { reason: "accepted", state: { ...fix,
    latitude: previous.latitude + gain * (fix.latitude - previous.latitude),
    longitude: ((previous.longitude + gain * (((fix.longitude - previous.longitude + 540) % 360) - 180) + 540) % 360) - 180,
    variance: (1 - gain) * predictedVariance,
  } };
}
