"use client";

import "leaflet/dist/leaflet.css";
import "./gps.css";
import type * as Leaflet from "leaflet";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CompanyLocation } from "@/config/company-locations";
import type { Ticket } from "@/types/trip-ticket";
import { formatGpsTime, hasValidCoordinates } from "./gps-utils";
import { Car } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { animateMarker, motionPath } from "./marker-motion";

const DEFAULT_CENTER: Leaflet.LatLngTuple = [10.662087, 122.951214];
const OVERVIEW_ZOOM = 17;
const MAX_MAP_ZOOM = 19;

export interface CompanyGpsMapHandle {
  focus: (key: string) => void;
  home: () => void;
  recenter: () => void;
  showAll: () => void;
}

interface Props {
  now: number;
  locations: readonly CompanyLocation[];
  trips: Ticket[];
  onSelect: (key: string | null) => void;
}

function textElement(tag: string, text: string, className?: string) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function fitMarkerPopup(map: Leaflet.Map, marker: Leaflet.Marker) {
  const popup = marker.getPopup();
  if (!popup) return;
  // Keep details above the centered marker, scrolling on smaller screens
  // instead of allowing the popup to pan the location away from the center.
  popup.options.maxHeight = Math.max(60, Math.floor(map.getSize().y / 2) - 90);
  popup.update();
}

function locationLogo(location: CompanyLocation) {
  const holder = document.createElement("span");
  holder.className = `gps-location-logo ${location.kind}`;
  const fallback = textElement("span", location.kind === "sister-company" ? "S" : "B");
  holder.append(fallback);
  if (location.logoUrl) {
    const logo = document.createElement("img");
    logo.alt = "";
    logo.src = location.logoUrl;
    logo.addEventListener("error", () => logo.remove(), { once: true });
    holder.append(logo);
  }
  return holder;
}

function locationPopup(location: CompanyLocation) {
  const content = document.createElement("div");
  content.className = "gps-popup";
  content.append(locationLogo(location));
  content.append(
    textElement(
      "p",
      location.kind === "sister-company"
        ? "SISTER COMPANY"
        : location.kind === "main"
          ? "MAIN OFFICE"
          : "COMPANY BRANCH",
      "gps-popup-kind",
    ),
  );
  content.append(textElement("h3", location.name));
  content.append(
    textElement(
      "p",
      `${location.address ?? "No exact location available"}`, 
      "gps-popup-coordinates",
    ),
  );
  content.append(

// (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})

//here

    // textElement(
    //   "p",
    //   location.isPlaceholder ? "Placeholder · Illustrative coordinates" : "Fixed company location",
    //   "gps-popup-note",
    // ),
  );
  return content;
}
   
function vehiclePopup(trip: Ticket) {
  const content = document.createElement("div");
  content.className = "gps-popup"; 
  content.append(textElement("p", "VEHICLE · LAST REPORTED POSITION", "gps-popup-kind"));
  content.append(textElement("h3", trip.plate));
  content.append(textElement("p", trip.destination));
  if (trip.track) content.append(textElement("p", `${(trip.track.distanceMeters / 1000).toFixed(2)} km tracked${trip.track.incomplete ? " · Partial distance" : ""}`, "gps-popup-note"));
  if (hasValidCoordinates(trip.gps)) {
    content.append(
      textElement(
        "p",
        `${trip.gps.latitude.toFixed(5)}, ${trip.gps.longitude.toFixed(5)}`,
        "gps-popup-coordinates",
      ),
    );
    content.append(textElement("p", formatGpsTime(trip.gps.recordedAt), "gps-popup-note")); 
  }
  return content;
}

