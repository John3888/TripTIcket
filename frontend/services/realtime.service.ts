"use client";

import { io } from "socket.io-client";
import { apiUrl } from "./api";

// Socket.IO connects to the backend origin, not its /api REST prefix.
const realtimeUrl = () => apiUrl().replace(/\/api$/, "");

export const createRealtimeClient = () =>
  io(realtimeUrl(), {
    withCredentials: true,
    // Begin with the browser-compatible polling handshake, then Socket.IO
    // upgrades to WebSocket automatically. Starting directly with a WebSocket
    // can drop an authenticated LAN connection before its cookie is accepted.
    upgrade: true,
  });
