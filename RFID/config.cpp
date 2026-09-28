#include "config.h"

const char* WIFI_SSID = "MIS_WIFI";
const char* WIFI_PASSWORD = "MISsoftware@2025";
// This must be the computer running the Trip Ticket backend, not the ESP32's own IP.
const char* API_URL = "http://192.168.1.112:5001/api/rfid/read";
const char* HEALTH_URL = "http://192.168.1.112:5001/api/rfid/health";
const char* DEVICE_ID = "EMB-RFID-01";
