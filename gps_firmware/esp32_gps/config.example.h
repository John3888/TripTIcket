#pragma once
constexpr char DEVICE_ID[] = "GPS-EMB-024";
constexpr char DEVICE_KEY[] = "";
constexpr char API_URL[] = "https://YOUR_BACKEND_HOST/api/gps/position";
constexpr char ROOT_CA[] = ""; 
constexpr char SIM_APN[] = "internet.dito.ph";
constexpr char SIM_PIN[] = ""; 
constexpr int MODEM_TX_PIN = 18, MODEM_RX_PIN = 21;
constexpr int GPS_RX_PIN = 16, GPS_TX_PIN = 17, GPS_BAUD = 9600;
constexpr int IMU_SDA_PIN = 8, IMU_SCL_PIN = 9;
constexpr uint8_t IMU_ADDRESS = 0x68;
constexpr uint32_t MIN_REPORT_MS = 10000, MOVING_REPORT_MS = 60000, HEARTBEAT_MS = 60000;
constexpr double REPORT_DISTANCE_M = 80, REPORT_TURN_DEG = 25;

#define TRACKER_USE_WIFI 0
#define TRACKER_WIFI_SSID ""
#define TRACKER_WIFI_PASSWORD ""
#define TRACKER_MODEM_BAUD 115200
