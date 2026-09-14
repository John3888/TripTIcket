"use client";

import {
  Building2,
  ChevronRight,
  Crosshair,
  House,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  RefreshCw,
  Search,
  X,
  Car,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { companyLocations, type CompanyLocation } from "@/config/company-locations";
import { ticketService } from "@/services/ticket.service";
import { createRealtimeClient } from "@/services/realtime.service";
import type { GpsPoint, Ticket } from "@/types/trip-ticket";
import { CompanyGpsMap, type CompanyGpsMapHandle } from "./maps/CompanyGpsMap";
import { OverdueBadge } from "./TravelTime";
import {
  formatGpsTime,
  hasValidCoordinates,
  latestGpsPoint,
  validCompanyLocations,
} from "./maps/gps-utils";

const locations = validCompanyLocations(companyLocations);
const omittedLocationCount = companyLocations.length - locations.length;
const locationGroups = [
  {
    kind: "branch",
    title: "Branches",
    locations: locations.filter((location) => location.kind !== "sister-company"),
  },
  {
    kind: "sister-company",
    title: "Sister companies",
    locations: locations.filter((location) => location.kind === "sister-company"),
  },
];

const subscribeToCompactLayout = (callback: () => void) => {
  const query = window.matchMedia("(max-width: 860px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const compactLayoutSnapshot = () => window.matchMedia("(max-width: 860px)").matches;
const serverLayoutSnapshot = () => false;

function LocationLogo({ location }: { location: CompanyLocation }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className={`gps-location-logo ${location.kind}`} aria-hidden="true">
      <Building2 />
      {location.logoUrl && failedUrl !== location.logoUrl && (
        // Configured logos can be local files or remote URLs, with an immediate fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={location.logoUrl} alt="" onError={() => setFailedUrl(location.logoUrl)} />
      )}
    </span>
  );
}

export function LiveGps() {
  const [trips, setTrips] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting">(
    "connecting",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [panelOverride, setPanelOverride] = useState<boolean | null>(null);
  const [activePanel, setActivePanel] = useState<"locations" | "fleet">("locations");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const compactLayout = useSyncExternalStore(
    subscribeToCompactLayout,
    compactLayoutSnapshot,
    serverLayoutSnapshot,
  );
  const panelOpen = panelOverride ?? !compactLayout;
  const workspaceRef = useRef<HTMLElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const panelButtonRef = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<CompanyGpsMapHandle>(null);
  const refreshRef = useRef<() => void>(() => {});
  const selectMarker = useCallback((key: string | null) => setSelected(key), []);
  const focusDirectoryMarker = (key: string) => {
    mapRef.current?.focus(key);
    if (compactLayout) {
      setPanelOverride(false);
      panelButtonRef.current?.focus({ preventScroll: true });
    }
  };

  useEffect(() => {
    if (!expanded) return;
    const workspace = workspaceRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    const background: { element: HTMLElement; inert: boolean }[] = [];
    let ancestor: HTMLElement | null = workspace;
    while (ancestor?.parentElement) {
      for (const sibling of ancestor.parentElement.children) {
        if (sibling !== ancestor && sibling instanceof HTMLElement) {
          background.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      ancestor = ancestor.parentElement;
      if (ancestor === document.body) break;
    }
    document.body.style.overflow = "hidden";
    expandButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      }
      if (event.key === "Tab" && workspace) {
        const focusable = Array.from(
          workspace.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input, [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !workspace.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      background.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      window.scrollTo(scrollPosition.x, scrollPosition.y);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [expanded]);

  useEffect(() => {
    let disposed = false;
    let fetching = false;
    let refreshQueued = false;
    let knownTripIds = new Set<string>();
    const receivedGps = new Map<string, GpsPoint>();
    const refresh = async () => {
      if (disposed) return;
      if (fetching) {
        refreshQueued = true;
        return;
      }
      fetching = true;
      try {
        const store = await ticketService.store("live-gps");
        if (disposed) return;
        const monitored = store.outgoing.filter(
          (ticket) => ticket.status === "ongoing" || ticket.gps,
        );
        const previousTripIds = knownTripIds;
        knownTripIds = new Set(monitored.map((trip) => trip.id));
        setTrips(
          monitored.map((trip) => {
            const gps = latestGpsPoint(trip.gps, receivedGps.get(trip.id));
            if (gps) receivedGps.set(trip.id, gps);
            return { ...trip, gps };
          }),
        );
        receivedGps.forEach((_, id) => {
          if (previousTripIds.has(id) && !knownTripIds.has(id)) receivedGps.delete(id);
        });
        setError("");
      } catch (reason) {
        if (!disposed)
          setError(
            reason instanceof Error ? reason.message : "Fleet data is currently unavailable.",
          );
      } finally {
        fetching = false;
        if (!disposed) {
          setLoading(false);
          if (refreshQueued) {
            refreshQueued = false;
            void refresh();
          }
        }
      }
    };
    refreshRef.current = () => {
      void refresh();
    };
    void refresh();
    const socket = createRealtimeClient();
    socket.on("connect", () => {
      setConnection("connected");
      socket.emit("gps:subscribe");
      void refresh();
    });
    socket.on("store:updated", () => {
      void refresh();
    });
    socket.on("gps:position", (event: { ticketId: string; gps: GpsPoint } | null) => {
      if (!event || typeof event.ticketId !== "string" || !hasValidCoordinates(event.gps)) return;
      const { ticketId, gps } = event;
      const latest = latestGpsPoint(receivedGps.get(ticketId), gps)!;
      receivedGps.set(ticketId, latest);
      setTrips((current) =>
        current.map((trip) =>
          trip.id === ticketId ? { ...trip, gps: latestGpsPoint(trip.gps, latest) } : trip,
        ),
      );
      if (!knownTripIds.has(ticketId)) void refresh();
    });
    socket.on("connect_error", () => setConnection("reconnecting"));
    socket.on("disconnect", () => setConnection("reconnecting"));
    const interval = window.setInterval(refreshRef.current, 15000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      socket.removeAllListeners();
      socket.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      refreshRef.current = () => {};
    };
  }, []);

  const reportingCount = trips.filter((trip) => hasValidCoordinates(trip.gps)).length;
  const filteredGroups = locationGroups.map((group) => ({
    ...group,
    locations: group.locations.filter((location) =>
      `${location.name} ${location.kind === "main" ? "main branch" : group.title}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ),
  }));
  const matchedLocations = filteredGroups.reduce(
    (count, group) => count + group.locations.length,
    0,
  );
  const selectedLocation = locations.find((location) => `location:${location.id}` === selected);
  const selectedTrip = trips.find((trip) => `vehicle:${trip.id}` === selected);
  return (
    <section
      ref={workspaceRef}
      className={`gps-workspace${panelOpen ? "" : " is-panel-collapsed"}${expanded ? " is-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-labelledby="live-gps-heading"
    >
      <header className="gps-workspace-toolbar">
        <div className="gps-title-group">
          <span className="gps-title-icon">
            <MapPin aria-hidden="true" />
          </span>
          <h1 id="live-gps-heading">Live GPS</h1>
          <span
            className={`gps-toolbar-status ${connection}${error ? " has-error" : ""}`}
            role="status"
            title={
              error ||
              (connection === "connected"
                ? "Connected to vehicle position updates"
                : "Showing last known vehicle positions")
            }
          >
            <i />
            {error
              ? "Fleet unavailable"
              : connection === "connected"
                ? "Live"
                : connection === "connecting"
                  ? "Connecting"
                  : "Reconnecting"}
          </span>
        </div>
        <div className="gps-map-actions" aria-label="Map navigation">
          <button
            type="button"
            className="gps-show-all"
            title="Return to Main branch"
            onClick={() => mapRef.current?.home()}
          >
            <House aria-hidden="true" /> <span>Main branch</span>
          </button>
          <button
            type="button"
            className="gps-show-all"
            disabled={!selected}
            onClick={() => mapRef.current?.recenter()}
            title="Center selected marker"
          >
            <Crosshair aria-hidden="true" /> <span>Center selected</span>
          </button>
          <button type="button" className="gps-show-all" onClick={() => mapRef.current?.showAll()}>
            <LocateFixed aria-hidden="true" /> <span>Show all locations</span>
          </button>
        </div>
        <div className="gps-view-actions">
          <button
            type="button"
            className="gps-show-all gps-panel-toggle"
            ref={panelButtonRef}
            aria-controls="gps-directory"
            aria-expanded={panelOpen}
            aria-label={panelOpen ? "Hide locations panel" : "Show locations panel"}
            title={panelOpen ? "Hide locations panel" : "Show locations panel"}
            onClick={() => setPanelOverride(!panelOpen)}
          >
            {panelOpen ? (
              <PanelRightClose aria-hidden="true" />
            ) : (
              <PanelRightOpen aria-hidden="true" />
            )}
            <span>Locations</span>
          </button>
          <button
            ref={expandButtonRef}
            type="button"
            className="gps-show-all gps-expand-toggle"
            aria-pressed={expanded}
            aria-label={expanded ? "Exit expanded view" : "Expand map view"}
            title={expanded ? "Exit expanded view (Escape)" : "Expand map view"}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            <span>{expanded ? "Exit" : "Expand"}</span>
          </button>
        </div>
      </header>
      <div className="gps-map-panel">
        <CompanyGpsMap ref={mapRef} locations={locations} trips={trips} onSelect={selectMarker} />
        <footer className="gps-map-footer">
          <div className="gps-map-legend" aria-label="Map legend">
            <span>
              <i className="branch" /> Branch
            </span>
            <span>
              <i className="sister-company" /> Sister company
            </span>
            <span>
              <i className="vehicle" /> Vehicle
            </span>
          </div>
          <span
            className="gps-current-focus"
            title={selectedLocation?.name ?? selectedTrip?.plate ?? "All locations"}
          >
            <Crosshair aria-hidden="true" />
            {selectedLocation?.name ?? selectedTrip?.plate ?? "All locations"}
          </span>
          <small className="gps-navigation-hint">Drag to pan · Scroll to zoom</small>
        </footer>
      </div>

      <aside
        id="gps-directory"
        className="gps-sidebar"
        aria-label="Locations and fleet"
        hidden={!panelOpen}
      >
        <div className="gps-directory-tabs" aria-label="Choose directory">
          <button
            type="button"
            id="company-locations-heading"
            aria-pressed={activePanel === "locations"}
            aria-controls="gps-locations-panel"
            onClick={() => setActivePanel("locations")}
          >
            <MapPin aria-hidden="true" />
            Locations <span>{locations.length}</span>
          </button>
          <button
            type="button"
            id="fleet-tab"
            aria-pressed={activePanel === "fleet"}
            aria-controls="gps-fleet-panel"
            onClick={() => setActivePanel("fleet")}
          >
            <Car ria-hidden="true" />
            Fleet <span>{trips.length}</span>
            {error && <i className="gps-fleet-alert" aria-label="Fleet data unavailable" />}
          </button>
        </div>
        <div className="gps-directory-scroll">
          <section
            id="gps-locations-panel"
            className="gps-location-list"
            aria-labelledby="company-locations-heading"
            hidden={activePanel !== "locations"}
          >
            <div className="gps-search-wrap">
              <label className="gps-search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search company locations"
                  placeholder="Find a company location"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear location search"
                  >
                    <X aria-hidden="true" />
                  </button>
                )}
              </label>
            </div>
            {omittedLocationCount > 0 && (
              <p className="gps-inline-notice" role="status">
                {omittedLocationCount} configured{" "}
                {omittedLocationCount === 1 ? "location needs" : "locations need"} a valid name,
                unique ID, type, and coordinates before appearing here.
              </p>
            )}
            {filteredGroups
              .filter((group) => !search.trim() || group.locations.length > 0)
              .map((group) => (
                <section
                  className={`gps-location-group ${group.kind}`}
                  key={group.kind}
                  aria-labelledby={`gps-group-${group.kind}`}
                >
                  <h3 id={`gps-group-${group.kind}`}>
                    {group.title} <span>{group.locations.length}</span>
                  </h3>
                  <ul className="gps-location-rows">
                    {group.locations.map((location) => {
                      const key = `location:${location.id}`;
                      return (
                        <li key={location.id}>
                          <button
                            type="button"
                            className={`gps-location-row${selected === key ? " is-selected" : ""}`}
                            aria-pressed={selected === key}
                            onClick={() => focusDirectoryMarker(key)}
                          >
                            <LocationLogo location={location} />
                            <span className="gps-row-copy">
                              <b>{location.name}</b>
                              {location.kind === "main" && (
                                <small className="gps-main-label">Main branch</small>
                              )}
                              <span className="gps-coordinate-text">
                                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                              </span>
                            </span>
                            <ChevronRight className="gps-row-arrow" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {!group.locations.length && (
                    <p className="gps-empty-copy">No {group.title.toLowerCase()} configured yet.</p>
                  )}
                </section>
              ))}
            {search.trim() && matchedLocations === 0 && (
              <div className="gps-search-empty" role="status">
                <Search aria-hidden="true" />
                <b>No locations found</b>
                <p>Try another company or branch name.</p>
                <button type="button" onClick={() => setSearch("")}>
                  Clear search
                </button>
              </div>
            )}
            {!locations.length && (
              <p className="gps-empty-copy">
                No company locations configured yet. Add your sites to the company locations
                configuration to display them here.
              </p>
            )}
          </section>

          <section
            id="gps-fleet-panel"
            className="gps-fleet-list"
            aria-labelledby="fleet-tab"
            aria-busy={loading}
            hidden={activePanel !== "fleet"}
          >
            <header className="gps-section-header">
              <div>
                <h2 id="fleet-heading">
                  {loading
                    ? "Connecting to fleet"
                    : `${trips.length} monitored ${trips.length === 1 ? "trip" : "trips"}`}
                </h2>
              </div>
              <Radio aria-hidden="true" />
            </header>
            <p className={`gps-connection-status ${connection}`} role="status">
              <i />
              {connection === "connected"
                ? `${reportingCount} with GPS positions · Live connection`
                : connection === "connecting"
                  ? "Connecting to GPS updates…"
                  : "Reconnecting · Showing last known positions"}
            </p>
            {error && (
              <div className="gps-fleet-error" role="alert">
                <p>
                  <b>Fleet data unavailable</b>
                  <span>{error}</span>
                </p>
                <button
                  type="button"
                  onClick={() => refreshRef.current()}
                  aria-label="Retry loading fleet data"
                >
                  <RefreshCw /> Retry
                </button>
              </div>
            )}
            {loading ? (
              <p className="gps-empty-copy" role="status">
                Loading the latest vehicle check-ins…
              </p>
            ) : trips.length ? (
              <ul className="gps-location-rows">
                {trips.map((trip) => {
                  const key = `vehicle:${trip.id}`;
                  const gps = hasValidCoordinates(trip.gps) ? trip.gps : null;
                  return (
                    <li key={trip.id}>
                      <button
                        type="button"
                        className={`gps-location-row gps-fleet-row${selected === key ? " is-selected" : ""}`}
                        disabled={!gps}
                        aria-pressed={selected === key}
                        onClick={() => focusDirectoryMarker(key)}
                      >
                        <span className="gps-trip-icon">
                          <Car />
                        </span>
                        <span className="gps-row-copy">
                          <b>{trip.plate}</b>
                          <OverdueBadge ticket={trip} />
                          <span>{trip.destination}</span>
                          {gps ? (
                            <>
                              <span className="gps-coordinate-text">
                                {gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}
                              </span>
                              <small>{formatGpsTime(gps.recordedAt)}</small>
                            </>
                          ) : (
                            <small className="no-gps">Awaiting first valid GPS position</small>
                          )}
                        </span>
                        {gps && <ChevronRight className="gp s-row-arrow" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              !error && (
                <div className="gps-empty-fleet">
                  <Car />
                  <b>No active trips</b>
                  <p>Vehicle markers appear when an active trip sends its first GPS position.</p>
                </div>
              )
            )}
          </section>
        </div>
        <footer className="gps-directory-footer">
          <Radio aria-hidden="true" />
          <span>
            {reportingCount} vehicle{reportingCount === 1 ? "" : "s"} reporting GPS
          </span>
          <span>{locations.length} fixed sites</span>
        </footer>
      </aside>
    </section>
  );
}
