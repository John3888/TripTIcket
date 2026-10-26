#include "../esp32_gps/PositionFilter.h"
#include "../esp32_gps/NetworkConfig.h"
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
  for(unsigned t=2000;t<=5000;t+=1000) assert(f.update(10,122,1,8,0,true,false,t));
  for(unsigned t=6000;t<=100000;t+=1000) {
    assert(f.update(10+(t%2000 ? 0.00003 : -0.00003),122,1,8,0,true,false,t));
    assert(f.lat==10 && f.lng==122);
  }
  assert(!f.update(11,123,1,8,30,false,false,101000));
  assert(f.lat==10 && f.lng==122);
  assert(f.update(10,122,1,8,0,true,false,102000));
  assert(!f.update(NAN,122,1,8,0,true,false,103000));
  assert(!f.update(10,122,11,8,0,true,false,104000));
  assert(!f.update(10,122,1,2,0,true,false,105000));
  assert(!f.update(10,122,1,8,301,true,false,106000));
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
  double previous=moving.lat;
  assert(!moving.update(12,123,1,8,36,false,false,200000));
  assert(moving.lat==previous);
  assert(moving.update(12.00001,123,1,8,36,false,false,201000));
  assert(moving.lat==12.00001);
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
  puts("PASS: HTTP/HTTPS validation, first fix, metadata fallback, stationary drift, motion, outliers, reacquisition, duplicate time, slow travel, dynamics, millis rollover, longitude wrap.");
}
