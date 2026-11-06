import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { ENV } from "./config/env.js";
import routes from "./routes.js";
import { optionalAuth } from "./middlewares/auth.middleware.js";
import { canAccessStaffPage } from "./config/access-policy.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { setRealtime } from "./realtime.js";
import { prisma } from "./config/prismaClient.js";
import { attachGpsStream } from "./modules/gps/gps.stream.js";
import { record as recordGps, touchDevice } from "./modules/gps/gps.services.js";
import { saveDiagnostics } from "./modules/gps/gps.diagnostics.js";
const app = express(),
  server = http.createServer(app);
const origins = [ENV.FRONTEND_URL, ENV.FRONTEND_LAN_URL].filter(Boolean) as string[];
const io = new Server(server, { cors: { origin: origins, credentials: true }, destroyUpgrade: false });
attachGpsStream(server, {
  deviceKey: ENV.EMB_GPS_DEVICE_KEY,
  authorizeDevice: async (deviceId) => !!(await prisma.trackingDevice.findUnique({ where: { deviceId } }))?.enabled,
  record: recordGps,
  presence: touchDevice,
  diagnostics: saveDiagnostics,
});
setRealtime(io);
app.use(cors({ origin: origins, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));
app.use(optionalAuth);
app.use("/api", routes);
app.use(errorHandler);
io.use((socket, next) => {
  try {
    const token = socket.request.headers.cookie?.match(/(?:^|;\s*)EMB_TTR_SESSION=([^;]+)/)?.[1];
    if (!token) throw new Error();
    socket.data.auth = jwt.verify(decodeURIComponent(token), ENV.JWT_SECRET) as {
      userId: string;
      role: string;
    };
    next();
  } catch {
    next(new Error("Authentication is required."));
  }
});
io.on("connection", (socket) => {
  socket.join("trip-ticket");
  socket.join(`user:${socket.data.auth.userId}`);
  socket.join(`role:${socket.data.auth.role}`);
  socket.on("gps:subscribe", () => {
    if (canAccessStaffPage(socket.data.auth, "live-gps"))
      socket.join(socket.data.auth.role === "Department Head" ? `live-gps:${socket.data.auth.department}` : "live-gps");
  });
});
server.once("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `EMB Trip Ticket API could not start: port ${ENV.PORT} is already in use. ` +
        "Stop the existing backend instance before starting another one.",
    );
    process.exitCode = 1;
    return;
  }
  throw error;
});
server.listen(ENV.PORT, () => console.log(`EMB Trip Ticket API listening on ${ENV.PORT}`));
