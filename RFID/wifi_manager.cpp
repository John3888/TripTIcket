#include <WiFi.h>
#include "config.h"

void connectWifi()
{
    WiFi.mode(WIFI_STA);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("Connecting");

    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println("Connected!");

    Serial.println(WiFi.localIP());
}

bool ensureWifi()
{
    if (WiFi.status() == WL_CONNECTED)
        return true;

    Serial.println("WiFi disconnected. Reconnecting...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    const unsigned long startedAt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 10000UL)
        delay(250);

    return WiFi.status() == WL_CONNECTED;
}
