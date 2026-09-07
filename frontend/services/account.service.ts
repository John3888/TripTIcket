import { api } from "./api";
import type { Department } from "@/types/trip-ticket";
export interface RegistryInput {
  uid: string;
  employeeId: string;
  firstName: string;
  middleName: string;
  surname: string;
  role: "Employee" | "Department Head" | "HR Head" | "Finance Head" | "Administrator";
  department: Department;
}
export type ExistingCardAssignment = {
  employeeId: string;
  name: string;
  role: string;
  department: Department;
  email: string;
};
export const accountService = {
  scan: (session: string) =>
    api<{
      ok: boolean;
      uid: string;
      available: boolean;
      existing: ExistingCardAssignment | null;
    }>("/account-registry/scan", {
      method: "POST",
      body: JSON.stringify({ session }),
    }),
  unassigned: () =>
    api<{ ok: boolean; employees: ExistingCardAssignment[] }>("/account-registry/unassigned"),
  employees: () =>
    api<{ ok: boolean; employees: ExistingCardAssignment[] }>("/account-registry/employees"),
  create: (data: Omit<RegistryInput, "uid">) =>
    api<{ ok: boolean; email: string; password: string }>("/account-registry/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  assign: (uid: string, employeeId: string) =>
    api<{ ok: boolean; uid: string; employee: ExistingCardAssignment }>(
      "/account-registry/assign",
      { method: "POST", body: JSON.stringify({ uid, employeeId }) },
    ),
  updateEmployee: (employeeId: string, data: Pick<RegistryInput, "role" | "department">) =>
    api<{ ok: boolean; employee: ExistingCardAssignment }>(
      `/account-registry/employees/${employeeId}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  register: (data: RegistryInput) =>
    api<{ ok: boolean; account: unknown; email: string; password: string }>("/account-registry", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  email: (email: string) =>
    api<{ ok: boolean; email: string }>("/account/email", {
      method: "PATCH",
      body: JSON.stringify({ email }),
    }),
  password: (currentPassword: string, newPassword: string) =>
    api("/account/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  notifications: (notificationMode: "on" | "silent" | "off") =>
    api("/account/notifications", {
      method: "PATCH",
      body: JSON.stringify({ notificationMode }),
    }),
};
