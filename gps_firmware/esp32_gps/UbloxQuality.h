#pragma once
#include <cstdint>

// UBX-NAV-PVT, u-blox M8 protocol: checksum-validated, bounded binary parser.
// Polling reads the current solution; it does not change saved receiver settings.
struct UbloxQuality {
  uint8_t state=0,cls=0,id=0,a=0,b=0,receivedA=0,payload[92]{};
  uint16_t length=0,offset=0;
  uint32_t receivedAt=0,frames=0,checksumErrors=0;
  bool seen=false,fixOk=false,utcValid=false;
  uint8_t fixType=0,satellites=0,hour=0,minute=0,second=0,month=0,day=0;
  uint16_t year=0;
  double latitude=0,longitude=0,horizontalAccuracy=0,speedAccuracy=0,speedKph=0;
  static constexpr uint8_t poll[8]={0xB5,0x62,0x01,0x07,0x00,0x00,0x08,0x19};
  uint32_t u32(unsigned i) const { return uint32_t(payload[i])|(uint32_t(payload[i+1])<<8)|(uint32_t(payload[i+2])<<16)|(uint32_t(payload[i+3])<<24); }
  int32_t i32(unsigned i) const { int64_t v=u32(i); return int32_t(v>=0x80000000LL ? v-0x100000000LL : v); }
  void checksum(uint8_t c) { a=uint8_t(a+c); b=uint8_t(b+a); }
  bool push(uint8_t c,uint32_t now) {
    if (!state) { if (c==0xB5) { state=1; return true; } return false; }
    if (state==1) { if (c==0x62) { state=2; a=b=0; return true; } state=c==0xB5 ? 1 : 0; return state!=0; }
    switch (state) {
      case 2: cls=c; checksum(c); state=3; break;
      case 3: id=c; checksum(c); state=4; break;
      case 4: length=c; checksum(c); state=5; break;
      case 5: length|=uint16_t(c)<<8; checksum(c); offset=0; state=length>512 ? 0 : length ? 6 : 7; break;
      case 6: if (offset<sizeof(payload)) payload[offset]=c; offset++; checksum(c); if (offset>=length) state=7; break;
      case 7: receivedA=c; state=8; break;
      case 8:
        state=0;
        if (receivedA!=a || c!=b) { checksumErrors++; break; }
        if (cls!=1 || id!=7 || length!=92) break;
        seen=true; receivedAt=now; frames++;
        year=uint16_t(payload[4])|(uint16_t(payload[5])<<8); month=payload[6]; day=payload[7];
        hour=payload[8]; minute=payload[9]; second=payload[10]; utcValid=(payload[11]&3)==3;
        fixType=payload[20]; fixOk=(payload[21]&1)!=0; satellites=payload[23];
        longitude=i32(24)*1e-7; latitude=i32(28)*1e-7;
        horizontalAccuracy=u32(40)/1000.0; speedAccuracy=u32(68)/1000.0; speedKph=i32(60)*0.0036;
        break;
    }
    return true;
  }
  bool fresh(uint32_t now) const { return seen && uint32_t(now-receivedAt)<3000; }
  bool matches(uint32_t now,unsigned y,unsigned m,unsigned d,unsigned h,unsigned min,unsigned s) const {
    int delta=int(h*3600+min*60+s)-int(hour*3600+minute*60+second);
    return fresh(now) && utcValid && year==y && month==m && day==d && delta>=-2 && delta<=2;
  }
  const char* error() const {
    if (!fixOk || fixType!=3) return "M8N has no valid 3D fix";
    if (horizontalAccuracy<=0 || horizontalAccuracy>15) return "M8N horizontal uncertainty too large";
    if (speedAccuracy<=0 || speedAccuracy>1) return "M8N speed uncertainty too large";
    return nullptr;
  }
};
