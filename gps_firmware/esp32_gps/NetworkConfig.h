#pragma once
#include <cstring>
 
inline const char* networkConfigError(const char* url, const char* key, const char* ca, bool secure=true) {
  if (std::strstr(url, "YOUR_BACKEND_HOST")) return "Replace YOUR_BACKEND_HOST with your public backend hostname (reachable over cellular).";
  const unsigned offset=secure ? 8 : 7;
  if (std::strncmp(url, secure ? "https://" : "http://", offset) != 0) return "API_URL scheme does not match the HTTP/HTTPS selection.";
  const char* path = std::strchr(url + offset, '/');
  if (!path || path == url + offset || std::strcmp(path, "/api/gps/position") != 0) return "POST path must be /api/gps/position on your backend host.";
  if (!std::strlen(key)) return "DEVICE_KEY is empty; set it to the backend EMB_GPS_DEVICE_KEY.";
  if (secure && (!std::strstr(ca, "-----BEGIN CERTIFICATE-----") || !std::strstr(ca, "-----END CERTIFICATE-----")))
    return "ROOT_CA must contain the PEM root certificate for your public backend's TLS certificate.";
  return nullptr;
}
