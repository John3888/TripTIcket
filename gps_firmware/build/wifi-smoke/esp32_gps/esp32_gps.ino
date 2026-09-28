#include <Arduino.h>
#include <PPP.h>
#include <WiFi.h>
#include <TinyGPSPlus.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include <sys/time.h>
#include <atomic>
#include "PositionFilter.h"
#include "MotionSensor.h"
#include "NetworkConfig.h"
#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif
#include "TransportConfig.h"

HardwareSerial gpsSerial(1);
TinyGPSPlus gps;
MotionSensor imu;
PositionFilter filter;
QueueHandle_t reports;
struct Report { char json[768]; uint32_t created; };

// Publish diagnostics without querying the modem from the sampling task.
std::atomic<const char*> lteStatus{"STARTING"};
std::atomic<const char*> wifiStatus{"DISABLED (cellular mode)"};
std::atomic<const char*> backendStatus{"WAITING"};
constexpr uint32_t STATUS_INTERVAL_MS = 5000;

void logModuleStatus(uint32_t now, bool hasFix, bool sawBytes, uint32_t lastByte,
                     bool sawSentence, uint32_t lastSentence) {
  const char* gpsStatus = !sawBytes || uint32_t(now-lastByte)>=3000 ? "NO UART DATA (check power/wiring/baud)" :
    !sawSentence || uint32_t(now-lastSentence)>=3000 ? "NO VALID NMEA (check baud/signal)" :
    !gps.location.isValid() || gps.location.age()>=3000 ? "RECEIVING; WAITING FOR FIX (check sky view)" :
    hasFix ? "OK; FILTERED FIX" : "RECEIVING; FIX NOT READY (quality/filter warmup)";
  Serial.printf("[STATUS %lu ms] GPS: %s | sats=%ld hdop=%.2f | bytes=%lu checksumErrors=%lu\n",
    (unsigned long)now,gpsStatus,
    gps.satellites.isValid() && gps.satellites.age()<3000 ? (long)gps.satellites.value() : -1L,
    gps.hdop.isValid() && gps.hdop.age()<3000 ? gps.hdop.hdop() : -1.0,
    (unsigned long)gps.charsProcessed(),(unsigned long)gps.failedChecksum());
  if (imu.healthy && imu.hasSample) {
    Serial.printf("[STATUS %lu ms] %s: OK; reading | motion=%s | accel m/s2=%.2f,%.2f,%.2f\n",
      (unsigned long)now,imu.modelName(),imu.quiet ? "quiet" : imu.dynamic ? "dynamic" : "settling",imu.ax,imu.ay,imu.az);
    Serial.printf("[RAW %lu ms] %s: accel counts X=%d Y=%d Z=%d | gyro counts X=%d Y=%d Z=%d | temp counts=%d | sample age=%lu ms\n",
      (unsigned long)now,imu.modelName(),int(imu.rawAx),int(imu.rawAy),int(imu.rawAz),
      int(imu.rawGx),int(imu.rawGy),int(imu.rawGz),int(imu.rawTemperature),
      (unsigned long)(now-imu.sampledAt));
  } else if (imu.healthy) {
    Serial.printf("[STATUS %lu ms] %s: initialized; waiting for first sample\n",(unsigned long)now,imu.modelName());
  } else {
    char identity[8];
    if (imu.whoAmI<0) snprintf(identity,sizeof(identity),"unknown");
    else snprintf(identity,sizeof(identity),"0x%02X",unsigned(imu.whoAmI));
    Serial.printf("[STATUS %lu ms] %s: UNAVAILABLE; %s | SDA=%d SCL=%d addr=0x%02X WHO_AM_I=%s reg=0x%02X WireError=%u shortRead=%s | other addr 0x%02X=%s; GPS-only; retry every 5s\n",
      (unsigned long)now,imu.modelName(),imu.status,IMU_SDA_PIN,IMU_SCL_PIN,unsigned(IMU_ADDRESS),identity,
      unsigned(imu.lastRegister),unsigned(imu.wireError),imu.shortRead ? "yes" : "no",
      unsigned(IMU_ADDRESS == 0x68 ? 0x69 : 0x68),imu.alternateResponding ? "ACK (check IMU_ADDRESS/AD0)" : "no ACK");
  }
  Serial.printf("[STATUS %lu ms] A7670E: %s | backend=%s\n",
    (unsigned long)now,lteStatus.load(),backendStatus.load());
  if (TRACKER_USE_WIFI) Serial.printf("[STATUS %lu ms] Wi-Fi: %s\n",(unsigned long)now,wifiStatus.load());
}

