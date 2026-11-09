# Device WebSocket transport

Historical device-WebSocket firmware: `gps-2026-11-06-websocket-v10`. **Current firmware uses HTTPS POST: see [HTTPS.md](HTTPS.md), build `gps-2026-11-06-https-v11`.**

## v10: M8N bad-fix rejection and receiver evidence

Vehicle mode remains selected. `GPS_MAX_SPEED_KPH` on the backend and `TRACKER_MAX_SPEED_KPH` in firmware default to 200; the optional 10 km/h walking-test profile has **not** been enabled. A speed ceiling cannot distinguish erroneous 37 km/h readings from real vehicle travel, so no claim of restored field accuracy is made from that ceiling.

Known HDOP over 4, known satellite counts below 4, implausible jumps and speeds over the configured limit are rejected before position storage/smoothing. Heartbeats still report device activity when a fix is withheld. Missing ancillary metadata alone does not disconnect a tracker. History ignores clearly poor accuracy (over 30 m) and out-of-profile speed, with separate paths after rejected intervals rather than invented connectors. Received telemetry remains stored for diagnosis.

The confirmed u-blox M8N model supports UBX-NAV-PVT. Firmware sends its read-only poll every two seconds; no navigation model, baud, update rate or saved receiver configuration is changed. This requires **ESP32 GPS_TX_PIN (currently 17) → receiver RX**, in addition to the existing receiver TX → ESP32 GPS_RX_PIN wiring. Without a response, `gps.ubxAvailable` stays false and the receiver continues using NMEA with the basic quality checks.

Checksum-valid NAV-PVT packets provide the receiver's fix-valid flag, fix type, horizontal uncertainty and speed uncertainty. Fresh, near-time quality (under three seconds old, UTC within two seconds of the NMEA reading) must indicate a valid 3D fix, horizontal uncertainty at most 15 m and speed uncertainty at most 1 m/s. These are engineering thresholds for validation with the installed antenna; receiver estimates can themselves be optimistic under interference/multipath. Quality estimates improve rejection but cannot reconstruct an actual route from confidently incorrect receiver data.

For the next controlled test, open the hotspot diagnostics and retain `gps.rawRmc`, `gps.rawGga`, `gps.receiverLatitude`, `gps.receiverLongitude`, `gps.receiverSpeedKph`, `gps.checksumErrors`, `gps.ubxAvailable`, `gps.ubxSpeedKph`, `gps.receiverHorizontalAccuracyMeters`, `gps.receiverSpeedAccuracyKph` and `mpu`. Raw NMEA is captured before smoothing, including its checksum. UBX binary bytes are separately parsed instead of being fed into the NMEA decoder. The displayed `firmware` identifies v10.

This allows checking whether the large speed and displacement are present in the receiver output or introduced by parsing, and whether GPS speed agrees across NMEA/UBX. Antenna sky view, mounting/ground plane, power and receiver configuration must be checked against the actual installation before diagnosing failed hardware. Compile and unit tests do not verify the physical UART return wire or GNSS accuracy.

