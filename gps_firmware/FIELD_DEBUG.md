## Current restored build: gps-2026-10-13-backup-filter-v4

The current source is restored from the supplied backup. Select TRACKER_USE_HTTPS in config.h for both location and remote-log uploads. HTTP skips ROOT_CA/UTC checks; HTTPS keeps them. API_URL still specifies the host, explicit port if needed, and position path. Settings and wiring come from the backup, so older examples below may name an earlier endpoint. GPS filter behavior and current build instructions are documented in README.md.

# Field testing without a USB cable

## HTTPS certificate repair

The configured `ROOT_CA` was malformed and could not be parsed as an X.509 certificate. It has been replaced with the official self-signed ISRG Root X2 from https://letsencrypt.org/certs/isrg-root-x2.pem (also saved as `isrg-root-x2.pem`). SHA-256: `69:72:9B:8E:15:A8:6E:FC:17:7A:57:AF:B7:17:1D:FC:64:AD:D2:8C:2F:CA:8C:F1:50:7E:34:45:3C:CB:14:70`.

A desktop TLS 1.2 connection to `tripticket.jgccorporatesolutions.com` successfully verified using only this root. The observed site chain includes YE1 → Root YE → ISRG Root X2. This validates the certificate repair, not a device POST, SIM connection, or API authorization. Flash the updated firmware; successful position delivery still requires a valid clock, connectivity, and a successful API response. Certificate verification remains enabled for both location and diagnostic uploads.

The saved `config.h` now selects cellular (`TRACKER_USE_WIFI 0`) and the deployed HTTPS `/api/gps/position` endpoint. The DITO APN stays `internet.dito.ph`. SIM slot selection is **not guessed**: the modem uses the board's currently selected slot. Its exact board model/manual and the captured `AT+CPIN?` / `AT+DUALSIM?` replies are needed to verify SIM 1. `ERROR` for DUALSIM alone can simply mean an unsupported command.

## Nearby phone, even without internet

1. Flash the firmware and power the ESP32 and modem from their specified supplies. No UART connection is required afterwards.
2. Join Wi-Fi **TripTicket-GPS-EMB-024** (the suffix is your configured DEVICE_ID). The private password is `TRACKER_DEBUG_AP_PASSWORD` in `esp32_gps/debug.private.h`; this new password file is ignored by Git and the password is not printed in logs.
3. Stay connected even if your phone says this network has no internet. Open **http://192.168.4.1/**. Sign in with username **admin** and the same password.
4. The page refreshes every ten seconds and retains the last 30 snapshots while the page remains open. If the phone disconnects, the page explicitly reports fetch failures. It does not recover history from before the page was opened.

This diagnostic page is restricted to the hotspot subnet and requires authentication. It can run alongside GSM, or in AP+STA mode alongside development Wi-Fi. It does not route phone traffic to the SIM. Set `TRACKER_DEBUG_AP 0` after field testing to disable it.

If the hotspot stays visible but your phone leaves after login, select **Stay connected / Use this network anyway**. Temporarily disable the phone's automatic switch to mobile data or another Wi-Fi network if necessary. Open the address in a normal browser, not the Wi-Fi sign-in assistant. The firmware cannot override the phone's no-internet network selection. You can temporarily turn mobile data off to check this behavior; restore it after testing.

The page retries failed requests with a six-second timeout. Expand **Device and hotspot health** to see uptime, the last reset reason, free memory, task stack headroom, and client join/leave counts. Increasing uptime while reconnecting suggests the device stayed running; a restarted uptime or a brownout/panic reset reason points to a device restart. A complete power loss may only report “Power on.” The large snapshot buffers now live outside task stacks and Wi-Fi sleep is disabled for the diagnostic hotspot. These changes reduce firmware-side risks but do not make the hotspot provide internet.

## Remote web app

