#include "api_manager.h"

#include "config.h"

#include <WiFi.h>

#include <HTTPClient.h>

bool sendCard(String uid, JsonDocument &doc)
{
    if (WiFi.status() != WL_CONNECTED)
        return false;

    HTTPClient http;

    http.begin(API_URL);
    http.setConnectTimeout(HTTP_TIMEOUT_MS);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");

    JsonDocument body;
    body["uid"] = uid;
    body["deviceId"] = DEVICE_ID;

    String json;
    serializeJson(body, json);

    int code = http.POST(json);

    if (code <= 0)
    {
        Serial.print("Connection Error: ");
        Serial.println(http.errorToString(code));
        http.end();
        return false;
    }

    switch (code)
    {
        case 200:
            Serial.println("Success");
            break;

        case 404: 
            Serial.println("Endpoint not found");
            http.end();
            return false;

        case 500:
            Serial.println("Internal Server Error");
            http.end();
            return false;

        default:
            Serial.print("HTTP Code: ");
            Serial.println(code);
            http.end();
            return false;
    }

    String response = http.getString();

    DeserializationError err = deserializeJson(doc, response);

    if (err)
    {
        Serial.print("JSON Error: ");
        Serial.println(err.c_str());
        http.end();
        return false;
    }

    http.end();
    return true;
}

bool sendHeartbeat(JsonDocument &doc)
{
    if (WiFi.status() != WL_CONNECTED)
        return false;

    HTTPClient http;
    http.begin(HEALTH_URL);
    http.setConnectTimeout(HTTP_TIMEOUT_MS);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");

    JsonDocument body;
    body["deviceId"] = DEVICE_ID;
    body["ip"] = WiFi.localIP().toString();
    body["capabilities"]["read"] = true;
    body["capabilities"]["write"] = false;

    String json;
    serializeJson(body, json);
    const int code = http.POST(json);
    if (code != 200)
    {
        Serial.print("Heartbeat HTTP Code: ");
        Serial.println(code);
        if (code <= 0)
        {
            Serial.print("Heartbeat connection error: ");
            Serial.println(http.errorToString(code));
        }
        http.end();
        return false;
    }

    const String response = http.getString();
    const DeserializationError err = deserializeJson(doc, response);
    http.end();
    return !err;
}
