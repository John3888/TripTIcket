import type * as Leaflet from "leaflet";
import type { TripTrack } from "../../types/trip-ticket";

export type TrailDrawing = { coordinates: number[][]; casing: Leaflet.Polyline; line: Leaflet.Polyline };

function breadcrumb(L: typeof Leaflet, layer: Leaflet.LayerGroup, renderer: Leaflet.Renderer, coordinate: Leaflet.LatLngTuple) {
  L.circleMarker(coordinate, { pane: "gps-trails", renderer, radius: 2.5, weight: 1,
    color: "#ffffff", fillColor: "#1768cc", fillOpacity: 1, interactive: false }).addTo(layer);
}

export function drawTrail(L: typeof Leaflet, layer: Leaflet.LayerGroup, renderer: Leaflet.Renderer,
  segments: TripTrack["segments"], label: (text: string) => HTMLElement) {
  const drawings: TrailDrawing[] = [];
  for (const segment of segments) {
    const coordinates = segment.coordinates.map(([lng, lat]) => [lat, lng] as Leaflet.LatLngTuple);
    if (!coordinates.length) continue;
    const options = { pane: "gps-trails", renderer, smoothFactor: 0, lineCap: "round" as const, lineJoin: "round" as const };
    const casing = L.polyline(coordinates, { ...options, color: "#ffffff", weight: 9, opacity: 0.95, interactive: false }).addTo(layer);
    const line = L.polyline(coordinates, { ...options, color: "#1768cc", weight: 4, opacity: 1 })
      .bindTooltip(label(`GPS trail · ${(segment.distanceMeters / 1000).toFixed(2)} km`)).addTo(layer);
    // Every recorded vertex remains visible; Leaflet path simplification is off.
    for (const coordinate of coordinates) {
      breadcrumb(L, layer, renderer, coordinate);
    }
    L.circleMarker(coordinates[0], { pane: "gps-trails", renderer, radius: 6, weight: 2,
      color: "#ffffff", fillColor: "#1768cc", fillOpacity: 1 }).bindTooltip(label("Segment start")).addTo(layer);
    drawings.push({ coordinates: segment.coordinates, casing, line });
  }
  return drawings;
}

// Live arrays retain old vertex references. Extend those paths in place rather
// than removing the entire trail and recreating thousands of circles per fix.
export function extendTrail(L: typeof Leaflet, layer: Leaflet.LayerGroup, renderer: Leaflet.Renderer,
  drawings: TrailDrawing[], segments: TripTrack["segments"], label: (text: string) => HTMLElement): TrailDrawing[] | null {
  if (segments.length < drawings.length || drawings.some((item, i) => {
    const next = segments[i].coordinates;
    return next.length < item.coordinates.length || next[0] !== item.coordinates[0] ||
      next[item.coordinates.length - 1] !== item.coordinates.at(-1);
  })) return null;
  drawings.forEach((item, i) => {
    const segment = segments[i];
    for (const [lng, lat] of segment.coordinates.slice(item.coordinates.length)) {
      const coordinate: Leaflet.LatLngTuple = [lat, lng];
      item.casing.addLatLng(coordinate); item.line.addLatLng(coordinate);
      breadcrumb(L, layer, renderer, coordinate);
    }
    item.coordinates = segment.coordinates;
    item.line.bindTooltip(label(`GPS trail · ${(segment.distanceMeters / 1000).toFixed(2)} km`));
  });
  return [...drawings, ...drawTrail(L, layer, renderer, segments.slice(drawings.length), label)];
}
