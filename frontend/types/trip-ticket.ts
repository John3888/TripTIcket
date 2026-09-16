export type Role =
  "Department Head" | "HR Head" | "Finance Head" | "Administrator" | "Requester" | "Employee";
export type Department = "MIS" | "FINANCE" | "HUMAN_RESOURCES" | "OPERATIONS";
export type TicketStatus = "pending" | "noted" | "approved" | "ongoing" | "completed" | "denied";
export interface User {
  userId: string;
  employeeId: string;
  role: Role;
  department: Department;
  name: string;
  email?: string;
  notificationMode?: "on" | "silent" | "off";
}
export interface Employee {
  employeeId: string;
  name: string;
  role: string;
  department: Department;
  email?: string;
  status: string;
}
export interface Vehicle {
  vehicleId: string;
  plate: string;
  status: string;
  description?: string;
}
export interface Ticket {
  id: string;
  requestedBy: string;
  requesterRole?: string;
  requesterDepartment?: Department;
  approvalActions?: ("note" | "approve" | "deny")[];
  employee?: string;
  plate: string;
  destination: string;
  purpose: string;
  duration?: string;
  departure?: string | null;
  arrival?: string | null;
  elapsedSeconds?: number;
  estimatedSeconds?: number;
  overdueSeconds?: number;
  isOverdue?: boolean;
  flagged?: boolean;
  expectedReturnAt?: string | null;
  timingReceivedAt?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  status: TicketStatus;
  createdAt?: string;
  notedBySupervisor?: string | null;
  notedBySupervisorAt?: string | null;
  notedByHr?: string | null;
  notedByHrAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  decisionBy?: string | null;
  gps?: GpsPoint | null;
  gpsTrail?: GpsPoint[];
}
export interface GpsPoint {
  id: string;
  deviceId?: string | null;
  latitude: number;
  longitude: number;
  speedKph?: number | null;
  heading?: number | null;
  accuracyMeters?: number | null;
  recordedAt: string;
}
export interface DeviceStatus {
  connected: boolean;
  message: string;
  device?: string;
  capabilities?: { read: boolean; write: boolean };
  lastSeenAt?: string | null;
}
export interface ScanResult {
  ok: boolean;
  type: "ticket" | "movement";
  uid: string;
  rfidToken: string;
  employee: Employee;
  user: User | null;
  movementTickets?: Ticket[];
}
export interface PublicStore {
  employees: Employee[];
  vehicles: Vehicle[];
  users: User[];
  requests: Ticket[];
  pending: Ticket[];
  outgoing: Ticket[];
  history: Ticket[];
  updatedAt: string;
  createdRequest?: Ticket;
  notifications: StoreNotification[];
}
export interface StoreNotification {
  id: string;
  title: string;
  body: string;
  kind?: string;
  ticketId?: string;
  recipients: Role[];
  closedBy: string[];
  readBy: string[];
  createdAt: string;
}
