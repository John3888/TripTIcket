import { api } from "./api";
import type { User } from "@/types/trip-ticket";
type RawUser = Partial<User> & { id?: string; appRole?: string };
export const adaptUser = (rawUser: RawUser): User => ({
  userId: String(rawUser.userId || rawUser.id || ""),
  employeeId: String(rawUser.employeeId || ""),
  role: String(rawUser.role || rawUser.appRole || "Requester") as User["role"],
  department: String(rawUser.department || "OPERATIONS") as User["department"],
  name: String(rawUser.name || ""),
  email: rawUser.email,
  notificationMode: rawUser.notificationMode,
});
export const authService = {
  login: async (username: string, password: string) =>
    adaptUser(
      (
        await api<{ user: RawUser }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        })
      ).user,
    ),
  session: async () => adaptUser((await api<{ user: RawUser }>("/auth/session")).user),
  logout: () => api("/auth/logout", { method: "POST" }),
};
