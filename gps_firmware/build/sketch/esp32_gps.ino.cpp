#line 1 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\esp32_gps.ino"
#include <Arduino.h>
#include <PPP.h>
#include <TinyGPSPlus.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include <sys/time.h>
#include "PositionFilter.h"
#include "MotionSensor.h"
#include "NetworkConfig.h"
#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif

HardwareSerial gpsSerial(1);
TinyGPSPlus gps;
MotionSensor imu;
PositionFilter filter;
QueueHandle_t reports;
struct Report { char json[768]; uint32_t created; };

// Modem and socket stay in this task so GPS and IMU sampling never wait for LTE.
#line 24 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\esp32_gps.ino"
void networkTask(void*);
#line 89 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\esp32_gps.ino"
void setup();
#line 101 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\esp32_gps.ino"
void loop();
#line 24 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\esp32_gps.ino"
void networkTask(void*) {
  if (const char* error = networkConfigError(WS_URL, DEVICE_KEY, ROOT_CA)) {
    Serial.printf("Network configuration error: %s\n", error);
    vTaskDelete(nullptr); return;
  }
  websockets::WebsocketsClient socket;
  socket.setCACert(ROOT_CA);
  socket.addHeader("x-emb-gps-key",DEVICE_KEY);
  bool awaiting=false;
  uint32_t sentAt=0, retryAt=0, backoff=2000;
  socket.onMessage([&](websockets::WebsocketsMessage message) {
    JsonDocument ack;
    if (deserializeJson(ack,message.data()) == DeserializationError::Ok) {
      awaiting=false;
      Serial.printf("GPS ack: %s\n",message.data().c_str());
    }
  });
  socket.onEvent([&](websockets::WebsocketsEvent event, String) {
    if (event==websockets::WebsocketsEvent::ConnectionClosed) awaiting=false;
  });
  for (;;) {
    uint32_t now=millis();
    if (int32_t(now-retryAt)>=0 && !socket.available()) {
      if (!PPP.connected()) {
        Serial.println("LTE: contacting modem; check power, UART wiring and baud if this fails.");
        PPP.end();
        PPP.setApn(SIM_APN);
        if (strlen(SIM_PIN)) PPP.setPin(SIM_PIN);
        PPP.setPins(MODEM_TX_PIN,MODEM_RX_PIN);
        // Generic 3GPP dial path for A7670. UART2 leaves UART1 for GNSS.
        if (PPP.begin(PPP_MODEM_GENERIC,2,115200)) {
          uint32_t start=millis();
          while (!PPP.attached() && uint32_t(millis()-start)<30000) delay(250);
          if (PPP.attached()) {
            Serial.println("LTE: registered; requesting internet access using configured APN.");
            PPP.mode(ESP_MODEM_MODE_DATA); PPP.waitStatusBits(ESP_NETIF_CONNECTED_BIT,15000);
            if (!PPP.connected()) Serial.println("LTE: no PPP connection. Check APN, SIM data plan and modem PPP support.");
          } else Serial.println("LTE: not registered. Check SIM, antenna and coverage.");
        } else Serial.println("LTE: modem initialization failed.");
      }
      if (PPP.connected()) {
        if (time(nullptr)<1700000000) configTime(0,0,"pool.ntp.org","time.google.com");
        if (time(nullptr)<1700000000) Serial.println("TLS: waiting for UTC from GPS or NTP.");
        else if (socket.connect(WS_URL)) {
          Serial.println("WSS: connected to backend."); backoff=2000; awaiting=false;
        } else Serial.println("WSS: handshake failed. Check public DNS/reachability, ROOT_CA, device key and proxy WebSocket upgrade. Browser CORS does not apply to this client.");
      }
      retryAt=millis()+backoff+(esp_random()%1000);
      backoff=std::min(uint32_t(60000),backoff*2);
    }
    if (socket.available()) {
      socket.poll();
      if (awaiting && uint32_t(millis()-sentAt)>15000) { socket.close(); awaiting=false; }
      Report report;
      if (!awaiting && socket.available() && xQueueReceive(reports,&report,0)==pdTRUE) {
        // Do not replay stale fixes into a later trip. Latest fresh report wins.
        if (uint32_t(millis()-report.created)<15000 && socket.send(report.json)) {
          awaiting=true; sentAt=millis();
        }
      }
    }
    delay(10);
  }
}

void setup() {
  Serial.begin(115200);
  gpsSerial.setRxBufferSize(4096);
  gpsSerial.begin(GPS_BAUD,SERIAL_8N1,GPS_RX_PIN,GPS_TX_PIN);
  Wire.begin(IMU_SDA_PIN,IMU_SCL_PIN); Wire.setTimeOut(20);
  Serial.println(imu.begin(IMU_ADDRESS) ? "MPU9250 ready" : "MPU9250 unavailable: GPS-only filtering");
  reports=xQueueCreate(1,sizeof(Report));
  if (!reports || xTaskCreate(networkTask,"cellular",12288,nullptr,1,nullptr)!=pdPASS) {
    Serial.println("Cannot allocate cellular task"); while(true) delay(1000);
  }
}

