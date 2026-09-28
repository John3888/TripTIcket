#pragma once
// Copy to config.h and configure your hardware. Never commit device keys.
constexpr char DEVICE_ID[] = "GPS-EMB-024";
constexpr char DEVICE_KEY[] = "";
constexpr char WS_URL[] = "wss://YOUR_BACKEND_HOST/api/gps/device";
constexpr char ROOT_CA[] = ""; // Paste your backend root CA as a C++ raw string.
constexpr char SIM_APN[] = "internet.dito.ph";
constexpr char SIM_PIN[] = ""; // Only set if SIM PIN protection is enabled.
constexpr int MODEM_TX_PIN = 18, MODEM_RX_PIN = 21;
constexpr int GPS_RX_PIN = 16, GPS_TX_PIN = 17, GPS_BAUD = 9600;
constexpr int IMU_SDA_PIN = 8, IMU_SCL_PIN = 9;
constexpr uint8_t IMU_ADDRESS = 0x68;
constexpr uint32_t MIN_REPORT_MS = 10000, MOVING_REPORT_MS = 60000, HEARTBEAT_MS = 60000;
constexpr double REPORT_DISTANCE_M = 80, REPORT_TURN_DEG = 25;

// Internet transport: 0 = cellular (SIM), 1 = Wi-Fi for development.
// GPS and MPU sampling run in both modes. Wi-Fi mode never starts the modem.
#define TRACKER_USE_WIFI 1
#define TRACKER_WIFI_SSID "compile-check-only"
#define TRACKER_WIFI_PASSWORD ""
#define TRACKER_MODEM_BAUD 115200
