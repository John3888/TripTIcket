#line 1 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\config.example.h"
#pragma once
// Copy to config.h and configure your hardware. Never commit device keys.
constexpr char DEVICE_ID[] = "GPS-EMB-024";
constexpr char DEVICE_KEY[] = "";
constexpr char WS_URL[] = "wss://YOUR_BACKEND_HOST/api/gps/device";
constexpr char ROOT_CA[] = ""; // PEM root CA for the public backend's certificate
constexpr char SIM_APN[] = "internet";
constexpr char SIM_PIN[] = "";
constexpr int MODEM_TX_PIN = 18, MODEM_RX_PIN = 21;
constexpr int GPS_RX_PIN = 16, GPS_TX_PIN = 17, GPS_BAUD = 9600;
constexpr int IMU_SDA_PIN = 8, IMU_SCL_PIN = 9;
constexpr uint8_t IMU_ADDRESS = 0x68;
constexpr uint32_t MIN_REPORT_MS = 10000, MOVING_REPORT_MS = 60000, HEARTBEAT_MS = 60000;
constexpr double REPORT_DISTANCE_M = 80, REPORT_TURN_DEG = 25;