Protocol reference: [u-blox 8/M8 receiver manual, UBX-NAV-PVT](https://content.u-blox.com/sites/default/files/products/documents/u-blox8-M8_ReceiverDescrProtSpec_UBX-13003221.pdf). Antenna guidance: [u-blox GNSS antennas application note](https://content.u-blox.com/sites/default/files/products/documents/GNSS-Antennas_AppNote_%28UBX-15030289%29.pdf).

## v9: stationary trail pause

Stationary telemetry continues to update connectivity and freshness, but it no longer adds trail vertices or moves the displayed marker. Backend history and frontend live updates use the same movement rules. Starting requires three consecutive speed readings at least 2.5 km/h, coherent forward progress, and at least 8 metres of displacement. Stopping below 1.5 km/h pauses geometry immediately and resets the moving state after two readings. Once moving, vertices accumulate in steps of at least 2 metres. Missing speed requires three coherent position readings and at least 20 metres of displacement. These thresholds favor suppressing stationary jitter and should be field-tested for slow movement.

The firmware's stationary hold no longer releases when drift exceeds a radius. It requires three moving samples before release. Low-speed stationary reports remain accepted and uploaded; a vibrating MPU alone cannot unlock the hold. Existing low-speed history is filtered for display without deleting or rewriting stored points. The marker's position comes from the same filtered trace as the trail, preventing a page refresh from restoring raw jitter coordinates. The map displays “Stationary · Trail paused” while held. OSRM remains disabled.

The v8 notes below describe the previous rendering update; v9 supersedes its policy of drawing a breadcrumb for every stationary sample.

v8 adds stationary drift suppression, innovation-weighted Kalman smoothing, motion metadata and duplicate GPS-epoch suppression. Backend/frontend updates also restore recent trail vertices immediately, draw a white-outlined blue trail with a breadcrumb per stored reading, and extend existing canvas paths incrementally. No OSRM or road snapping is enabled. Previously stored drift remains part of the historical record; no coordinates have been rewritten or deleted.

For local LAN testing, select Wi-Fi (`TRACKER_USE_WIFI 1`) and ensure `DEVICE_KEY` matches the local backend's `EMB_GPS_DEVICE_KEY`. Cellular cannot normally reach a private LAN endpoint such as `192.168.x.x`. The saved private configuration on this machine has been aligned for local testing; flash again after changing it. These private credentials remain ignored by Git.

Device activity is independent of GPS quality: an authenticated WebSocket connection and subsequent server ping/pong keepalives update `lastSeenAt` and notify frontend viewers. The Live GPS trip row displays activity even before its first GPS fix. A map marker still requires actual coordinates, and the live Fleet view keeps one last-known reference per vehicle, including completed trips. Official completion clears only the displayed trail; its fleet row and marker remain. Offline markers appear translucent red after the inactivity timeout. A new ongoing trip takes over the same vehicle reference and starts a fresh trail. Recorded history remains stored. A completed vehicle returns to standby and can be requested again when free.

GPS and diagnostics use a persistent device WebSocket at `/api/gps/stream`. The backend saves GPS readings through the same authenticated, trip-scoped recording service and emits the existing Socket.IO `gps:position` and `gps:heartbeat` events to authorized frontend viewers. The browser's existing connection and permissions remain intact. No OSRM matching or gap routing runs.

## Configure and activate

1. Deploy the backend with its updated package lock and `EMB_GPS_DEVICE_KEY` configured. The tracker must be registered and enabled.
2. Configure the reverse proxy to forward WebSocket upgrades for **both** `/api/gps/stream` and `/socket.io/` to the backend. Use an idle timeout of at least 90 seconds. This repository does not contain the deployed reverse-proxy configuration.
3. Keep the device's existing `API_URL` in `config.h`, using `http(s)://host[:port]/api/gps/position`. Firmware derives the same host/port and connects to `/api/gps/stream`; no private configuration edit is needed. `TRACKER_USE_HTTPS 1` means WSS with `ROOT_CA`, hostname verification and valid UTC. A value of 0 means plain WS for local testing. Credentials never appear in URL query strings.
4. Install **ArduinoWebsockets** (gilmaimon), **TinyGPSPlus**, and **ArduinoJson**. Compile with ESP32 Arduino core **3.3.11** and the saved ESP32-S3 board settings, then flash the firmware. An ESP32-S3 compile is verified; modem, antenna and deployed-proxy behavior still require a device test.
5. Start a trip officially. Only `ONGOING` trips receive GPS points; official completion freezes the historical trail. Deploy the frontend changes from the Kalman/trail update as well.

For Nginx, merge the following into the existing backend proxy configuration (adjust the upstream address):

```nginx
location = /api/gps/stream {
    proxy_pass http://127.0.0.1:8500;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
}
```

The frontend's existing `/socket.io/` proxy rule must continue to support upgrades too.

## Message protocol and limits

The device handshake sends `x-emb-gps-key` and `x-emb-device-id` headers. The backend rejects empty/mismatched keys and unregistered/disabled devices. Device sockets cannot subscribe to browser rooms or impersonate another device ID. One current socket is maintained per device per backend instance; a new authenticated connection replaces the previous one.

The backend sends `{ "type": "gps:ready", "intervalMs": 1000, "maxReports": 16 }` on connection. The device sends batches of this shape:

```json
{
  "type": "gps:positions",
  "requestId": "unique-batch-id",
  "reports": [
    { "deviceId": "GPS-1", "hasFix": true, "latitude": 10, "longitude": 122, "recordedAt": "2026-11-06T00:00:00.000Z" }
  ]
}
```

The server accepts at most **one GPS batch per device per second**, with up to **16 readings** and a **16 KiB** message limit. Firmware spaces batches by at least 1.1 seconds. It waits for `{ "type": "gps:ack", "requestId": "...", "ok": true, "results": [...] }` before sending another GPS batch. Each result identifies whether that reading was recorded, skipped by trip/timestamp rules, or failed. Validation checks the complete batch before any readings are written. Database writes run sequentially and retain per-device/trip locking.

An explicitly rejected batch receives `ok:false`, a status, and (for rate limiting/backpressure) `retryAfterMs`. Firmware can safely retry a batch explicitly rejected with status 429 or 409 because none of it was processed. A successful batch acknowledgment can contain individual failed results; firmware does not replay those readings. A lost acknowledgment or connection drop never triggers replay of an uncertain batch, avoiding duplicate points without claiming exactly-once delivery.

The device polls the socket while GPS/MPU sampling continues on its separate task, sends ping frames every 15 seconds, and reconnects with bounded backoff. The backend also checks ping/pong liveness. An acknowledgment timeout is 10 seconds. A 16-reading FIFO absorbs brief delays; queued reports expire after 15 seconds, and overflow drops the oldest. This is best-effort telemetry; long outages can lose points.

Rate limits and connection ownership are per backend process. Run one backend instance for this deployment; multiple instances need a shared limiter/session store and a Socket.IO adapter before equivalent cross-instance behavior can be claimed.

## Diagnostics

Local hotspot diagnostics remain available without internet. `network.positionTransport` is `websocket`; inspect `websocketConnected`, `websocketCode`, `websocketAcks`, `backend`, `tls`, and `error`. `websocketCode=200` describes the last batch acknowledgment, not an HTTP request. The legacy `http` field is no longer the GPS upload result. `requestMs` measures batch acknowledgment latency, and `payloadBytes` measures the last batch sent. `outgoing` retains the most recent individual reading attempted, not the full batch.

With `TRACKER_REMOTE_DIAGNOSTICS 1`, diagnostic snapshots travel over the same socket every ten seconds rather than a separate blocking HTTP POST. An administrator can read recent snapshots at `GET /api/gps/diagnostics?deviceId=GPS-1`. History is bounded to 30 snapshots per device, 100 devices, and one hour; it is process-local and clears on restart. The legacy `diagnosticsHttp=200` field now indicates a diagnostic WebSocket acknowledgment.

Kalman smoothing accepts receiver-valid coordinates regardless of satellite count or HDOP; quality changes confidence rather than rejecting fixes. The MPU adjusts motion responsiveness without generating coordinates. v8 confirms three quiet low-speed samples (below 0.8 km/h) before holding stationary drift within 60 metres; motion or higher GPS speed releases the hold. Backend smoothing has a 12-metre low-speed deadband for older firmware and uses MPU motion when supplied. Large innovations reduce Kalman measurement confidence instead of moving the marker abruptly. Duplicate NMEA epochs are filtered/uploaded once. These heuristics reduce drift but cannot correct absolute GPS bias or determine which side of a road the receiver occupies. Every stored reading becomes a trail vertex, including stationary and small movements. Gaps over 60 seconds begin separate observed segments.

Implementation references: [ws server documentation](https://github.com/websockets/ws/blob/master/doc/ws.md), [ArduinoWebsockets](https://github.com/gilmaimon/ArduinoWebsockets), and [Nginx WebSocket proxying](https://nginx.org/en/docs/http/websocket.html).
