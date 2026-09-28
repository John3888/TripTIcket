#pragma once
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
static_assert(TRACKER_USE_WIFI == 0 || TRACKER_USE_WIFI == 1,
              "TRACKER_USE_WIFI must be 0 (cellular) or 1 (Wi-Fi)");