void loop() {
  while (gpsSerial.available()) gps.encode(gpsSerial.read());
  uint32_t now=millis();
  static uint32_t lastReport=0,lastAccepted=0,lastImuRetry=0;
  static double sentLat=0,sentLng=0,sentHeading=0;
  static bool sentFix=false,valid=false;
  static bool imuStarted=imu.healthy;
  if (!imuStarted && uint32_t(now-lastImuRetry)>5000) { lastImuRetry=now; imuStarted=imu.begin(IMU_ADDRESS); }
  if (imuStarted) { imu.sample(now); if (!imu.healthy) imuStarted=false; }
  const bool fresh=gps.location.isValid() && gps.location.age()<3000 &&
    gps.hdop.isValid() && gps.hdop.age()<3000 && gps.satellites.isValid() && gps.satellites.age()<3000 &&
    gps.speed.isValid() && gps.speed.age()<3000 && gps.date.isValid() && gps.date.age()<3000 && gps.time.isValid() && gps.time.age()<3000;
  if (gps.location.isUpdated()) {
    // Consume the update flag even when other quality fields are unavailable.
    double lat=gps.location.lat(),lng=gps.location.lng();
    valid=fresh && filter.update(lat,lng,gps.hdop.hdop(),gps.satellites.value(),gps.speed.kmph(),
      imu.healthy && imu.quiet,imu.healthy && imu.dynamic,now);
    if (valid) lastAccepted=now;
  }
  if (!fresh) { valid=false; filter.good=0; }
  bool hasFix=valid && uint32_t(now-lastAccepted)<3000;
  double heading=gps.course.isValid() && gps.course.age()<3000 ? gps.course.deg() : -1;
  double turn=heading>=0 ? fabs(heading-sentHeading) : 0; turn=std::min(turn,360-turn);
  double moved=hasFix && sentFix ? PositionFilter::distance(sentLat,sentLng,filter.lat,filter.lng) : 0;
  bool moving=hasFix && gps.speed.kmph()>=3;
  bool due=uint32_t(now-lastReport)>=HEARTBEAT_MS || (hasFix && uint32_t(now-lastReport)>=MIN_REPORT_MS &&
    (!sentFix || moved>=REPORT_DISTANCE_M || (moving && (turn>=REPORT_TURN_DEG || uint32_t(now-lastReport)>=MOVING_REPORT_MS))));
  if (due) {
    JsonDocument doc;
    doc["deviceId"]=DEVICE_ID; doc["hasFix"]=hasFix; doc["uptimeMs"]=now;
    if (hasFix) {
      char timestamp[32];
      snprintf(timestamp,sizeof(timestamp),"%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",gps.date.year(),gps.date.month(),gps.date.day(),gps.time.hour(),gps.time.minute(),gps.time.second(),gps.time.centisecond()*10);
      doc["recordedAt"]=timestamp;
      doc["latitude"]=filter.lat; doc["longitude"]=filter.lng;
      doc["hdop"]=gps.hdop.hdop(); doc["satellites"]=gps.satellites.value();
      // Receiver uncertainty, not an overconfident Kalman covariance.
      doc["accuracyMeters"]=std::max(5.0,gps.hdop.hdop()*5);
      doc["speedKmph"]=gps.speed.kmph(); if (heading>=0) doc["heading"]=heading;
      if (imu.healthy) {
        doc["sensorVersion"]=1;
        doc["acceleration"]["x"]=imu.ax; doc["acceleration"]["y"]=imu.ay; doc["acceleration"]["z"]=imu.az;
        doc["acceleration"]["units"]="m/s2"; doc["acceleration"]["frame"]="device";
      }
      sentLat=filter.lat; sentLng=filter.lng; if (heading>=0) sentHeading=heading;
    }
    Report report{}; report.created=now;
    if (measureJson(doc)<sizeof(report.json)) { serializeJson(doc,report.json,sizeof(report.json)); xQueueOverwrite(reports,&report); }
    sentFix=hasFix; lastReport=now;
  }
  if (fresh && gps.date.year()>=2024 && time(nullptr)<1700000000) {
    tm utc{}; utc.tm_year=gps.date.year()-1900; utc.tm_mon=gps.date.month()-1; utc.tm_mday=gps.date.day();
    utc.tm_hour=gps.time.hour(); utc.tm_min=gps.time.minute(); utc.tm_sec=gps.time.second();
    timeval tv{mktime(&utc),0}; settimeofday(&tv,nullptr);
  }
  delay(1);
}

