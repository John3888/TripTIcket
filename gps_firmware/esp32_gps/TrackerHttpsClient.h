#pragma once
#include <lwip/netdb.h>

// HTTPClient calls this hostname overload. Keep the hostname for SNI and
// certificate verification, while preferring IPv4 on an IPv4 PPP connection.
class TrackerHttpsClient : public NetworkClientSecure {
public:
  String connectionDetail;
  using NetworkClientSecure::connect;

  int connect(const char* host, uint16_t port) override {
    return connect(host,port,TRACKER_USE_WIFI ? 10000 : 30000);
  }

  int connect(const char* host, uint16_t port, int32_t timeout) override {
    connectionDetail="";
    bool routed=TRACKER_USE_WIFI ? WiFi.STA.setDefault() : PPP.setDefault();
    if (!routed) { connectionDetail="Cannot select internet interface as default route"; return 0; }
    IPAddress address;
    if (!TRACKER_USE_WIFI && PPP.hasIP()) {
      addrinfo hints{},*result=nullptr;
      hints.ai_family=AF_INET; hints.ai_socktype=SOCK_STREAM;
      int error=lwip_getaddrinfo(host,nullptr,&hints,&result);
      if (error!=0 || !result) {
        if (result) lwip_freeaddrinfo(result);
        connectionDetail="IPv4 DNS lookup failed for "+String(host)+" ("+String(error)+")";
        return 0;
      }
      address=IPAddress(reinterpret_cast<sockaddr_in*>(result->ai_addr)->sin_addr.s_addr);
      lwip_freeaddrinfo(result);
    } else if (!Network.hostByName(host,address)) {
      connectionDetail="DNS lookup failed for "+String(host); return 0;
    }
    String local=(TRACKER_USE_WIFI ? WiFi.localIP() : PPP.localIP()).toString();
    String target=address.toString()+":"+String(port);
    Serial.printf("[CONNECT] %s -> %s (%s); timeout=%ld ms\n",local.c_str(),target.c_str(),host,long(timeout));
    _timeout=timeout;
    uint32_t started=millis();
    int ok=NetworkClientSecure::connect(address,port,host,ROOT_CA,nullptr,nullptr);
    uint32_t elapsed=millis()-started;
    if (!ok) {
      char detail[120]{}; int code=lastError(detail,sizeof(detail));
      connectionDetail=String(code==-1 ? "TCP/socket setup failed" : "TLS failed")+
        "; local="+local+" target="+target+" elapsed="+String(elapsed)+"ms code="+String(code)+" "+detail;
      Serial.println(connectionDetail);
    }
    return ok;
  }
};
