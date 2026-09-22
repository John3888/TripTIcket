import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prismaClient.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { emitStoreUpdated } from "../../realtime.js";

const assignment = z.object({ vehicleId: z.string().min(1).max(24), enabled: z.boolean() });
const registration = assignment.extend({ deviceId: z.string().regex(/^[\w-]{1,80}$/) });

export async function saveDevice(body: z.infer<typeof registration>, create: boolean) {
  try {
    const device = await prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT device_id FROM tracking_devices WHERE device_id = ${body.deviceId} FOR UPDATE`;
      const current = await db.trackingDevice.findUnique({ where: { deviceId: body.deviceId } });
      if (create && current) throw new AppError(409, "This device is already registered. Edit its assignment instead.");
      if (!create && !current) throw new AppError(404, "Device not found.");
      // Match telemetry's lock order: device first, then vehicles in stable order.
      for (const id of [...new Set([body.vehicleId, ...(current ? [current.vehicleId] : [])])].sort()) {
        await db.$queryRaw`SELECT vehicle_id FROM vehicles WHERE vehicle_id = ${id} FOR UPDATE`;
      }
      const vehicle = await db.vehicle.findUnique({ where: { vehicleId: body.vehicleId } });
      if (!vehicle) throw new AppError(404, "Vehicle not found.");
      if (!current || current.vehicleId !== body.vehicleId) {
        const ongoing = await db.tripRequest.findFirst({ where: { status: "ONGOING", vehicleId: { in: [body.vehicleId, ...(current ? [current.vehicleId] : [])] } } });
        if (vehicle.status !== "STANDBY" || ongoing)
          throw new AppError(409, "Assignments can only change when both vehicles have finished their trips and the destination vehicle is on standby.");
      }
      const data = { vehicleId: body.vehicleId, enabled: body.enabled };
      return create
        ? db.trackingDevice.create({ data: { deviceId: body.deviceId, ...data }, include: { vehicle: true } })
        : db.trackingDevice.update({ where: { deviceId: body.deviceId }, data, include: { vehicle: true } });
    }, { isolationLevel: "ReadCommitted" });
    emitStoreUpdated(["Administrator"]);
    return device;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      throw new AppError(409, "That device ID or vehicle already has an assignment. Move the existing tracker first.");
    throw error;
  }
}

const router = Router();
router.use(requireAuth, requireRole("Administrator"));
router.get("/", async (_req, res) => {
  const [devices, vehicles] = await Promise.all([
    prisma.trackingDevice.findMany({ include: { vehicle: true }, orderBy: { deviceId: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { plate: "asc" } }),
  ]);
  res.json({ devices, vehicles });
});
router.post("/", validateBody(registration), async (req, res) => {
  res.status(201).json(await saveDevice(req.body, true));
});
router.patch("/:id", validateBody(assignment), async (req, res) => {
  res.json(await saveDevice({ ...req.body, deviceId: String(req.params.id) }, false));
});
export default router;