export const CompanyGpsMap = forwardRef<CompanyGpsMapHandle, Props>(function CompanyGpsMap(
  { locations, trips, onSelect, now },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const staticMarkers = useRef(new Map<string, Leaflet.Marker>());
  const vehicleMarkers = useRef(new Map<string, Leaflet.Marker>());
  const motion = useRef(new Map<string, { target: string; cancel: () => void; time: number }>());
  const trails = useRef<Leaflet.LayerGroup | null>(null);
  const tripBounds = useRef(new Map<string, Leaflet.LatLngBounds>());
  const selectedMarker = useRef<string | null>(null);
  const mainLocation =
    locations.find((location) => location.kind === "main") ??
    locations.find((location) => location.kind === "branch") ??
    locations[0];
  const [readyMap, setReadyMap] = useState<Leaflet.Map | null>(null);
  const [mapError, setMapError] = useState("");
  const [tileError, setTileError] = useState(false);

  const focusMarker = useCallback(
    (key: string, zoom?: number) => {
      const map = mapRef.current;
      const location = staticMarkers.current.get(key);
      const marker = location ?? vehicleMarkers.current.get(key);
      if (!map) return;
      const routeBounds = tripBounds.current.get(key);
      if (routeBounds?.isValid()) {
        map.fitBounds(routeBounds, { padding: [40, 40], maxZoom: 17, animate: false });
        selectedMarker.current = key;
        onSelect(key);
        return;
      }
      if (!marker) return;
      map.stop();
      map.setView(
        marker.getLatLng(),
        zoom ?? (location ? map.getMaxZoom() : Math.max(map.getZoom(), 15)),
        { animate: false },
      );
      marker.openPopup();
      fitMarkerPopup(map, marker);
      selectedMarker.current = key;
      onSelect(key);
      const bounds = containerRef.current?.getBoundingClientRect();
      if (bounds && (bounds.bottom <= 0 || bounds.top >= window.innerHeight))
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [onSelect],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: focusMarker,
      home() {
        const map = mapRef.current;
        if (!map) return;
        map.stop();
        map.closePopup();
        map.setView(
          mainLocation ? [mainLocation.latitude, mainLocation.longitude] : DEFAULT_CENTER,
          OVERVIEW_ZOOM,
          { animate: false },
        );
        const key = mainLocation ? `location:${mainLocation.id}` : null;
        selectedMarker.current = key;
        onSelect(key);
      },
      recenter() {
        if (selectedMarker.current) focusMarker(selectedMarker.current, mapRef.current?.getZoom());
      },
      showAll() {
        const map = mapRef.current;
        const L = leafletRef.current;
        if (!map || !L) return;
        const markers = [...staticMarkers.current.values(), ...vehicleMarkers.current.values()];
        map.stop();
        map.closePopup();
        if (markers.length) {
          map.fitBounds(L.latLngBounds(markers.map((marker) => marker.getLatLng())), {
            padding: [48, 48],
            maxZoom: OVERVIEW_ZOOM,
            animate: false,
          });
        } else {
          map.setView(DEFAULT_CENTER, OVERVIEW_ZOOM);
        }
        selectedMarker.current = null;
        onSelect(null);
      },
    }),
    [focusMarker, onSelect, mainLocation],
  );

  useEffect(() => {
    let disposed = false;
    let map: Leaflet.Map | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFrame = 0;
    const fixed = staticMarkers.current;
    const vehicles = vehicleMarkers.current;
    const animations = motion.current;

    // Leaflet requires window/document. Import only after the client mounts.
    void import("leaflet")
      .then((L) => {
        if (disposed || !containerRef.current) return;
        leafletRef.current = L;
        map = L.map(containerRef.current, {
          center: mainLocation ? [mainLocation.latitude, mainLocation.longitude] : DEFAULT_CENTER,
          zoom: OVERVIEW_ZOOM,
          maxZoom: MAX_MAP_ZOOM,
          scrollWheelZoom: true,
          touchZoom: true,
          dragging: true,
          keyboard: true,
        });
        mapRef.current = map;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: MAX_MAP_ZOOM,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .on("tileerror", () => {
            if (!disposed) setTileError(true);
          })
          .on("tileload", () => {
            if (!disposed) setTileError(false);
          })
          .addTo(map);

        locations.forEach((location) => {
          const key = `location:${location.id}`;
          const icon = L.divIcon({
            className: `gps-company-marker ${location.kind}`,
            html: locationLogo(location),
            iconSize: [42, 48],
            iconAnchor: [21, 48],
            popupAnchor: [0, -44],
          });
          const marker = L.marker([location.latitude, location.longitude], {
            icon,
            title: location.name,
            alt: location.name,
            keyboard: true,
          }).bindPopup(locationPopup(location), { maxWidth: 260, autoPan: false });
          marker.on("click", () => focusMarker(key));
          marker.addTo(map!);
          marker.getElement()?.setAttribute("aria-label", location.name);
          fixed.set(key, marker);
        });
        const initialKey = mainLocation ? `location:${mainLocation.id}` : null;
        selectedMarker.current = initialKey;
        onSelect(initialKey);
        resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => {
            if (!disposed && map) {
              map.invalidateSize({ pan: true, animate: false });
              const key = selectedMarker.current;
              const marker = key ? (fixed.get(key) ?? vehicles.get(key)) : undefined;
              if (marker?.isPopupOpen()) fitMarkerPopup(map, marker);
            }
          });
        });
        resizeObserver.observe(containerRef.current);
        // A new instance must repopulate vehicle markers even when trip data
        // has not changed, for example after editing the location configuration.
        setReadyMap(map);
      })
      .catch(() => {
        if (!disposed)
          setMapError(
            "The map could not load. Refresh the page to try again. Your company locations are still listed below.",
          );
      });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      cancelAnimationFrame(resizeFrame);
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      fixed.clear();
      vehicles.clear();
      animations.forEach((item) => item.cancel());
      animations.clear();
    };
  }, [locations, focusMarker, mainLocation, onSelect]);

  useEffect(() => {
    const map = readyMap;
    const L = leafletRef.current;
    if (!map || map !== mapRef.current || !L) return;
    trails.current?.remove();
    trails.current = L.layerGroup().addTo(map);
    tripBounds.current.clear();
    const visibleIds = new Set<string>();
    trips.forEach((trip) => {
      const bounds = L.latLngBounds([]);
      trip.track?.segments.forEach((segment) => {
        segment.coordinates.forEach(([lng, lat]) => bounds.extend([lat, lng]));
        L.polyline(segment.coordinates.map(([lng, lat]) => [lat, lng] as Leaflet.LatLngTuple), {
          color: segment.estimated ? "#b7791f" : "#168253", weight: 5, opacity: 0.9,
          dashArray: segment.estimated ? "8 6" : undefined,
        }).bindTooltip(textElement("span", `${trip.plate} · Trip ${trip.id} · ${segment.estimated ? "Estimated" : "Road matched"} ${(segment.distanceMeters / 1000).toFixed(2)} km`)).addTo(trails.current!);
      });
      if (bounds.isValid()) tripBounds.current.set(`vehicle:${trip.id}`, bounds);
      if (!hasValidCoordinates(trip.gps)) return;
      const device = trip.track?.device;
      if (trip.status !== "ongoing" || !device?.enabled || !device.lastSeenAt || now - Date.parse(device.lastSeenAt) > 30000) return;
      const key = `vehicle:${trip.id}`;
      visibleIds.add(key);
      const existing = vehicleMarkers.current.get(key);
      if (existing) {
        // Updating an existing marker leaves the operator's zoom and pan intact.
        const end: Leaflet.LatLngTuple = [trip.gps.latitude, trip.gps.longitude];
        const target = end.join(",");
        const previous = motion.current.get(key);
        if (previous?.target !== target) {
          previous?.cancel();
          const start = existing.getLatLng();
          const elapsed = Date.parse(trip.gps.recordedAt) - (previous?.time ?? 0);
          const matched = trip.track?.matching === "matched" && trip.track.position?.id === trip.gps.id;
          const path = matched ? motionPath([start.lat, start.lng], end, trip.track!.segments.map((segment) => segment.coordinates)) : [[start.lat, start.lng], end] as Leaflet.LatLngTuple[];
          const canAnimate = path && elapsed >= 0 && elapsed <= 60000 && start.distanceTo(end) < 500 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const cancel = canAnimate ? animateMarker(existing, path, Math.max(500, Math.min(4500, elapsed || 1000))) : () => {};
          if (!canAnimate) existing.setLatLng(end);
          motion.current.set(key, { target, cancel, time: Date.parse(trip.gps.recordedAt) });
        }
        existing.setPopupContent(vehiclePopup(trip));
      } else {
        const symbol = textElement("span", "", "gps-vehicle-symbol");

        symbol.innerHTML = renderToStaticMarkup(
          <Car
            size={18}
            fill="currentColor"
            strokeWidth={2.5}
          />
        );
        symbol.setAttribute("aria-hidden", "true");
        const marker = L.marker([trip.gps.latitude, trip.gps.longitude], {
          icon: L.divIcon({
            className: "gps-vehicle-marker",
            html: symbol,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -18],
          }),
          title: `${trip.plate}: ${trip.destination}`,
          alt: trip.plate,
          keyboard: true,
          zIndexOffset: 100,
        }).bindPopup(vehiclePopup(trip), { maxWidth: 260, autoPan: false });
        marker.on("click", () => focusMarker(key));
        marker.addTo(map);
        marker.getElement()?.setAttribute("aria-label", `${trip.plate}: ${trip.destination}`);
        vehicleMarkers.current.set(key, marker);
        motion.current.set(key, { target: [trip.gps.latitude, trip.gps.longitude].join(","), cancel: () => {}, time: Date.parse(trip.gps.recordedAt) });
      }
    });
    vehicleMarkers.current.forEach((marker, key) => {
      if (!visibleIds.has(key)) {
        marker.remove();
        vehicleMarkers.current.delete(key);
        motion.current.get(key)?.cancel();
        motion.current.delete(key);
        if (selectedMarker.current === key && !tripBounds.current.has(key)) {
          selectedMarker.current = null;
          onSelect(null);
        }
      }
    });
  }, [trips, readyMap, onSelect, focusMarker, now]);

  return (
    <div className="gps-map-surface">
      <div
        className="gps-leaflet-map"
        ref={containerRef}
        aria-label="Map of company locations and last reported vehicle positions"
      />
      {!readyMap && !mapError && (
        <p className="gps-map-message" role="status">
          Loading map…
        </p>
      )}
      {mapError && (
        <p className="gps-map-message gps-map-error" role="alert">
          {mapError}
        </p>
      )}
      {tileError && (
        <p className="gps-tile-notice" role="status">
          Street map unavailable. Location markers remain available; check your internet connection.
        </p>
      )}
    </div>
  );
});
