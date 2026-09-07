import { api } from "./api";
import type { PublicStore } from "@/types/trip-ticket";

export const notificationService = {
  update: (notificationId: string, action: "read" | "close") =>
    api<PublicStore>(`/notifications/${notificationId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
  updateAll: (action: "read" | "close") =>
    api<PublicStore>("/notifications", {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
  clear: () => api<PublicStore>("/notifications", { method: "DELETE" }),
};
