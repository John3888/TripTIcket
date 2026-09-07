import type { TicketStatus } from "@/types/trip-ticket";
export function StatusPill({ status }: { status: TicketStatus }) {
  return (
    <span className={`status status-${status}`}>{status === "ongoing" ? "On Trip" : status}</span>
  );
}
