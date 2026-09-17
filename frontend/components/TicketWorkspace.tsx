"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin, Search, Trash2 } from "lucide-react";
import { ticketService } from "@/services/ticket.service";
import type { Ticket, User } from "@/types/trip-ticket";
import { StatusPill } from "./ui/StatusPill";
import { ScreenState } from "./ui/ScreenState";
import { DownloadReportButton, PrintReceiptButton } from "./PrintReceiptButton";
import { OverdueBadge, TravelTime } from "./TravelTime";
import { tripOverrun } from "@/services/travel-time";
import { watchTripUpdates } from "@/services/realtime.service";
export function TicketWorkspace({
  kind = "pending",
  user,
}: {
  kind?: "pending" | "outgoing" | "history";
  user: User;
}) {
  const [records, setRecords] = useState<Ticket[]>([]),
    [query, setQuery] = useState(""),
    [overdueOnly, setOverdueOnly] = useState(false),
    [now, setNow] = useState(() => Date.now()),
    [selection, setSelected] = useState<Ticket | null>(null),
    [mobileDetailOpen, setMobileDetailOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (kind === "pending") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [kind]);
  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = () => {
      if (refreshing) return;
      refreshing = true;
      void ticketService
        .store(kind)
        .then((s) => {
          if (active) {
            setRecords(s[kind]);
            setSelected(
              (current) =>
                s[kind].find((ticket) => ticket.id === current?.id) || s[kind][0] || null,
            );
            setError("");
          }
        })
        .catch((e) => active && setError(e instanceof Error ? e.message : "Requests unavailable."))
        .finally(() => {
          refreshing = false;
          if (active) setLoading(false);
        });
    };
    refresh();
    const stopWatching = watchTripUpdates(refresh);
    return () => {
      active = false;
      stopWatching();
    };
  }, [kind]);
  const filtered = useMemo(
      () =>
        records.filter(
          (t) =>
            `${t.id} ${t.requestedBy} ${t.destination} ${t.plate}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (!overdueOnly || tripOverrun(t, now).isOverdue),
        ),
      [records, query, overdueOnly, now],
    ),
    selected = filtered.find((ticket) => ticket.id === selection?.id) || filtered[0] || null,
    update = (next: Ticket[]) => {
      setRecords(next);
      setSelected(next.find((t) => t.id === selected?.id) || next[0] || null);
    },
    act = async (action: string) => {
      if (!selected) return;
      try {
        update((await ticketService.action(selected.id, action, user))[kind]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    },
    remove = async () => {
      if (selected && confirm(`Delete ${selected.id}?`))
        try {
          update((await ticketService.remove(selected.id))[kind]);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Delete failed.");
        }
    };
  if (loading)
    return (
      <ScreenState
        kind="loading"
        title="Loading trip tickets"
        message="Retrieving the latest request store…"
      />
    );
  return (
    <section className={`workspace ${mobileDetailOpen ? "mobile-detail-open" : ""}`}>
      <div className="ticket-rail">
        <label className="search">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ticket, employee, place or plate"
            aria-label="Search tickets by ID, employee, destination or vehicle plate"
          />
        </label>
        {kind !== "pending" && (
          <div className="ticket-filters" aria-label="Filter trip duration">
            <button aria-pressed={!overdueOnly} onClick={() => setOverdueOnly(false)}>
              All trips <b>{records.length}</b>
            </button>
            <button aria-pressed={overdueOnly} onClick={() => setOverdueOnly(true)}>
              Over estimate <b>{records.filter((t) => tripOverrun(t, now).isOverdue).length}</b>
            </button>
          </div>
        )}
        <div className="list-meta">
          <b>
            {filtered.length} {filtered.length === 1 ? "ticket" : "tickets"}
          </b>
          <DownloadReportButton />
        </div>
        <div className="ticket-list">
          {filtered.map((t) => (
            <button
              key={t.id}
              className={selected?.id === t.id ? "selected" : ""}
              onClick={() => {
                setSelected(t);
                setMobileDetailOpen(true);
              }}
            >
              <span>
                <b>{t.id}</b>
                <StatusPill status={t.status} />
              </span>
              <strong>{t.requestedBy}</strong>
              <small>
                <MapPin />
                {t.destination}
              </small>
              <time>{date(t.createdAt)}</time>
              <OverdueBadge ticket={t} />
            </button>
          ))}
          {!filtered.length && (
            <ScreenState
              title="No matching tickets"
              message={
                overdueOnly
                  ? "No trips match this search and duration filter."
                  : "Try a different search, or check another ticket stage."
              }
            />
          )}
        </div>
      </div>
      {selected ? (
        <article className="ticket-detail">
          <button className="mobile-detail-back" onClick={() => setMobileDetailOpen(false)}>
            <ArrowLeft aria-hidden="true" /> All trips
          </button>
          <div className="detail-head">
            <div>
              <p className="eyebrow">TRIP TICKET</p>
              <h2>{selected.id}</h2>
              <p>Requested {date(selected.createdAt)}</p>
            </div>
            <StatusPill status={selected.status} />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="detail-grid">
            <Field label="Requested by" value={selected.requestedBy} />
            <Field label="Standby vehicle" value={selected.plate} />
            <Field label="Destination" value={selected.destination} />
            <Field label="Estimated duration" value={selected.duration || duration(selected)} />
            {selected.departure && <Field label="Departure" value={date(selected.departure)} />}
            {selected.arrival && <Field label="Arrival" value={date(selected.arrival)} />}
          </div>
          <TravelTime ticket={selected} />
          <section className="purpose">
            <span>Purpose of travel</span>
            <p>{selected.purpose}</p>
          </section>
          <section className="approval-route">
            <h3>Approval route</h3>
            <Approval
              name="Department head"
              by={selected.notedBySupervisor}
              at={selected.notedBySupervisorAt}
            />
            <Approval name="HR head" by={selected.notedByHr} at={selected.notedByHrAt} />
            <Approval name="Finance head" by={selected.approvedBy} at={selected.approvedAt} />
          </section>
          <footer className="detail-actions">
            <PrintReceiptButton ticketId={selected.id} />
            {selected.status === "pending" &&
              !selected.notedBySupervisor &&
              !selected.notedByHr &&
              user.role === "Administrator" && (
                <button className="btn danger" onClick={remove}>
                  <Trash2 /> Delete
                </button>
              )}
            {selected.approvalActions?.includes("deny") && (
              <button className="btn danger" onClick={() => act("deny")}>
                Deny
              </button>
            )}
            {selected.approvalActions?.includes("note") && (
              <button className="btn primary" onClick={() => act("note")}>
                {user.role === "HR Head" && selected.requesterDepartment === "HUMAN_RESOURCES"
                  ? "Approve as Department & HR Head"
                  : "Add Required Note"}
              </button>
            )}
            {selected.approvalActions?.includes("approve") && (
              <button className="btn primary" onClick={() => act("approve")}>
                {selected.requesterDepartment === "FINANCE"
                  ? "Approve as Department & Finance Head"
                  : "Approve"}
              </button>
            )}
          </footer>
        </article>
      ) : (
        <ScreenState
          kind={error ? "error" : "empty"}
          title={error ? "Tickets unavailable" : "No ticket selected"}
          message={error || "Select a ticket to view details."}
        />
      )}
    </section>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <MapPin />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
function Approval({ name, by, at }: { name: string; by?: string | null; at?: string | null }) {
  return (
    <div>
      <i className={by ? "done" : ""}>{by ? "✓" : "·"}</i>
      <span>
        <b>{name}</b>
        <small>{by ? `${by}${at ? ` · ${date(at)}` : ""}` : "Waiting"}</small>
      </span>
    </div>
  );
}
function date(v?: string | null) {
  if (!v) return "Date unavailable";
  const d = new Date(v);
  return Number.isNaN(d.valueOf()) ? v : d.toLocaleString();
}
function duration(t: Ticket) {
  const estimate = tripOverrun(t).estimatedSeconds;
  const days = Math.floor(estimate / 86400);
  const hours = Math.floor((estimate % 86400) / 3600);
  const minutes = Math.floor((estimate % 3600) / 60);
  return (
    [
      [days, "day"],
      [hours, "hour"],
      [minutes, "minute"],
    ]
      .filter(([v]) => Number(v) > 0)
      .map(([v, n]) => `${v} ${n}${Number(v) === 1 ? "" : "s"}`)
      .join(" ") || "Not provided"
  );
}
