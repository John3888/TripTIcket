import type { Ticket } from "@/types/trip-ticket";

export function receiveTicketTiming(tickets: Ticket[], receivedAt = Date.now()): Ticket[] {
  return tickets.map((ticket) => ({ ...ticket, timingReceivedAt: receivedAt }));
}

export function travelSeconds(ticket: Ticket, now?: number) {
  const saved = Math.max(0, ticket.elapsedSeconds || 0);
  if (ticket.status !== "ongoing" || !ticket.departure || !ticket.timingReceivedAt) return saved;
  // Advance from the server's elapsed duration, so a kiosk clock in another
  // timezone or with a different clock setting does not change the trip time.
  return (
    saved +
    Math.max(0, Math.floor(((now ?? ticket.timingReceivedAt) - ticket.timingReceivedAt) / 1000))
  );
}

export function formatTravelTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return [hours, minutes, total % 60].map((value) => String(value).padStart(2, "0")).join(":");
}
