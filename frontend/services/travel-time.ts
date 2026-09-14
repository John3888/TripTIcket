import type { Ticket } from "@/types/trip-ticket";

export function receiveTicketTiming(tickets: Ticket[], receivedAt = Date.now()): Ticket[] {
  return tickets.map((ticket) => ({ ...ticket, timingReceivedAt: receivedAt }));
}

export function travelSeconds(ticket: Ticket, now?: number) {
  if (!["ongoing", "completed"].includes(ticket.status)) return 0;
  const saved = Math.max(0, ticket.elapsedSeconds || 0);
  if (ticket.status !== "ongoing" || ticket.arrival || !ticket.departure || ticket.timingReceivedAt === undefined) return saved;
  // Advance from the server's elapsed duration, so a kiosk clock in another
  // timezone or with a different clock setting does not change the trip time.
  return (
    saved +
    Math.max(0, Math.floor(((now ?? ticket.timingReceivedAt) - ticket.timingReceivedAt) / 1000))
  );
}

export function tripOverrun(ticket: Ticket, now?: number) {
  const estimatedSeconds = Math.max(0, ticket.estimatedSeconds ??
    ((Number(ticket.days) || 0) * 86400 + (Number(ticket.hours) || 0) * 3600 + (Number(ticket.minutes) || 0) * 60));
  const elapsedSeconds = travelSeconds(ticket, now);
  const overdueSeconds = estimatedSeconds > 0 ? Math.max(0, elapsedSeconds - estimatedSeconds) : 0;
  return {
    estimatedSeconds,
    elapsedSeconds,
    overdueSeconds,
    isOverdue: overdueSeconds > 0,
    flagged: Boolean(ticket.flagged) || overdueSeconds > 0,
  };
}

export function formatTravelTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return [hours, minutes, total % 60].map((value) => String(value).padStart(2, "0")).join(":");
}
