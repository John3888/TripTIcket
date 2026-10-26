#pragma once
#ifndef TRACKER_USE_HTTPS
#define TRACKER_USE_HTTPS 1 // 0=HTTP, 1=HTTPS; applies to positions and remote diagnostics.
#endif
static_assert(TRACKER_USE_HTTPS==0 || TRACKER_USE_HTTPS==1, "TRACKER_USE_HTTPS must be 0 or 1");
inline String apiEndpoint() {
  String url(API_URL);
  if (!url.startsWith("http://") && !url.startsWith("https://")) return url;
  return String(TRACKER_USE_HTTPS ? "https://" : "http://")+url.substring(url.indexOf("://")+3);
}
#if __has_include("debug.private.h")
#include "debug.private.h"
#endif
#ifndef TRACKER_USE_WIFI
#define TRACKER_USE_WIFI 0
#endif
#ifndef TRACKER_WIFI_SSID
#define TRACKER_WIFI_SSID ""
#endif
#ifndef TRACKER_WIFI_PASSWORD
#define TRACKER_WIFI_PASSWORD ""
#endif
#ifndef TRACKER_MODEM_BAUD
#define TRACKER_MODEM_BAUD 115200
#endif
#ifndef TRACKER_REMOTE_DIAGNOSTICS
#define TRACKER_REMOTE_DIAGNOSTICS 1
#endif
#ifndef TRACKER_DEBUG_AP
#define TRACKER_DEBUG_AP 0
#endif
#ifndef TRACKER_DEBUG_AP_PASSWORD
#define TRACKER_DEBUG_AP_PASSWORD ""
#endif
static_assert(TRACKER_USE_WIFI == 0 || TRACKER_USE_WIFI == 1,
              "TRACKER_USE_WIFI must be 0 (cellular) or 1 (Wi-Fi)");
