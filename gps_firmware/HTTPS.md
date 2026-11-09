# HTTPS device uploads

Current firmware: `gps-2026-11-06-https-v11`.

The device uses authenticated HTTP(S) POST again. The browser keeps its existing Socket.IO live connection:

**Device → HTTPS POST `/api/gps/position` → backend recording/filtering → frontend live updates.**

The device does not connect to `/api/gps/stream` and needs no device WebSocket proxy rule. The existing `API_URL`, `ROOT_CA`, Wi-Fi/cellular settings, pins and private device key are retained. `TRACKER_USE_HTTPS 1` enables verified HTTPS; `0` selects HTTP for local testing. The saved deployment configuration selects HTTPS and Wi-Fi.

## Activate

1. Flash the current `esp32_gps` sketch. The boot/hotspot firmware identifier must end in `https-v11`.
2. GPS delivery uses the already existing `/api/gps/position` endpoint. Ensure the device ID is registered/enabled and its key matches the deployed backend's `EMB_GPS_DEVICE_KEY`.
3. Deploy the updated backend to enable the HTTP rate limiter and `POST /api/gps/diagnostics`. No reverse-proxy WebSocket change is required for device uploads. The frontend's existing `/socket.io/` route continues to provide live updates.
4. Backend tests, native filter/protocol tests and the ESP32-S3 build pass. Actual device delivery still requires flashing and observing a successful acknowledgment.

## Limits and delivery

The firmware spaces successful GPS POSTs by at least 1.1 seconds. The updated HTTP endpoint allows one request per device per second and prevents overlapping writes. Diagnostic POSTs have a separate ten-second per-device limit. These HTTP limits are process-local; shared limits are needed before using multiple backend instances.

Sampling stays on its own task. The 16-report FIFO, 15-second queued-report freshness limit and bounded retry backoff remain. Failed or uncertain POSTs are not replayed, because a response can be lost after a database commit. Queue overflow and slow/offline networking can lose readings; this is not lossless offline recording. Diagnostic uploads are deferred when the position queue is backing up.

No-fix heartbeats continue every ten seconds, updating last-seen status without inventing coordinates. A successful acknowledgment with `recorded:false` may mean no active trip, poor fix quality or stationary handling; inspect `reason`. A completed trip clears the displayed trail, while its vehicle remains as a last-known reference. Only ongoing trips appear in the monitored-trip list.

## Diagnostics and GPS quality

Inspect `network.positionTransport` (`http_post`), `http`, `tls`, `backend`, `error`, `requestMs`, and `diagnosticsHttp`. `outgoing` is the latest position report attempted. HTTP 401/403 indicates key/device authorization or registration; 404 indicates a missing route; a negative HTTP code indicates a transport failure before an HTTP response. Remote diagnostic history remains administrator-only at `GET /api/gps/diagnostics`.

The Kalman filter, stationary latch, movement-confirmed trail filtering, bad-fix rejection and M8N raw NMEA/UBX quality diagnostics are retained. See the v10 section of [WEBSOCKET.md](WEBSOCKET.md) for the GPS quality/read-only UBX polling details; its device WebSocket transport instructions are historical. Vehicle mode remains selected, not the optional walking-test speed limit. Restoring HTTPS resolves the device transport choice, not the still-unverified GNSS field accuracy.

The deployed site's certificate was verified using the saved ISRG Root X2. An HTTPS check with a random nonexistent device ID reached the registration check without sending coordinates or updating any existing device or trip. This does not prove a physical tracker has connected.
