import assert from "node:assert/strict";
import { test } from "node:test";
import { latestGpsPoint, validCompanyLocations } from "../components/maps/gps-utils";
import type { CompanyLocation } from "../config/company-locations";

test("A malformed or duplicate site does not remove the remaining map locations", () => {
  const original: CompanyLocation = {
    id: "branch",
    kind: "branch",
    name: "Test branch",
    latitude: 14.5,
    longitude: 121,
    logoUrl: "",
    isPlaceholder: true,
  };
  const companyLocations = [original, { ...original, id: "second-branch" }];
  const locations = validCompanyLocations([
    { ...original, id: "out-of-range", latitude: 91 },
    { ...original, id: "non-finite", longitude: Number.NaN },
    ...companyLocations,
    { ...original, name: "Duplicate ID" },
  ]);
  assert.deepEqual(locations, companyLocations);
});

test("A delayed store refresh cannot move a vehicle back to an older GPS fix", () => {
  const previous = { id: "1", latitude: 14.5, longitude: 121, recordedAt: "2026-09-08T01:00:00Z" };
  const live = { ...previous, id: "2", latitude: 14.6, recordedAt: "2026-09-08T01:00:10Z" };
  assert.equal(latestGpsPoint(previous, live), live);
  assert.equal(latestGpsPoint(live, previous), live);
});

test("Invalid telemetry preserves the last usable vehicle position", () => {
  const previous = { id: "1", latitude: 0, longitude: 0, recordedAt: "2026-09-08T01:00:00Z" };
  const invalid = { ...previous, longitude: Number.POSITIVE_INFINITY };
  assert.equal(latestGpsPoint(previous, invalid), previous);
  assert.equal(latestGpsPoint(null, invalid), null);
});
