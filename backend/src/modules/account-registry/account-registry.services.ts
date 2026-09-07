import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { normalizeUid } from "../rfid/rfid.types.js";
import * as device from "../rfid/rfid.device-client.js";
import { emitStoreUpdated } from "../../realtime.js";

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const buildAccountData = (accountInput: any) => {
  const employeeId = accountInput.employeeId.toUpperCase(),
    firstName = normalizeName(accountInput.firstName),
    middleName = normalizeName(accountInput.middleName),
    surname = normalizeName(accountInput.surname);
  return {
    employeeId,
    firstName,
    middleName,
    surname,
    displayName: [firstName, middleName, surname].join(" "),
    designation: accountInput.role,
    role: accountInput.role,
    department: accountInput.department,
    email: `${firstName}.${surname}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@embcapital.local",
  };
};
async function nextUserId() {
  const latestUser = await prisma.user.findFirst({ orderBy: { userId: "desc" } });
  return `USR-${String(Number(latestUser?.userId.split("-").at(-1) || 0) + 1).padStart(3, "0")}`;
}

export async function createAccount(accountInput: any) {
  const accountData = buildAccountData(accountInput),
    existingEmployee = await prisma.employee.findFirst({
      where: {
        OR: [
          { employeeId: accountData.employeeId },
          { displayName: accountData.displayName },
          { email: accountData.email },
        ],
      },
    });
  if (existingEmployee)
    throw new AppError(409, "This employee ID, name, or email is already registered.");
  const userId = await nextUserId(),
    password = `EMB-${randomInt(100000, 999999)}`;
  const account = await prisma.$transaction(async (databaseTransaction) => {
    const employee = await databaseTransaction.employee.create({
      data: { ...accountData, rfidUid: null as any },
    });
    const user = await databaseTransaction.user.create({
      data: {
        userId,
        employeeId: accountData.employeeId,
        passwordHash: await bcrypt.hash(password, 12),
        appRole: accountData.role,
      },
    });
    return { employee, user };
  });
  emitStoreUpdated();
  return {
    ok: true,
    email: accountData.email,
    password,
    account: {
      employee: { ...account.employee, rfidUid: undefined },
      user: {
        userId,
        employeeId: accountData.employeeId,
        appRole: accountData.role,
        email: accountData.email,
        department: account.employee.department,
      },
      email: accountData.email,
      password,
    },
  };
}

export async function assignCard(body: any) {
  const uid = normalizeUid(body.uid),
    employeeId = String(body.employeeId).toUpperCase();
  if (!uid || !/^[A-F0-9]{4,32}$/.test(uid))
    throw new AppError(400, "The scanned card UID is invalid.");
  const [cardOwner, employee] = await Promise.all([
    prisma.employee.findUnique({ where: { rfidUid: uid } }),
    prisma.employee.findUnique({ where: { employeeId } }),
  ]);
  if (cardOwner)
    throw new AppError(409, `This card is already assigned to ${cardOwner.displayName}.`);
  if (!employee) throw new AppError(404, "Employee account was not found.");
  if (employee.rfidUid) throw new AppError(409, "This employee already has a card assigned.");
  const updated = await prisma.employee.update({
    where: { employeeId },
    data: { rfidUid: uid },
  });
  emitStoreUpdated();
  return {
    ok: true,
    employee: {
      employeeId: updated.employeeId,
      name: updated.displayName,
      role: updated.role,
      department: updated.department,
      email: updated.email,
    },
    uid,
  };
}

export async function unassigned() {
  const rows = await prisma.employee.findMany({
    where: { rfidUid: null as any },
    orderBy: { displayName: "asc" },
  });
  return {
    ok: true,
    employees: rows.map((employee) => ({
      employeeId: employee.employeeId,
      name: employee.displayName,
      role: employee.role,
      department: employee.department,
      email: employee.email,
    })),
  };
}

export async function employees() {
  const rows = await prisma.employee.findMany({ orderBy: { displayName: "asc" } });
  return {
    ok: true,
    employees: rows.map((employee) => ({
      employeeId: employee.employeeId,
      name: employee.displayName,
      role: employee.role,
      department: employee.department,
      email: employee.email,
    })),
  };
}

export async function updateEmployee(
  employeeId: string,
  body: { role: string; department: string },
) {
  const existing = await prisma.employee.findUnique({ where: { employeeId } });
  if (!existing) throw new AppError(404, "Employee account was not found.");

  const updated = await prisma.$transaction(async (databaseTransaction) => {
    const employee = await databaseTransaction.employee.update({
      where: { employeeId },
      data: {
        role: body.role,
        designation: body.role,
        department: body.department as any,
      },
    });
    await databaseTransaction.user.updateMany({
      where: { employeeId },
      data: { appRole: body.role },
    });
    return employee;
  });
  emitStoreUpdated();
  return {
    ok: true,
    employee: {
      employeeId: updated.employeeId,
      name: updated.displayName,
      role: updated.role,
      department: updated.department,
      email: updated.email,
    },
  };
}

export async function register(body: any) {
  const created = await createAccount(body);
  await assignCard({ uid: body.uid, employeeId: body.employeeId });
  return created;
}
export async function scan(body: any) {
  const payload = await device.scan({
    timeoutMs: body.timeoutMs,
    session: body.session,
  });
  const raw = payload.uid || payload.rawUid,
    uid = normalizeUid(raw);
  if (!uid || !/^[A-F0-9]{4,32}$/.test(uid))
    throw new AppError(400, "The ESP32 returned an invalid card UID.");
  await device.cancel({ session: body.session }).catch(() => undefined);
  const existing = await prisma.employee.findUnique({
    where: { rfidUid: uid },
  });
  return {
    ok: true,
    available: !existing,
    uid,
    rawUid: String(raw),
    existing: existing
      ? {
          employeeId: existing.employeeId,
          name: existing.displayName,
          role: existing.role,
          department: existing.department,
          email: existing.email,
        }
      : null,
  };
}
