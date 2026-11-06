#include "../esp32_gps/PositionFilter.h"
#include "../esp32_gps/NetworkConfig.h"
#include "../esp32_gps/GpsNmeaCapture.h"
#include "../esp32_gps/UbloxQuality.h"
#include <cassert>
#include <cstdio>
#include <limits>
int main() {
  const char* ca="-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----";
  assert(!networkConfigError("http://192.168.1.2:5001/api/gps/position","key","",false));
  assert(!networkConfigError("https://example.com/api/gps/position","key",ca,true));
  assert(networkConfigError("https://example.com/api/gps/position","key","",true));
  assert(networkConfigError("http://example.com/api/gps/position","key",ca,true));
  assert(networkConfigError("https://example.com/api/gps/position","key",ca,false));
  assert(networkConfigError("ws://example.com/api/gps/position","key",ca,false));
  assert(networkConfigError("http:///api/gps/position","key","",false));
  assert(networkConfigError("http://example.com/api/gps/wrong","key","",false));
  assert(networkConfigError("http://example.com/api/gps/position","","",false));
  PositionFilter f;
  assert(f.update(10,122,1,8,0,true,false,1000));
  double jitter=10+0.00003;
  assert(f.update(jitter,122,1,8,0,true,false,2000));
  assert(f.lat>10 && f.lat<jitter); // Smooth jitter rather than hard-holding.
  assert(!f.update(11,123,1,8,30,false,false,3000));
  assert(!f.update(NAN,122,1,8,0,true,false,4000));
  assert(!f.update(10,122,11,2,0,true,false,5000));
  assert(!f.update(10,122,1,8,301,true,false,6000));
  PositionFilter unknown;
  assert(unknown.update(10,122,NAN,0,NAN,false,false,1000));
  assert(unknown.update(10.00002,122,NAN,0,NAN,false,false,2000));
  assert(unknown.lat>10);
  PositionFilter moving;
  for(unsigned i=1;i<=120;i++) {
    double target=10+i*10/111320.0;
    assert(moving.update(target,122,1,8,36,false,false,i*1000));
    assert(PositionFilter::distance(target,122,moving.lat,moving.lng)<5);
  }
  PositionFilter calm=moving,dynamic=moving;
  assert(calm.update(moving.lat+0.0001,122,1,8,36,false,false,121000));
  assert(dynamic.update(moving.lat+0.0001,122,1,8,36,false,true,121000));
  assert(dynamic.lat>calm.lat);
  assert(moving.update(12,123,1,8,36,false,false,200000));
  assert(moving.lat==12);
  assert(moving.update(12.00001,123,1,8,36,false,false,201000));
  assert(moving.lat>12 && moving.lat<12.00001);
  assert(!moving.update(12.00001,123,1,8,36,false,false,201000));
  PositionFilter slow;
  for(unsigned i=1;i<=30;i++) assert(slow.update(10+i*0.000002,122,1,8,1,false,false,i*1000));
  assert(slow.lat>10.00004); // Slow travel without a quiet MPU is not frozen.
  PositionFilter wrap;
  assert(wrap.update(10,122,1,8,0,true,false,UINT32_MAX-500));
  assert(wrap.update(10,122,1,8,0,true,false,499));
  PositionFilter dateLine;
  assert(dateLine.update(0,179.9999,1,8,36,false,false,1000));
  assert(dateLine.update(0,-179.9999,1,8,36,false,false,2000));
  assert(std::fabs(dateLine.lng)>179.99);
  PositionFilter stopped;
  assert(stopped.update(10,122,1,12,0,true,false,1000));
  for (unsigned i=2;i<=4;i++) assert(stopped.update(10,122,1,12,0,true,false,i*1000));
  for (unsigned i=5;i<=120;i++) {
    assert(stopped.update(10+std::sin(double(i))*0.0015,122,1,12,0.2,true,false,i*1000));
    assert(stopped.lat==10);
  }
  assert(stopped.update(10.0001,122,1,12,5,false,true,121000));
  assert(stopped.lat==10);
  assert(stopped.update(10.00012,122,1,12,5,false,true,122000));
  assert(stopped.lat==10);
  assert(stopped.update(10.00014,122,1,12,5,false,true,123000));
  assert(stopped.lat>10);
  PositionFilter spike;
  assert(spike.update(10,122,1,12,5,false,false,1000));
  assert(!spike.update(11,123,1,12,5,false,true,2000));
  assert(PositionFilter::distance(10,122,spike.lat,spike.lng)<1);
  PositionFilter walking;
  walking.maxSpeedKph=10;
  assert(!walking.update(10,122,1,12,37.7,false,true,1000));
  assert(walking.update(10,122,1,12,5,false,true,2000));
  GpsNmeaCapture capture;
  const char* nmea="$GNRMC,123519,A,4807.038,N,01131.000,E,20.37,0,061126,,,A*00\r\n";
  for (const char* p=nmea;*p;p++) capture.push(*p);
  assert(std::strstr(capture.rmc,"20.37"));
  for (unsigned i=0;i<200;i++) capture.push('x');
  capture.push('\n');
  for (const char* p=nmea;*p;p++) capture.push(*p);
  assert(std::strlen(capture.rmc)<128);
  UbloxQuality ubx;
  uint8_t pvt[92]{};
  auto put=[&](unsigned at,uint32_t value) { for (unsigned i=0;i<4;i++) pvt[at+i]=uint8_t(value>>(8*i)); };
  pvt[4]=uint8_t(2026); pvt[5]=uint8_t(2026>>8); pvt[6]=11; pvt[7]=6;
  pvt[8]=12; pvt[9]=34; pvt[10]=56; pvt[11]=3; pvt[20]=3; pvt[21]=1; pvt[23]=12;
  put(24,1220000000); put(28,100000000); put(40,1500); put(60,10000); put(68,200);
  auto feed=[&](bool corrupt) {
    uint8_t frame[100]{0xB5,0x62,1,7,92,0}; std::memcpy(frame+6,pvt,sizeof(pvt));
    uint8_t a=0,b=0; for (unsigned i=2;i<98;i++) { a=uint8_t(a+frame[i]); b=uint8_t(b+a); }
    frame[98]=a; frame[99]=corrupt ? uint8_t(b^1) : b;
    for (uint8_t c:frame) assert(ubx.push(c,2000));
  };
  feed(true); assert(!ubx.seen && ubx.checksumErrors==1);
  feed(false); assert(ubx.frames==1 && ubx.error()==nullptr);
  assert(ubx.latitude==10 && ubx.longitude==122 && ubx.speedKph==36);
  assert(ubx.matches(4000,2026,11,6,12,34,57)); assert(!ubx.fresh(5000));
  put(68,1500); feed(false); assert(ubx.error()!=nullptr);
  assert(!ubx.push('$',2000));
  puts("PASS: HTTP/HTTPS validation, first fix, metadata fallback, jitter smoothing, motion, permissive quality, reacquisition, duplicate time, slow travel, dynamics, millis rollover, longitude wrap.");
}