Deploy the updated backend **and** frontend. Sign in as Administrator, open **Live GPS → Device diagnostics**, and optionally enter a device ID to see its recent history. No active trip is required to receive diagnostics, but the device must be registered and enabled and its DEVICE_KEY must match the deployed backend's EMB_GPS_DEVICE_KEY.

The firmware POSTs debug snapshots to `/api/gps/diagnostics` using the same HTTPS host, root certificate and authentication header as the location API. The administrator page polls every ten seconds and marks old entries STALE. Location messages remain on `/api/gps/position`; debug status is separate and does not store positions as trip points. An invalid clock, failed TLS connection or offline modem can prevent remote diagnostics too—use the hotspot in those cases.

History is a temporary, per-process buffer: at most 30 snapshots per device, 100 devices total, expiring after an hour. It clears on server restart. Use one backend instance for this debugging session; multiple independent instances do not share these buffers. Diagnostics ingest accepts at most one snapshot per device per five seconds. API access is restricted to device authentication for writes and administrators for reads.

## Reading a snapshot

If GPS has a filtered fix and GSM says PPP connected but `http=-1`, no HTTP response was received; the map cannot receive that upload. A `tls=-1` failure at the configured connection timeout points to TCP/socket setup, not a specific certificate-verification error. Both upload paths now select the internet interface before connecting and resolve IPv4 explicitly when PPP has IPv4, preserving the original hostname for TLS SNI and certificate checks. Cellular connect timeout is 30 seconds; TLS handshake timeout is separately 30 seconds. These are bounded attempts, not a guarantee of delivery. `network.error` includes the attempted destination IP/port, local IP, elapsed time, and failure code. Local sampling continues while an upload waits.

After uploads receive a successful API acknowledgement, the live trip map still requires an enabled registered tracker, a vehicle assignment, and an ONGOING trip for that vehicle. `ok=true, recorded=false, reason=no_active_trip` means the server received telemetry but did not create a trip map point. Other filter reasons (including signal confirmation) are reported in `network.error`. Do not change GPS coordinates or bypass these rules to troubleshoot a transport failure.

- `gps`: processed coordinates only when a current filtered fix is available, plus status, satellite count, HDOP and speed. Missing/unusable coordinates are null, not stale coordinates presented as fresh.
- `mpu`: detected model, read/calibration status, health and motion classification. Accelerometer measurements remain local; no raw acceleration is added to the location upload.
- `network`: GSM and Wi-Fi stages, cached modem query responses, last position HTTP/TLS results and error/rejection reason. Cached modem signal/registration responses are from command mode; no AT queries interrupt an active PPP session.
- `requestMs` and `payloadBytes`: most recent position POST attempt duration (including DNS/TLS/response) and payload size. `effectiveUploadBps` is an approximate application payload rate for a 2xx response, **not** cellular link bandwidth. Wi-Fi RSSI is dBm, or null when unavailable.
- `diagnosticsHttp`: previous remote-debug POST result; 200 means received, 403 means check key/device registration, and 404 means the diagnostics route is not deployed/reachable.
- `outgoing`: exact most recent position JSON attempted, including failed attempts. `outgoingUptimeMs` is the uptime when that report was generated. Null means no attempt yet. This is not proof the backend recorded it.

Snapshots and debug-mode location heartbeats are produced every ten seconds. Uploads are best-effort: network timeouts, registration waits and backoff can delay delivery. Only the latest snapshot is sent; old location reports are never replayed. Debug uploads add SIM traffic. Set `TRACKER_REMOTE_DIAGNOSTICS 0` to stop remote debugging and restore normal location reporting intervals; the local hotspot can remain enabled separately.

GPS date/time now sets the clock independently of position quality. UTC is still required for certificate verification. Logs never intentionally include the device key, SIM PIN or Wi-Fi passwords. Send the complete `network` snapshot when diagnosing a failure, especially model, CPIN, CEREG, CSQ and HTTP/TLS codes. Compilation and desktop tests cannot confirm modem power, SIM-slot switching, carrier band support or actual field delivery.
