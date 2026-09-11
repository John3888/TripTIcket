"use client";

import Link from "next/link";
import { ArrowLeft, Clock3, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { ticketService } from "@/services/ticket.service";
import type { Ticket } from "@/types/trip-ticket";
import { StatusPill } from "./ui/StatusPill";
import { ScreenState } from "./ui/ScreenState";
import { TravelTime } from "./TravelTime";
import { watchTripUpdates } from "@/services/realtime.service";

export function RequesterTicketList({ kind }: { kind: "pending" | "outgoing" | "history" }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = () => {
      if (refreshing) return;
      refreshing = true;
      void ticketService
        .kioskStore()
        .then((store) => {
          if (active) {
            setTickets(store[kind]);
            setError("");
          }
        })
        .catch(
          (reason) =>
            active &&
            setError(reason instanceof Error ? reason.message : "Ticket records are unavailable."),
        )
        .finally(() => {
          refreshing = false;
          if (active) setLoading(false);
        });
    };
    refresh();
    const stopWatching = watchTripUpdates(refresh, false);
    return () => {
      active = false;
      stopWatching();
    };
  }, [kind]);
  const label = { pending: "Pending tickets", outgoing: "Outgoing trips", history: "Trip history" }[
    kind
  ];
  return (
    <div className="kiosk">
      <header className="kiosk-header">
        <Link href="/request" className="kiosk-brand">
          <b>EMB</b>
          <span>
            <b>TRIP TICKET SYSTEM</b>
            <small>EMPLOYEE SELF-SERVICE</small>
          </span>
        </Link>
      </header>
      <main className="requester-records">
        <Link className="back" href="/request">
          <ArrowLeft /> Return to kiosk
        </Link>
        <p className="eyebrow">SELF-SERVICE RECORDS</p>
        <h1>{label}</h1>
        <p className="records-copy">
          These tickets are visible to help staff and employees follow the current trip workflow.
        </p>
        {loading ? (
          <ScreenState
            kind="loading"
            title="Loading tickets"
            message="Retrieving the latest travel records…"
          />
        ) : error ? (
          <ScreenState kind="error" title="Records unavailable" message={error} />
        ) : (
          <section className="requester-ticket-grid">
            {tickets.length ? (
              tickets.map((ticket) => (
                <article key={ticket.id}>
                  <header>
                    <span>
                      <b>{ticket.id}</b>
                      <small>{ticket.requestedBy}</small>
                    </span>
                    <StatusPill status={ticket.status} />
                  </header>
                  <p>
                    <MapPin />
                    {ticket.destination}
                  </p>
                  <footer>
                    <span>
                      <Clock3 />
                      {ticket.createdAt
                        ? new Date(ticket.createdAt).toLocaleDateString()
                        : "Date unavailable"}
                    </span>
                    <b>{ticket.plate}</b>
                  </footer>
                  <TravelTime ticket={ticket} />
                </article>
              ))
            ) : (
              <ScreenState
                kind="empty"
                title={`No ${label.toLowerCase()}`}
                message="New trip activity will appear here."
              />
            )}
          </section>
        )}
      </main>
      <footer className="kiosk-footer">
        Official use only <span /> Environmental Management Bureau Operations
      </footer>
    </div>
  );
}
