"use client";

import { useEffect, useState } from "react";
import type { Ticket } from "@/types/trip-ticket";
import { formatTravelTime, travelSeconds } from "@/services/travel-time";

export function TravelTime({ ticket }: { ticket: Ticket }) {
  const [now, setNow] = useState<number>();
  const running = ticket.status === "ongoing" && Boolean(ticket.departure);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!["approved", "ongoing", "completed"].includes(ticket.status)) return null;
  return (
    <span className="travel-time">
      <small>Actual travel time</small>
      <strong role="timer" aria-live="off">
        {formatTravelTime(travelSeconds(ticket, now))}
      </strong>
      <small>
        {running
          ? "In progress"
          : ticket.status === "completed"
            ? "Final duration"
            : ticket.status === "approved"
              ? "Starts on departure"
              : "Departure time unavailable"}
      </small>
    </span>
  );
}