// Only the network task owns UART2. Release it before the PPP driver takes over.
String modemQuery(HardwareSerial& uart, const char* command) {
  while (uart.available()) uart.read();
  uart.print(command); uart.print("\r\n");
  String response;
  uint32_t start=millis();
  while (uint32_t(millis()-start)<2000) {
    while (uart.available()) {
      char c=char(uart.read());
      if (response.length()<512) response+=c;
    }
    if (response.indexOf("\r\nOK\r\n")>=0 || response.indexOf("ERROR")>=0) break;
    delay(5);
  }
  String printable=response;
  printable.replace("\r"," "); printable.replace("\n"," "); printable.trim();
  Serial.printf("[MODEM] %s -> %s\n",command,printable.length() ? printable.c_str() : "NO RESPONSE");
  return response;
}

bool checkModemSim() {
  static bool pinAttempted=false;
  HardwareSerial uart(2);
  uart.begin(TRACKER_MODEM_BAUD,SERIAL_8N1,MODEM_RX_PIN,MODEM_TX_PIN);
  bool responds=false;
  for (int attempt=0;attempt<3 && !responds;attempt++) responds=modemQuery(uart,"AT").indexOf("OK")>=0;
  bool ready=false;
  if (!responds) {
    lteStatus.store("NO AT RESPONSE (check power/PWRKEY/UART/baud)");
  } else {
    modemQuery(uart,"ATE0");
    modemQuery(uart,"AT+CGMM");
    String sim=modemQuery(uart,"AT+CPIN?");
    ready=sim.indexOf("READY")>=0;
    if (sim.indexOf("SIM PIN")>=0) {
      if (!strlen(SIM_PIN)) lteStatus.store("SIM LOCKED; SIM_PIN required");
      else if (pinAttempted) lteStatus.store("SIM STILL LOCKED; verify PIN before reboot (no repeat attempts)");
      else { pinAttempted=true; ready=true; }
    } else if (!ready) lteStatus.store("SIM NOT READY (see CPIN; check active slot/card/PUK)");
    modemQuery(uart,"AT+CSQ");
    modemQuery(uart,"AT+CEREG?");
    modemQuery(uart,"AT+CGATT?");
    // Read-only capability probe. ERROR means this firmware lacks the command.
    modemQuery(uart,"AT+DUALSIM?");
    Serial.println("LTE: using the board's currently selected SIM; no automatic slot switching.");
  }
  uart.end();
  return ready;
}

void logCellularRegistration() {
  for (const char* command : {"AT+CPIN?","AT+CSQ","AT+CEREG?","AT+CGATT?"}) {
    String response;
    bool ok=PPP.cmd(command,response,1500);
    response.replace("\r"," "); response.replace("\n"," "); response.trim();
    Serial.printf("[MODEM] %s -> %s (%s)\n",command,response.c_str(),ok ? "OK" : "failed/unsupported");
  }
}

