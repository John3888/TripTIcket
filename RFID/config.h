#ifndef CONFIG_H
#define CONFIG_H

// WiFi
extern const char* WIFI_SSID;
extern const char* WIFI_PASSWORD;

// API
extern const char* API_URL;
extern const char* HEALTH_URL;
extern const char* DEVICE_ID;

#define HEARTBEAT_INTERVAL_MS 5000UL
#define HTTP_TIMEOUT_MS 2000  

// RFID Pins
#define SS_PIN 5
#define RST_PIN 9

// SPI Pins
#define SPI_SCK 12
#define SPI_MISO 13
#define SPI_MOSI 11

#endif
