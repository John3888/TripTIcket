# Live RFID status

The scan dialog checks `GET /api/rfid/status` immediately and every two seconds while open. This works for public kiosks and signed-in staff without refreshing the page. Checks stop when the dialog closes. Network failures show that the status is unavailable and checks resume automatically.

The backend marks the reader down after 15 seconds without a heartbeat or valid card read. A returning heartbeat/read appears online on the next check (normally within two seconds). Power loss is detected about 15–17 seconds after the last heartbeat on an active page; browser background throttling or network delays can increase this.

The ESP32 firmware must POST `{}` to `/api/rfid/health` every five seconds, including while idle. Only send this heartbeat when the reader hardware is initialized and healthy; an ESP32 heartbeat alone cannot prove that its RFID module is working. Continue posting card UIDs to `/api/rfid/read` as before. Firmware is not included in this repository.

If existing firmware sends heartbeats less frequently, update it or set `EMB_ESP32_HEARTBEAT_TIMEOUT_MS` in the backend environment to at least three heartbeat intervals, then restart the backend. For example, a 30-second heartbeat needs `EMB_ESP32_HEARTBEAT_TIMEOUT_MS=90000`. A longer timeout also means slower outage detection. Firmware that sends only card scans cannot reliably report idle reader health.
