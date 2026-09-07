import { api } from "./api";
import type { PublicStore, User } from "@/types/trip-ticket";
export interface CreateTicket {
  plate: string;
  destination: string;
  purpose: string;
  days: number;
  hours: number;
  minutes: number;
  rfidToken: string;
}
export type StaffStorePage =
  "pending" | "outgoing" | "history" | "live-gps" | "settings" | "account-registry";
const normalizePublicStore = (partialStore: Partial<PublicStore>): PublicStore => {
  const requests = Array.isArray(partialStore.requests) ? partialStore.requests : [];
  return {
    employees: Array.isArray(partialStore.employees) ? partialStore.employees : [],
    vehicles: Array.isArray(partialStore.vehicles) ? partialStore.vehicles : [],
    users: Array.isArray(partialStore.users) ? partialStore.users : [],
    notifications: Array.isArray(partialStore.notifications) ? partialStore.notifications : [],
    requests,
    pending: Array.isArray(partialStore.pending)
      ? partialStore.pending
      : requests.filter((r) => ["pending", "noted"].includes(r.status)),
    outgoing: Array.isArray(partialStore.outgoing)
      ? partialStore.outgoing
      : requests.filter((r) => ["approved", "ongoing"].includes(r.status)),
    history: Array.isArray(partialStore.history)
      ? partialStore.history
      : requests.filter((r) => ["completed", "denied"].includes(r.status)),
    updatedAt: String(partialStore.updatedAt || ""),
    createdRequest: partialStore.createdRequest,
  };
};
export const ticketService = {
  store: async (page: StaffStorePage = "pending") =>
    normalizePublicStore(await api<Partial<PublicStore>>(`/store?page=${page}`)),
  kioskStore: async () => normalizePublicStore(await api<Partial<PublicStore>>("/store/kiosk")),
  create: async (ticketInput: CreateTicket) =>
    normalizePublicStore(
      await api<Partial<PublicStore>>("/request", {
        method: "POST",
        body: JSON.stringify(ticketInput),
      }),
    ),
  action: async (ticketId: string, requestedAction: string, rfidToken?: string | User) =>
    normalizePublicStore(
      await api<Partial<PublicStore>>(`/request/${ticketId}/action`, {
        method: "POST",
        body: JSON.stringify({
          action: requestedAction,
          rfidToken: typeof rfidToken === "string" ? rfidToken : undefined,
        }),
      }),
    ),
  remove: async (ticketId: string) =>
    normalizePublicStore(
      await api<Partial<PublicStore>>(`/request/${ticketId}`, { method: "DELETE" }),
    ),
};
