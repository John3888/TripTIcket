#pragma once
#include <WebServer.h>
#include <esp_system.h>

struct DiagnosticSnapshot { char json[4096]; };
struct NetworkDetails { char modem[1000]; char error[240]; };
QueueHandle_t diagnosticSnapshots,networkDetails,lastOutgoing;
std::atomic<uint32_t> lastRequestMs{0},lastPayloadBytes{0};
std::atomic<int> diagnosticHttp{0},wifiRssi{-127};
std::atomic<uint32_t> apJoins{0},apLeaves{0},loopStackFree{0};

const char* diagnosticResetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "Power on";
    case ESP_RST_SW: return "Software restart";
    case ESP_RST_PANIC: return "Firmware panic/crash";
    case ESP_RST_INT_WDT: return "Interrupt watchdog";
    case ESP_RST_TASK_WDT: return "Task watchdog";
    case ESP_RST_WDT: return "Watchdog"; 
    case ESP_RST_BROWNOUT: return "Brownout (supply voltage dropped)";
    case ESP_RST_DEEPSLEEP: return "Deep sleep wake";
    default: return "Other/unknown";
  }
}

void diagnosticWifiEvent(WiFiEvent_t event) {
  if (event==ARDUINO_EVENT_WIFI_AP_STACONNECTED) {
    apJoins.fetch_add(1); Serial.printf("[HOTSPOT %lu ms] Client joined\n",millis());
  } else if (event==ARDUINO_EVENT_WIFI_AP_STADISCONNECTED) {
    apLeaves.fetch_add(1); Serial.printf("[HOTSPOT %lu ms] Client left\n",millis());
  } else if (event==ARDUINO_EVENT_WIFI_AP_STOP) {
    Serial.printf("[HOTSPOT %lu ms] AP stopped\n",millis());
  }
}

void rememberNetworkDetail(const char* text, bool modem=false) {
  NetworkDetails detail{};
  xQueuePeek(networkDetails,&detail,0);
  if (modem) {
    String lines=String(detail.modem)+text+"\n";
    if (lines.length()>=sizeof(detail.modem)) lines=lines.substring(lines.length()-sizeof(detail.modem)+1);
    lines.toCharArray(detail.modem,sizeof(detail.modem));
  } else snprintf(detail.error,sizeof(detail.error),"%s",text);
  xQueueOverwrite(networkDetails,&detail);
}

