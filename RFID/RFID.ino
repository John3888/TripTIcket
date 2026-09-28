#include "config.h"

#include "wifi_manager.h"

#include "rfid_manager.h"

#include "api_manager.h"

#include <ArduinoJson.h>

#include <WiFi.h>

unsigned long lastHeartbeatAt = 0;

void setup()
{
    Serial.begin(115200);

    connectWifi();

    initRFID();
}

void loop()
{
    if (!ensureWifi())
    {
        delay(1000);
        return;
    }

    const unsigned long now = millis();
    if (lastHeartbeatAt == 0 || now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS)
    {
        JsonDocument heartbeatResponse;
        if (sendHeartbeat(heartbeatResponse))
            Serial.println("tog! tog!....");
        else
            Serial.println("arrrghhh!");
        lastHeartbeatAt = now;
    }

    String uid;

    if(readUID(uid))
    {
        Serial.println(uid);
        Serial.println(WiFi.localIP());

        JsonDocument response;

        if(sendCard(uid,response))
        {
            serializeJsonPretty(response,Serial);

            Serial.println();
            Serial.println("Card delivered to Trip Ticket server (read-only mode)");
        }

        delay(1500);
    }
}
