import {
  ClipboardList,
  History,
  MapPinned,
  Settings,
  Truck,
  Users,
  Radio,
  type LucideIcon,
} from "lucide-react";
import type { Department, Role, User } from "@/types/trip-ticket";

export type DepartmentOption = {
  value: Department;
  label: string;
  shortLabel: string;
};

// Edit this list to change department labels used throughout the operations UI.
// The values are database-safe keys and must remain aligned with the backend enum.
export const DEPARTMENTS: readonly DepartmentOption[] = [
  { value: "MIS", label: "MIS", shortLabel: "MIS" },
  { value: "FINANCE", label: "Finance", shortLabel: "Finance" },
  { value: "HUMAN_RESOURCES", label: "Human Resources", shortLabel: "HR" },
  { value: "OPERATIONS", label: "Operations", shortLabel: "Operations" },
];

export const departmentLabel = (department?: Department | string) =>
  DEPARTMENTS.find((item) => item.value === department)?.label || "Unassigned";

export type MenuItem = {
  label: string;
  path: string;
  description: string;
  icon: LucideIcon;
  roles?: readonly Role[];
  departments?: readonly Department[];
};

export const STAFF_ROLES = ["Department Head", "HR Head", "Finance Head", "Administrator"] as const;
export const ALL_DEPARTMENTS = DEPARTMENTS.map((department) => department.value) as Department[];

export const MENU_ITEMS: readonly MenuItem[] = [
  {
    label: "Pending",
    path: "/pending",
    description: "Requests awaiting review",
    icon: ClipboardList,
    roles: STAFF_ROLES,
    departments: ALL_DEPARTMENTS,
  },
  {
    label: "Outgoing",
    path: "/outgoing",
    description: "Approved and active trips",
    icon: Truck,
    roles: STAFF_ROLES,
    departments: ALL_DEPARTMENTS,
  },
  {
    label: "History",
    path: "/history",
    description: "Completed and denied tickets",
    icon: History,
    roles: STAFF_ROLES,
    departments: ALL_DEPARTMENTS,
  },
  {
    label: "Live GPS",
    path: "/live-gps",
    description: "Active vehicle positions",
    icon: MapPinned,
    roles: STAFF_ROLES,
    departments: ALL_DEPARTMENTS,
  },
  {
    label: "Registry",
    path: "/account-registry",
    description: "Employee accounts and RFID cards",
    icon: Users,
    roles: ["Administrator"],
    departments: ALL_DEPARTMENTS,
  },
  {
    label: "Settings",
    path: "/settings",
    description: "Your account preferences",
    icon: Settings,
    roles: STAFF_ROLES,
    departments: ALL_DEPARTMENTS,
  },
  {
    label: "Devices", path: "/devices", description: "GPS trackers and vehicle assignments",
    icon: Radio, roles: ["Administrator"], departments: ALL_DEPARTMENTS,
  },
];

// A page is available only when every access rule that it declares is met.
export const canAccessMenuItem = (
  user: Pick<User, "role" | "department"> | null,
  item?: MenuItem,
) => {
  if (!user || !item) return false;
  const roleAllowed = !item.roles || item.roles.includes(user.role);
  const departmentAllowed = !item.departments || item.departments.includes(user.department);
  return roleAllowed && departmentAllowed;
};

export const menuItemForPath = (path: string) => MENU_ITEMS.find((item) => item.path === path);
