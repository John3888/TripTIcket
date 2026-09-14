"use client";

import { useEffect, useState } from "react";
import { Flag, Clock3 } from "lucide-react";
import type { Ticket } from "@/types/trip-ticket";
import { formatTravelTime, tripOverrun } from "@/services/travel-time";

function useTripTiming(ticket: Ticket) {
  const [now, setNow] = useState<number>();
  const running = ticket.status === "ongoing" && Boolean(ticket.departure) && !ticket.arrival;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return { ...tripOverrun(ticket, now), running };
}

export function OverdueBadge({ ticket }: { ticket: Ticket }) {
  const timing = useTripTiming(ticket);
  if (!timing.flagged) return null;
  return (
    <span className="duration-flag" title={timing.isOverdue ? `${formatTravelTime(timing.overdueSeconds)} beyond the approved estimate` : "This trip was flagged for review"}>
      <Flag size={13} aria-hidden="true" />
      {timing.isOverdue ? ticket.status === "completed" ? "Returned late" : "Overdue" : "Flagged"}
    </span>
  );
}

export function TravelTime({ ticket }: { ticket: Ticket }) {
  const timing = useTripTiming(ticket);
  if (!["approved", "ongoing", "completed"].includes(ticket.status)) return null;
  const expectedReturn = ticket.expectedReturnAt || (ticket.departure && timing.estimatedSeconds > 0
    ? new Date(new Date(ticket.departure).getTime() + timing.estimatedSeconds * 1000).toISOString()
    : null);
  const progress = timing.estimatedSeconds > 0 ? Math.min(100, timing.elapsedSeconds / timing.estimatedSeconds * 100) : 0;
  return (
    <div className={`travel-time${timing.flagged ? " travel-time-overdue" : ""}`}>
      <div className="travel-time-header">
        <span><Clock3 size={15} aria-hidden="true" /> Trip duration</span>
        {timing.flagged && <span className="duration-flag"><Flag size={13} aria-hidden="true" />{timing.isOverdue ? ticket.status === "completed" ? "Returned late" : "Overdue" : "Flagged"}</span>}
      </div>
      <div className="travel-time-values">
        <span><small>Actual travel time</small><strong role="timer" aria-live="off">{formatTravelTime(timing.elapsedSeconds)}</strong></span>
        <span><small>Approved estimate</small><strong>{timing.estimatedSeconds > 0 ? formatTravelTime(timing.estimatedSeconds) : "Not provided"}</strong></span>
      </div>
      {timing.estimatedSeconds > 0 && <div className="travel-time-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>}
      <div className="travel-time-footnote">
        <span>{timing.isOverdue
          ? `${formatTravelTime(timing.overdueSeconds)} beyond approved duration`
          : ticket.status === "approved"
            ? "Timer starts when departure is recorded."
            : ticket.status === "completed"
              ? timing.estimatedSeconds > 0 ? "Returned within the approved duration." : "Final travel duration."
              : timing.running ? "In progress · updates automatically" : "Departure time unavailable"}</span>
        {expectedReturn && <small>Expected return: {new Date(expectedReturn).toLocaleString()}</small>}
      </div>
    </div>
  );
}
