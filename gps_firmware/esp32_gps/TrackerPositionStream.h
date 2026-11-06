#pragma once
#include <ArduinoWebsockets.h>
#include <memory>

// Reuse verified TLS, PPP IPv4 resolution and SNI from the existing transport.
class TrackerStreamTls : public websockets::network::GenericEspTcpClient<TrackerHttpsClient> {
public:
  TrackerStreamTls() { client.setCACert(ROOT_CA); client.setHandshakeTimeout(30); }
  int error() { char detail[192]{}; return client.lastError(detail,sizeof(detail)); }
  String detail() const { return client.connectionDetail; }
};

class TrackerPositionStream {
  static std::shared_ptr<websockets::network::TcpClient> transport() {
    if (TRACKER_USE_HTTPS) return std::make_shared<TrackerStreamTls>();
    return std::make_shared<websockets::network::GenericEspTcpClient<NetworkClient>>();
  }
  std::shared_ptr<websockets::network::TcpClient> tcp=transport();
  websockets::WebsocketsClient socket{tcp};
  bool ready=false,awaiting=false;
  uint32_t nextConnect=0,backoff=2000,nextSend=0,sentAt=0,lastPeer=0,lastPing=0,lastDiagnostic=0;
  String pendingBody,pendingId;

  void failed(const char* reason) {
    socket.close(); ready=false; awaiting=false; pendingBody="";
    websocketConnected.store(false); backendStatus.store(reason);
    nextConnect=millis()+backoff+(esp_random()%500);
    backoff=std::min(uint32_t(60000),backoff*2);
    rememberNetworkDetail(reason);
  }

  void message(websockets::WebsocketsMessage message) {
    JsonDocument ack;
    if (deserializeJson(ack,message.data())!=DeserializationError::Ok) return;
    lastPeer=millis();
    const char* type=ack["type"] | "";
    if (!strcmp(type,"gps:ready")) { ready=true; nextSend=millis(); return; }
    if (!strcmp(type,"gps:diagnostics:ack")) { diagnosticHttp.store(200); return; }
    if (strcmp(type,"gps:ack") || !awaiting || pendingId!=(ack["requestId"] | "")) return;
    lastRequestMs.store(millis()-sentAt);
    if (!ack["ok"].is<bool>()) { failed("WEBSOCKET INVALID ACK"); return; }
    awaiting=false;
    int status=ack["status"] | 200;
    websocketCode.store(status);
    if (!ack["ok"].as<bool>()) {
      rememberNetworkDetail(ack["error"] | "WebSocket batch rejected");
      if (status==429 || status==409) {
        // Explicit rejection means none were processed: retry the same batch safely.
        uint32_t retry=ack["retryAfterMs"] | 1000u;
        nextSend=millis()+std::max(uint32_t(1100),std::min(uint32_t(10000),retry));
        backendStatus.store("WEBSOCKET RATE LIMITED; RETRY PENDING");
        return;
      }
      pendingBody=""; backendStatus.store("WEBSOCKET BATCH REJECTED"); return;
    }
    if (!ack["results"].is<JsonArray>()) { failed("WEBSOCKET INVALID RESULTS"); return; }
    unsigned recorded=0,errors=0;
    for (JsonObject result : ack["results"].as<JsonArray>()) {
      if (result["recorded"] | false) recorded++;
      if (!(result["ok"] | false)) errors++;
      rememberNetworkDetail(result["reason"] | (result["error"] | ""));
    }
    websocketAcks.fetch_add(1);
    backendStatus.store(errors ? "WEBSOCKET ACK; SOME READINGS REJECTED" :
      recorded ? "WEBSOCKET ACK; POSITIONS RECORDED" : "WEBSOCKET ACK; NO TRIP POINTS (see reason)");
    Serial.printf("[WS ACK] batch=%s recorded=%u errors=%u\n",pendingId.c_str(),recorded,errors);
    pendingBody="";
  }