void captureDiagnostics(uint32_t now,bool hasFix,bool receiving) {
  // Only the Arduino loop writes these buffers. Keep ~6 KB off its small stack.
  static NetworkDetails detail;
  static Report outgoing;
  static DiagnosticSnapshot snapshot;
  JsonDocument doc;
  doc["deviceId"]=DEVICE_ID; doc["uptimeMs"]=now;
  doc["gps"]["status"]=!receiving ? "NO UART DATA" : hasFix ? filter.status : "WAITING FOR USABLE FIX";
  doc["gps"]["hasFix"]=hasFix;
  doc["gps"]["latitude"]=nullptr; doc["gps"]["longitude"]=nullptr; doc["gps"]["speedKph"]=nullptr;
  if (hasFix) { doc["gps"]["latitude"]=filter.lat; doc["gps"]["longitude"]=filter.lng; if (gps.speed.isValid() && gps.speed.age()<5000) doc["gps"]["speedKph"]=gps.speed.kmph(); }
  doc["gps"]["satellites"]=nullptr; doc["gps"]["hdop"]=nullptr;
  if (gps.satellites.isValid() && gps.satellites.age()<3000) doc["gps"]["satellites"]=gps.satellites.value();
  if (gps.hdop.isValid() && gps.hdop.age()<3000) doc["gps"]["hdop"]=gps.hdop.hdop();
  doc["mpu"]["model"]=imu.modelName(); doc["mpu"]["status"]=imu.status;
  doc["mpu"]["healthy"]=imu.healthy; doc["mpu"]["quiet"]=imu.quiet; doc["mpu"]["dynamic"]=imu.dynamic;
  doc["network"]["mode"]=TRACKER_USE_WIFI ? "wifi" : "cellular";
  doc["network"]["gsm"]=lteStatus.load(); doc["network"]["wifi"]=wifiStatus.load();
  doc["network"]["backend"]=backendStatus.load(); doc["network"]["http"]=lastHttpCode.load(); doc["network"]["tls"]=lastTlsCode.load();
  doc["network"]["requestMs"]=lastRequestMs.load(); doc["network"]["payloadBytes"]=lastPayloadBytes.load();
  doc["network"]["diagnosticsHttp"]=diagnosticHttp.load();
  doc["network"]["effectiveUploadBps"]=nullptr;
  if (lastHttpCode.load()>=200 && lastHttpCode.load()<300 && lastRequestMs.load()>0)
    doc["network"]["effectiveUploadBps"]=double(lastPayloadBytes.load())*8000.0/lastRequestMs.load();
  doc["network"]["wifiRssi"]=nullptr;
  if (wifiRssi.load()!=-127) doc["network"]["wifiRssi"]=wifiRssi.load();
  xQueuePeek(networkDetails,&detail,0);
  doc["network"]["modem"]=detail.modem; doc["network"]["error"]=detail.error;
  doc["outgoing"]=nullptr; doc["outgoingUptimeMs"]=nullptr;
  if (xQueuePeek(lastOutgoing,&outgoing,0)==pdTRUE) {
    JsonDocument payload;
    if (deserializeJson(payload,outgoing.json)==DeserializationError::Ok) {
      doc["outgoing"].set(payload.as<JsonVariant>()); doc["outgoingUptimeMs"]=outgoing.created;
    }
  }
  if (measureJson(doc)>=sizeof(snapshot.json)) { Serial.println("[DIAGNOSTICS] Snapshot too large"); return; }
  serializeJson(doc,snapshot.json,sizeof(snapshot.json));
  xQueueOverwrite(diagnosticSnapshots,&snapshot);
  Serial.printf("[DIAGNOSTICS] %s\n",snapshot.json);
  loopStackFree.store(uxTaskGetStackHighWaterMark(nullptr));
}

