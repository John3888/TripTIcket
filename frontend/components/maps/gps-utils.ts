import type { CompanyLocation } from "@/config/company-locations";
import type { GpsPoint } from "@/types/trip-ticket";

export function hasValidCoordinates(
  point: unknown,
): point is { latitude: number; longitude: number } {
  if (!point || typeof point !== "object") return false;
  const { latitude, longitude } = point as Record<string, unknown>;
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function validCompanyLocations(locations: readonly CompanyLocation[]) {
  const ids = new Set<string>();
  return locations.filter((location) => {
    if (
      !hasValidCoordinates(location) ||
      typeof location.id !== "string" ||
      !location.id.trim() ||
      ids.has(location.id) ||
      typeof location.name !== "string" ||
      !location.name.trim() ||
      !["branch", "sister-company", "main"].includes(location.kind)
    )
      return false;
    ids.add(location.id);
    return true;
  });
}

/** Preserve a newer socket fix if a slower store response arrives afterwards. */
export function latestGpsPoint(
  stored: GpsPoint | null | undefined,
  received: GpsPoint | undefined,
): GpsPoint | null {
  const previous = hasValidCoordinates(stored) ? stored : null;
  if (!hasValidCoordinates(received)) return previous;
  if (!previous) return received;
  const previousTime = Date.parse(previous.recordedAt);
  const receivedTime = Date.parse(received.recordedAt);
  return Number.isFinite(previousTime) &&
    (!Number.isFinite(receivedTime) || previousTime > receivedTime)
    ? previous
    : received;
}

export function formatGpsTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Timestamp unavailable"
    : `Updated ${date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`;
}
