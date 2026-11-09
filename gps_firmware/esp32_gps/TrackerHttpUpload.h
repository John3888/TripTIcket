 #pragma once
// Decode HTTP framing through HTTPClient and cap the acknowledgement in memory.
class HttpReplyBuffer : public Stream {
public:
  char data[2048]{};
  size_t used=0;
  size_t write(uint8_t value) override {
    if (used>=sizeof(data)-1) return 0;
    data[used++]=char(value); data[used]=0; return 1;
  }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
};

bool postReport(const Report& report) {
  xQueueOverwrite(lastOutgoing,&report);
  Serial.printf("[OUTGOING JSON] %s\n",report.json);
  lastPayloadBytes.store(strlen(report.json));
  // Retain the last failure during retries; clear it when an ACK is accepted.
  struct RequestTimer { uint32_t start=millis(); ~RequestTimer() { lastRequestMs.store(millis()-start); } } timer;
  lastHttpCode.store(0); lastTlsCode.store(0);
  String endpoint=apiEndpoint();
  String authority=endpoint.substring(endpoint.indexOf("://")+3);
  authority=authority.substring(0,authority.indexOf('/'));
  String host=authority;
  if (host.startsWith("[")) host=host.substring(1,host.indexOf(']'));
  else if (host.indexOf(':')>=0) host=host.substring(0,host.indexOf(':'));
  time_t clockNow=time(nullptr);
  tm utc{}; gmtime_r(&clockNow,&utc);
  char clockText[32]; strftime(clockText,sizeof(clockText),"%Y-%m-%dT%H:%M:%SZ",&utc);
  Serial.printf("[HTTPS] host=%s UTC=%s freeHeap=%lu minFreeHeap=%lu\n",
    host.c_str(),clockText,(unsigned long)ESP.getFreeHeap(),(unsigned long)ESP.getMinFreeHeap());
  TrackerHttpsClient tls;
  NetworkClient plain;
  NetworkClient& client=TRACKER_USE_HTTPS ? static_cast<NetworkClient&>(tls) : plain;
  static const char* httpProtocols[]={"http/1.1",nullptr};
  tls.setAlpnProtocols(httpProtocols);
  tls.setCACert(ROOT_CA);
  tls.setHandshakeTimeout(30);
  HTTPClient http;
  http.setConnectTimeout(TRACKER_USE_WIFI ? 10000 : 30000);
  http.setTimeout(15000);
  http.setReuse(false);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(client,endpoint)) {
    backendStatus.store("HTTPS INITIALIZATION FAILED"); return false;
  }
  http.addHeader("Content-Type","application/json");
  http.addHeader("Accept","application/json");
  http.addHeader("x-emb-gps-key",DEVICE_KEY);
  backendStatus.store("CONNECTING / SENDING POSITION POST");
  int code=http.POST(String(report.json));
  lastHttpCode.store(code);
  Serial.printf("[HTTP] POST /api/gps/position -> %d\n",code);
  bool accepted=false;
  if (code<=0) {
    char tlsError[192]{};
    int tlsCode=TRACKER_USE_HTTPS ? tls.lastError(tlsError,sizeof(tlsError)) : 0;
    lastTlsCode.store(tlsCode);
    backendStatus.store(tlsCode==-1 ? "TCP/SOCKET FAILED (check network.error)" :
      tlsCode==MBEDTLS_ERR_SSL_CONN_EOF ? "TLS PEER CLOSED CONNECTION (server/proxy/network)" :
      tlsCode<0 ? "TLS/TCP FAILED (see HTTPS error and UTC)" : "HTTP TRANSPORT FAILED (see HTTP code)");
    Serial.printf("[HTTP] %s\n",HTTPClient::errorToString(code).c_str());
    Serial.printf("[HTTPS] TLS code=%d detail=%s\n",tlsCode,tlsCode ? tlsError : "no TLS error reported; inspect HTTP code/network");
    rememberNetworkDetail(tls.connectionDetail.length() ? tls.connectionDetail.c_str() :
      tlsCode ? tlsError : HTTPClient::errorToString(code).c_str());
  } else if (code<200 || code>=300) {
    backendStatus.store(code==401 || code==403 ? "HTTP AUTHORIZATION FAILED (device key/registration)" :
      code==404 ? "HTTP 404 (check backend URL/proxy route)" :
      code==400 || code==422 ? "HTTP PAYLOAD REJECTED" :
      code>=300 && code<400 ? "HTTP REDIRECT (configure final HTTPS API URL)" : "HTTP SERVER/REQUEST ERROR (see code)");
    HttpReplyBuffer reply;
    JsonDocument errorBody;
    if (http.writeToStream(&reply)>=0 && deserializeJson(errorBody,reply.data,reply.used)==DeserializationError::Ok) {
      const char* error=errorBody["error"] | "HTTP request rejected";
      rememberNetworkDetail(error); Serial.printf("[HTTP ERROR] %.240s\n",error);
    } else rememberNetworkDetail(backendStatus.load());
  } else {
    HttpReplyBuffer reply;
    int readResult=http.writeToStream(&reply);
    JsonDocument ack;
    if (readResult<0 || deserializeJson(ack,reply.data,reply.used) != DeserializationError::Ok ||
        !ack["ok"].is<bool>() || !ack["recorded"].is<bool>()) {
      backendStatus.store("INVALID/INCOMPLETE HTTP ACK (check API route)");
      Serial.println("[HTTP] Expected a JSON acknowledgement with ok and recorded fields.");
    } else {
      accepted=ack["ok"].as<bool>();
      backendStatus.store(!accepted ? "SERVER REJECTED REPORT" :
        ack["recorded"].as<bool>() ? "UPLOAD OK; POSITION RECORDED" : "UPLOAD OK; NOT RECORDED (see reason)");
      Serial.printf("[HTTP] ok=%s recorded=%s reason=%s\n",
        accepted ? "true" : "false",ack["recorded"].as<bool>() ? "true" : "false",
        ack["reason"] | "none");
      rememberNetworkDetail(ack["reason"] | "");
    }
  }
  http.end();
  return accepted;
}