void connectCellular() {
  lteStatus.store("CHECKING MODEM AND SIM");
  // Return an existing data session to command mode before releasing UART2.
  if (PPP.handle() && !PPP.mode(ESP_MODEM_MODE_COMMAND)) {
    lteStatus.store("CANNOT EXIT DATA MODE; check modem power/restart"); return;
  }
  PPP.end();
  if (!checkModemSim()) return;
  if (!strlen(SIM_APN)) { lteStatus.store("SIM_APN IS EMPTY"); return; }
  if (!PPP.setApn(SIM_APN) || !PPP.setPin(strlen(SIM_PIN) ? SIM_PIN : nullptr) || !PPP.setPins(MODEM_TX_PIN,MODEM_RX_PIN)) {
    lteStatus.store("MODEM CONFIGURATION FAILED (APN/PIN/UART)"); return;
  }
  lteStatus.store("INITIALIZING PPP DRIVER");
  if (!PPP.begin(PPP_MODEM_GENERIC,2,TRACKER_MODEM_BAUD)) {
    lteStatus.store("MODEM INIT FAILED (see AT diagnostics; check SIM/PIN/UART)"); return;
  }
  lteStatus.store("SIM DETECTED; WAITING FOR NETWORK (up to 90s)");
  uint32_t start=millis(),lastDiagnostic=0;
  bool attached=false;
  while (!(attached=PPP.attached()) && uint32_t(millis()-start)<90000) {
    if (!lastDiagnostic || uint32_t(millis()-lastDiagnostic)>=10000) {
      logCellularRegistration(); lastDiagnostic=millis();
    }
    delay(250);
  }
  if (!attached) {
    lteStatus.store("NOT ATTACHED (check CEREG/CSQ, SIM slot, antenna, coverage/bands)"); return;
  }
  logCellularRegistration();
  lteStatus.store("NETWORK ATTACHED; CONNECTING PPP");
  if (!PPP.mode(ESP_MODEM_MODE_DATA)) {
    lteStatus.store("PPP DIAL FAILED (check APN/data plan/modem support)"); return;
  }
  PPP.waitStatusBits(ESP_NETIF_CONNECTED_BIT,20000);
  if (PPP.connected()) {
    PPP.setDefault();
    lteStatus.store("ONLINE (PPP connected)");
    Serial.printf("LTE: internet link ready; IP=%s\n",PPP.localIP().toString().c_str());
  } else lteStatus.store("PPP IP TIMEOUT (check APN/SIM data plan)");
}

void connectWifi() {
  wifiStatus.store("CONNECTING (up to 20s)");
  WiFi.disconnect();
  WiFi.begin(TRACKER_WIFI_SSID,TRACKER_WIFI_PASSWORD);
  uint32_t start=millis();
  while (WiFi.status()!=WL_CONNECTED && uint32_t(millis()-start)<20000) delay(100);
  if (WiFi.status()==WL_CONNECTED) {
    WiFi.STA.setDefault();
    wifiStatus.store("CONNECTED");
    Serial.printf("Wi-Fi: IP=%s RSSI=%d dBm\n",WiFi.localIP().toString().c_str(),WiFi.RSSI());
  } else {
    wifiStatus.store("FAILED (check 2.4GHz SSID/password/signal)");
    Serial.printf("Wi-Fi: connection failed; status=%d\n",int(WiFi.status()));
  }
}

