#ifndef API_MANAGER_H
#define API_MANAGER_H

#include <ArduinoJson.h>

bool sendCard(String uid,JsonDocument &response);
bool sendHeartbeat(JsonDocument &response);

#endif
