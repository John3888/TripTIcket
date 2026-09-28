#line 1 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\NetworkConfig.h"
#pragma once
#include <cstring>

inline const char* networkConfigError(const char* url, const char* key, const char* ca) {
  if (std::strstr(url, "YOUR_BACKEND_HOST")) return "Replace YOUR_BACKEND_HOST with your public backend hostname (reachable over cellular).";
  if (std::strncmp(url, "wss://", 6) != 0) return "WS_URL must start with wss:// for encrypted telemetry.";
  const char* path = std::strchr(url + 6, '/');
  if (!path || std::strcmp(path, "/api/gps/device") != 0) return "WebSocket path must be /api/gps/device; /api/gps/position accepts HTTP POST only.";
  if (!std::strlen(key)) return "DEVICE_KEY is empty; set it to the backend EMB_GPS_DEVICE_KEY.";
  if (!std::strstr(ca, "-----BEGIN CERTIFICATE-----") || !std::strstr(ca, "-----END CERTIFICATE-----"))
    return "ROOT_CA must contain the PEM root certificate for your public backend's TLS certificate.";
  return nullptr;
}
