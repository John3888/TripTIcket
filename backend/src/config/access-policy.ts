export type StaffPage =
  "pending" | "outgoing" | "history" | "live-gps" | "settings" | "account-registry";

type AuthActor = { role: string; department: string };

const STAFF_ROLES = ["Department Head", "HR Head", "Finance Head", "Administrator"];
const ALL_DEPARTMENTS = ["MIS", "FINANCE", "HUMAN_RESOURCES", "OPERATIONS"];

// Server-safe equivalent of frontend/app/(admin)/config/menu.config.tsx.
// Keep both maps aligned whenever a workspace page is added or changed.
export const STAFF_PAGE_POLICIES: Record<StaffPage, { roles: string[]; departments: string[] }> = {
  pending: { roles: STAFF_ROLES, departments: ALL_DEPARTMENTS },
  outgoing: { roles: STAFF_ROLES, departments: ALL_DEPARTMENTS },
  history: { roles: STAFF_ROLES, departments: ALL_DEPARTMENTS },
  "live-gps": {
    roles: STAFF_ROLES,
    departments: ALL_DEPARTMENTS,
  },
  settings: { roles: STAFF_ROLES, departments: ALL_DEPARTMENTS },
  "account-registry": { roles: ["Administrator"], departments: ALL_DEPARTMENTS },
};

export const isStaffRole = (role: string) => STAFF_ROLES.includes(role);

export const canAccessStaffPage = (actor: AuthActor, page: StaffPage) => {
  const policy = STAFF_PAGE_POLICIES[page];
  return policy.roles.includes(actor.role) && policy.departments.includes(actor.department);
};

export const isStaffPage = (value: string): value is StaffPage =>
  Object.hasOwn(STAFF_PAGE_POLICIES, value);
