/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { Navigation, Radio, Route, Satellite } from "lucide-react";
import { useEffect, useState } from "react";
import { ticketService } from "@/services/ticket.service";
import { createRealtimeClient } from "@/services/realtime.service";
import type { GpsPoint, Ticket } from "@/types/trip-ticket";
import { ScreenState } from "./ui/ScreenState";

export function LiveGps() {
  const [trips, setTrips] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const store = await ticketService.store("live-gps");
      setTrips(store.outgoing.filter((ticket) => ticket.status === "ongoing" || ticket.gps));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "GPS data is currently unavailable.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const socket = createRealtimeClient();
    socket.on("connect", () => socket.emit("gps:subscribe"));
    socket.on("gps:position", ({ ticketId, gps }: { ticketId: string; gps: GpsPoint }) => {
      setTrips((current) =>
        current.map((trip) => (trip.id === ticketId ? { ...trip, gps } : trip)),
      );
    });
    socket.on("connect_error", () => setError("Live GPS connection could not be established."));
    return () => {
      socket.disconnect();
    };
  }, []);
  if (loading)
    return (
      <ScreenState
        kind="loading"
        title="Loading live vehicle positions"
        message="Connecting to the latest GPS check-ins…"
      />
    );
  if (error) return <ScreenState kind="error" title="Live GPS unavailable" message={error} />;
  return (
    <section className="gps-workspace">
      <div className="gps-map-panel">
        <div className="gps-grid" aria-hidden="true" />
        <div className="gps-map-copy">
          <span>
            <Satellite /> LIVE POSITION BOARD
          </span>
          <h2>Active trip telemetry</h2>
          <p>Positions stream live while this page remains open.</p>
        </div>
        {trips
          .filter((trip) => trip.gps)
          .map((trip, index) => (
            <div
              className={`gps-pin pin-${index % 3}`}
              key={trip.id}
              title={`${trip.plate}: ${trip.destination}`}
            >
              <Navigation />
            </div>
          ))}
        <div className="gps-map-footer">
          <span>
            <i /> GPS reporting
          </span>
        </div>
      </div>
      <div className="gps-trip-list">
        <header>
          <div>
            <p className="eyebrow">ACTIVE FLEET</p>
            <h2>{trips.length} monitored trips</h2>
          </div>
          <Radio />
        </header>
        {trips.length ? (
          trips.map((trip) => (
            <article key={trip.id}>
              <div className="gps-trip-icon">
                <Route />
              </div>
              <div>
                <b>
                  {trip.plate} <small>{trip.id}</small>
                </b>
                <p>{trip.destination}</p>
                {trip.gps ? (
                  <span>
                    {trip.gps.latitude.toFixed(5)}, {trip.gps.longitude.toFixed(5)} ·{" "}
                    {formatTime(trip.gps.recordedAt)}
                  </span>
                ) : (
                  <span className="no-gps">Awaiting first GPS position</span>
                )}
              </div>
            </article>
          ))
        ) : (
          <ScreenState
            kind="empty"
            title="No active trips"
            message="Positions will appear here once an approved trip departs."
          />
        )}
      </div>
    </section>
  );
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Timestamp unavailable"
    : `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
