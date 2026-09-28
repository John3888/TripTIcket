#line 1 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\NetworkConfig.h"
#pragma once
#include <cstring>
 
inline const char* networkConfigError(const char* url, const char* key, const char* ca) {
  if (std::strstr(url, "YOUR_BACKEND_HOST")) return "Replace YOUR_BACKEND_HOST with your public backend hostname (reachable over cellular).";
  if (std::strncmp(url, "https://", 8) != 0) return "API_URL must start with https:// for encrypted telemetry.";
  const char* path = std::strchr(url + 8, '/');
  if (!path || path == url + 8 || std::strcmp(path, "/api/gps/position") != 0) return "HTTPS POST path must be /api/gps/position on your backend host.";
  if (!std::strlen(key)) return "DEVICE_KEY is empty; set it to the backend EMB_GPS_DEVICE_KEY.";
  if (!std::strstr(ca, "-----BEGIN CERTIFICATE-----") || !std::strstr(ca, "-----END CERTIFICATE-----"))
    return "ROOT_CA must contain the PEM root certificate for your public backend's TLS certificate.";
  return nullptr;
}