void diagnosticWebTask(void*) {
  WebServer server(80);
  // This task is the sole reader/writer of its reply buffer.
  static DiagnosticSnapshot snapshot;
  auto allowed=[&]() {
    // This plaintext page is available only through the password-protected AP.
    IPAddress remote=server.client().remoteIP(),ap=WiFi.softAPIP();
    if (remote[0]!=ap[0] || remote[1]!=ap[1] || remote[2]!=ap[2]) { server.send(403,"text/plain","Connect to the tracker hotspot."); return false; }
    if (!server.authenticate("admin",TRACKER_DEBUG_AP_PASSWORD)) { server.requestAuthentication(); return false; }
    server.sendHeader("Cache-Control","no-store"); return true;
  };
  server.on("/",[&]() {
    if (!allowed()) return;
    server.send(200,"text/html",R"HTML(<!doctype html>
<meta name="viewport" content="width=device-width"><title>Tracker diagnostics</title>
<style>body{font:16px system-ui;margin:24px;background:#102030;color:#eef}pre{white-space:pre-wrap;overflow-wrap:anywhere}.notice{padding:16px;background:#243c50;border-radius:8px}</style>
<h1>Tracker diagnostics</h1>
<p class="notice">This hotspot provides local logs without internet. On your phone choose <strong>Stay connected / Use this network anyway</strong>. If it switches away, disable automatic switching to mobile data or another Wi-Fi network for this test. Open <strong>http://192.168.4.1</strong> in your normal browser, not the Wi-Fi sign-in window.</p>
<p>Updates every 10 seconds. GPS/MPU/GSM status and last outgoing JSON. Upload duration is not a speed test.</p>
<p id="state" role="status">Loading...</p><details><summary>Device and hotspot health</summary><pre id="health"></pre></details><pre id="log"></pre>
<script>
let history=[],lastUptime=null;
async function read(path){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  try{const r=await fetch(path,{signal:controller.signal,cache:'no-store'});
    if(!r.ok)throw Error(r.status===503?'Waiting for first snapshot':r.status===401?'Login required':'HTTP '+r.status);
    return await r.json();
  }finally{clearTimeout(timer);}
}
async function poll(){
  try{
    const h=await read('/health');
    const restarted=lastUptime!==null&&h.uptimeMs<lastUptime;
    if(restarted)history=[];
    lastUptime=h.uptimeMs;
    document.getElementById('health').textContent=JSON.stringify(h,null,2);
    const x=await read('/status');
    if(history[0]?.uptimeMs!==x.uptimeMs)history.unshift(x);
    history=history.slice(0,30);
    document.getElementById('log').textContent=history.map(v=>JSON.stringify(v,null,2)).join('\n\n');
    const stale=h.uptimeMs-x.uptimeMs>30000;
    document.getElementById('state').textContent=(restarted?'Device restarted. ':stale?'Snapshot is stale. ':'Connected. ')+
      'Firmware '+h.firmware+' ('+h.protocol+'). Device uptime '+Math.floor(h.uptimeMs/1000)+'s. Last boot: '+h.resetReason+'. Fetched '+new Date().toLocaleTimeString();
  }catch(e){document.getElementById('state').textContent='Logs unavailable: '+(e.name==='AbortError'?'connection timed out':e.message)+
    '. Check you are still connected to the TripTicket hotspot. Retrying automatically; displayed logs may be old.';}
  setTimeout(poll,10000);
}
poll();
</script>)HTML");
  });
  server.on("/status",[&]() {
    if (!allowed()) return;
    if (xQueuePeek(diagnosticSnapshots,&snapshot,0)!=pdTRUE) { server.send(503,"application/json","{}"); return; }
    server.send(200,"application/json",snapshot.json);
  });
  server.on("/health",[&]() {
    if (!allowed()) return;
    JsonDocument health;
    health["firmware"]=FIRMWARE_VERSION; health["endpoint"]=apiEndpoint();
    health["protocol"]=TRACKER_USE_HTTPS ? "HTTPS" : "HTTP";
    // Filter status is in the loop's snapshot; do not read mutable filter state here.
    health["transport"]=TRACKER_USE_WIFI ? "wifi" : "cellular";
    health["uptimeMs"]=millis(); health["resetReason"]=diagnosticResetReason();
    health["freeHeapBytes"]=ESP.getFreeHeap(); health["minimumFreeHeapBytes"]=ESP.getMinFreeHeap();
    health["webStackMinimumFreeBytes"]=uxTaskGetStackHighWaterMark(nullptr);
    health["loopStackMinimumFreeBytes"]=loopStackFree.load();
    health["hotspotClients"]=WiFi.softAPgetStationNum();
    health["clientJoins"]=apJoins.load(); health["clientLeaves"]=apLeaves.load();
    String body; serializeJson(health,body); server.send(200,"application/json",body);
  });
  server.begin();
  for (;;) { server.handleClient(); delay(5); }
}

void uploadDiagnostics() {
  // Network task only; TLS also needs stack space while this buffer is in use.
  static DiagnosticSnapshot snapshot;
  if (xQueuePeek(diagnosticSnapshots,&snapshot,0)!=pdTRUE) return;
  String url=apiEndpoint(); url=url.substring(0,url.lastIndexOf('/'))+"/diagnostics";
  TrackerHttpsClient tls; tls.setCACert(ROOT_CA); tls.setHandshakeTimeout(30);
  static const char* protocols[]={"http/1.1",nullptr}; tls.setAlpnProtocols(protocols);
  NetworkClient plain;
  NetworkClient& client=TRACKER_USE_HTTPS ? static_cast<NetworkClient&>(tls) : plain;
  HTTPClient http; http.setConnectTimeout(TRACKER_USE_WIFI ? 10000 : 30000); http.setTimeout(15000); http.setReuse(false);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(client,url)) return;
  http.addHeader("Content-Type","application/json"); http.addHeader("x-emb-gps-key",DEVICE_KEY);
  int code=http.POST(String(snapshot.json)); diagnosticHttp.store(code);
  Serial.printf("[REMOTE LOG] HTTP=%d (200=received; 404=deploy diagnostics endpoint)\n",code);
  http.end();
}