// Modem and socket stay in this task so GPS and IMU sampling never wait for LTE.
void networkTask(void*) {
  const char* configError=networkConfigError(WS_URL, DEVICE_KEY, ROOT_CA);
  if (configError) {
    backendStatus.store(configError);
    Serial.printf("Backend disabled: %s Transport diagnostics will still run.\n",configError);
  }
  if (TRACKER_USE_WIFI) {
    lteStatus.store("DISABLED (Wi-Fi mode)");
    if (!strlen(TRACKER_WIFI_SSID)) {
      wifiStatus.store("SSID IS EMPTY; set TRACKER_WIFI_SSID in config.h");
      vTaskDelete(nullptr); return;
    }
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
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
      backendStatus.store("ACK RECEIVED (see GPS ack for result)");
      Serial.printf("GPS ack: %s\n",message.data().c_str());
    }
  });
  socket.onEvent([&](websockets::WebsocketsEvent event, String) {
    if (event==websockets::WebsocketsEvent::ConnectionClosed) {
      awaiting=false; backendStatus.store("DISCONNECTED");
    }
  });
  for (;;) {
    uint32_t now=millis();
    bool connected=TRACKER_USE_WIFI ? WiFi.status()==WL_CONNECTED : PPP.connected();
    static bool wasConnected=false;
    if (connected && !wasConnected) {
      if (TRACKER_USE_WIFI) { WiFi.STA.setDefault(); wifiStatus.store("CONNECTED"); }
      else { PPP.setDefault(); lteStatus.store("ONLINE (PPP connected)"); }
    }
    if (wasConnected && !connected) {
      socket.close(); awaiting=false;
      if (TRACKER_USE_WIFI) wifiStatus.store("CONNECTION LOST; retry pending");
      else lteStatus.store("CONNECTION LOST; retry pending");
      if (!configError) backendStatus.store("WAITING FOR NETWORK");
    }
    wasConnected=connected;
    if (int32_t(now-retryAt)>=0 && (!connected || (!configError && !socket.available()))) {
      if (!connected) {
        if (!configError) backendStatus.store("WAITING FOR NETWORK");
        if (TRACKER_USE_WIFI) connectWifi(); else connectCellular();
        connected=TRACKER_USE_WIFI ? WiFi.status()==WL_CONNECTED : PPP.connected();
        wasConnected=connected;
      }
      if (connected && !configError) {
        if (time(nullptr)<1700000000) configTime(0,0,"pool.ntp.org","time.google.com");
        if (time(nullptr)<1700000000) {
          backendStatus.store("WAITING FOR UTC (GPS or NTP)");
          Serial.println("TLS: waiting for UTC from GPS or NTP.");
        } else {
          backendStatus.store("CONNECTING WSS");
          if (socket.connect(WS_URL)) {
            backendStatus.store("WSS CONNECTED");
            Serial.println("WSS: connected to backend."); backoff=2000; awaiting=false;
          } else {
            backendStatus.store("WSS FAILED (check host/TLS/key/proxy)");
            Serial.println("WSS: handshake failed. Check public DNS/reachability, ROOT_CA, device key and proxy WebSocket upgrade. Browser CORS does not apply to this client.");
          }
        }
      }
      retryAt=millis()+backoff+(esp_random()%1000);
      backoff=std::min(uint32_t(60000),backoff*2);
    }
    if (socket.available()) {
      socket.poll();
      if (awaiting && uint32_t(millis()-sentAt)>15000) {
        socket.close(); awaiting=false; backendStatus.store("ACK TIMEOUT; reconnect pending");
        Serial.println("WSS: acknowledgement timed out after 15s.");
      }
      Report report;
      if (!awaiting && socket.available() && xQueueReceive(reports,&report,0)==pdTRUE) {
        // Do not replay stale fixes into a later trip. Latest fresh report wins.
        if (uint32_t(millis()-report.created)<15000 && socket.send(report.json)) {
          awaiting=true; sentAt=millis();
          backendStatus.store("REPORT SENT; WAITING FOR ACK");
        }
      }
    }
    delay(10);
  }
}

void setup() {
  Serial.begin(115200);
  Serial.printf("Internet transport: %s\n",TRACKER_USE_WIFI ? "Wi-Fi (modem disabled)" : "cellular");
  Serial.println("Tracker diagnostics: GPS, MPU6500/MPU9250 and A7670E status every 5s; -1 means unavailable.");
  gpsSerial.setRxBufferSize(4096);
  gpsSerial.begin(GPS_BAUD,SERIAL_8N1,GPS_RX_PIN,GPS_TX_PIN);
  Wire.begin(IMU_SDA_PIN,IMU_SCL_PIN); Wire.setTimeOut(20);
  bool imuReady=imu.begin(IMU_ADDRESS);
  Serial.printf("%s: %s\n",imu.modelName(),imuReady ? "ready" : imu.status);
  reports=xQueueCreate(1,sizeof(Report));
  if (!reports || xTaskCreate(networkTask,"network",12288,nullptr,1,nullptr)!=pdPASS) {
    Serial.println("Cannot allocate network task"); while(true) delay(1000);
  }
}

void loop() {
  static bool sawBytes=false,sawSentence=false;
  static uint32_t lastByte=0,lastSentence=0,lastStatus=0;
  while (gpsSerial.available()) {
    sawBytes=true; lastByte=millis();
    if (gps.encode(gpsSerial.read())) { sawSentence=true; lastSentence=lastByte; }
  }
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
  if (uint32_t(now-lastStatus)>=STATUS_INTERVAL_MS) {
    lastStatus=now;
    logModuleStatus(now,hasFix,sawBytes,lastByte,sawSentence,lastSentence);
  }
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