  void prepareBatch() {
    JsonDocument batch;
    batch["type"]="gps:positions";
    pendingId=String(millis())+"-"+String(esp_random(),HEX);
    batch["requestId"]=pendingId;
    JsonArray samples=batch["reports"].to<JsonArray>();
    Report report;
    for (unsigned i=0;i<16 && xQueueReceive(reports,&report,0)==pdTRUE;i++) {
      if (uint32_t(millis()-report.created)>=15000) continue;
      JsonDocument sample;
      if (deserializeJson(sample,report.json)!=DeserializationError::Ok) continue;
      samples.add(sample.as<JsonObject>());
      xQueueOverwrite(lastOutgoing,&report);
    }
    if (!samples.size()) return;
    serializeJson(batch,pendingBody);
  }

public:
  TrackerPositionStream() {
    socket.addHeader("x-emb-gps-key",DEVICE_KEY);
    socket.addHeader("x-emb-device-id",DEVICE_ID);
    socket.onMessage([this](websockets::WebsocketsMessage value) { message(value); });
    socket.onEvent([this](websockets::WebsocketsEvent event,String) {
      if (event==websockets::WebsocketsEvent::ConnectionOpened) {
        websocketConnected.store(true); lastPeer=millis();
      } else if (event==websockets::WebsocketsEvent::ConnectionClosed) {
        websocketConnected.store(false); ready=false;
      } else lastPeer=millis();
    });
  }

  void tick(bool networkReady) {
    if (!networkReady) {
      if (websocketConnected.load()) socket.close();
      ready=false; awaiting=false; pendingBody=""; websocketConnected.store(false);
      return;
    }
    uint32_t now=millis();
    if (!socket.available()) {
      // An unacknowledged batch may already be committed. Never replay it on reconnect.
      awaiting=false; pendingBody=""; ready=false;
      if (int32_t(now-nextConnect)<0) return;
      nextConnect=now+backoff+(esp_random()%500);
      backoff=std::min(uint32_t(60000),backoff*2);
      bool routed=TRACKER_USE_WIFI ? WiFi.STA.setDefault() : PPP.setDefault();
      if (!routed) { backendStatus.store("WEBSOCKET WAITING FOR INTERNET ROUTE"); return; }
      String endpoint=apiEndpoint();
      String authority=endpoint.substring(endpoint.indexOf("://")+3);
      authority=authority.substring(0,authority.indexOf('/'));
      String host=authority;
      uint16_t port=TRACKER_USE_HTTPS ? 443 : 80;
      if (authority.startsWith("[")) {
        int end=authority.indexOf(']'); host=authority.substring(1,end);
        if (authority.charAt(end+1)==':') port=authority.substring(end+2).toInt();
      } else if (authority.indexOf(':')>=0) {
        int colon=authority.indexOf(':'); host=authority.substring(0,colon); port=authority.substring(colon+1).toInt();
      }
      backendStatus.store("CONNECTING DEVICE WEBSOCKET");
      lastTlsCode.store(0); websocketCode.store(0);
      if (!socket.connect(host,port,"/api/gps/stream")) {
        if (TRACKER_USE_HTTPS) {
          auto tls=std::static_pointer_cast<TrackerStreamTls>(tcp);
          lastTlsCode.store(tls->error()); rememberNetworkDetail(tls->detail().c_str());
        }
        backendStatus.store("WEBSOCKET CONNECT FAILED (TLS/key/device/proxy)");
        nextConnect=millis()+backoff+(esp_random()%500);
        return;
      }
      lastPeer=millis(); lastPing=lastPeer; backoff=2000;
      backendStatus.store("WEBSOCKET CONNECTED; WAITING FOR READY");
    }
    socket.poll(); now=millis();
    if (uint32_t(now-lastPeer)>45000) { failed("WEBSOCKET PEER TIMEOUT"); return; }
    if (awaiting && uint32_t(now-sentAt)>10000) { failed("WEBSOCKET ACK TIMEOUT; BATCH NOT REPLAYED"); return; }
    if (uint32_t(now-lastPing)>=15000) { socket.ping(); lastPing=now; }
    if (!ready || awaiting) return;
    if (int32_t(now-nextSend)>=0) {
      if (!pendingBody.length()) prepareBatch();
      if (pendingBody.length()) {
        lastPayloadBytes.store(pendingBody.length()); sentAt=millis();
        nextSend=sentAt+1100;
        if (!socket.send(pendingBody)) { failed("WEBSOCKET SEND FAILED"); return; }
        awaiting=true;
      }
    }
    if (TRACKER_REMOTE_DIAGNOSTICS && !awaiting && uint32_t(now-lastDiagnostic)>=10000) {
      static DiagnosticSnapshot snapshot;
      if (xQueuePeek(diagnosticSnapshots,&snapshot,0)==pdTRUE) {
        JsonDocument diagnostic,body;
        if (deserializeJson(body,snapshot.json)==DeserializationError::Ok) {
          diagnostic["type"]="gps:diagnostics"; diagnostic["snapshot"]=body.as<JsonObject>();
          String payload; serializeJson(diagnostic,payload); socket.send(payload);
          lastDiagnostic=now;
        }
      }
    }
  }
};
