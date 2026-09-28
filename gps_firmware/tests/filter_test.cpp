#include "../esp32_gps/PositionFilter.h"
#include "../esp32_gps/NetworkConfig.h"
#include <cassert>
#include <cstdio>
#include <limits>

int main() {
  const char* testCa = "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----";
  assert(networkConfigError("https://YOUR_BACKEND_HOST/api/gps/position", "key", testCa));
  assert(networkConfigError("https://example.com/api/gps/wrong", "key", testCa));
  assert(networkConfigError("ws://example.com/api/gps/position", "key", testCa));
  assert(networkConfigError("wss://example.com/api/gps/position", "key", testCa));
  assert(networkConfigError("http://example.com/api/gps/position", "key", testCa));
  assert(networkConfigError("https:///api/gps/position", "key", testCa));
  assert(networkConfigError("https://example.com/api/gps/position", "", testCa));
  assert(networkConfigError("https://example.com/api/gps/position", "key", ""));
  assert(!networkConfigError("https://example.com/api/gps/position", "key", testCa));
  PositionFilter f;
  assert(!f.update(10,122,1,8,0,true,false,1000));
  assert(!f.update(10,122,1,8,0,true,false,2000));
  assert(f.update(10,122,1,8,0,true,false,3000));
  for (uint32_t t=4000;t<=100000;t+=1000) {
    double jitter=t%2000 ? 0.00003 : -0.00003;
    assert(f.update(10+jitter,122,1,8,0,true,false,t));
    assert(f.lat==10 && f.lng==122);
  }
  assert(!f.update(11,123,1,8,30,false,false,101000));
  assert(f.lat==10 && f.lng==122);
  assert(!f.update(10,122,9,8,0,true,false,102000));
  assert(!f.update(10,122,1,8,0,true,false,103000));
  assert(!f.update(10,122,1,8,0,true,false,104000));
  assert(f.update(10,122,1,8,0,true,false,105000));
  assert(!f.update(std::numeric_limits<double>::quiet_NaN(),122,1,8,0,true,false,106000));
  assert(!f.update(10,122,1,3,0,true,false,107000));

  // A straight 36km/h drive follows displacement without holding the stationary state.
  PositionFilter moving;
  for (uint32_t i=1;i<=120;i++) {
    double target=10+i*10/111320.0;
    bool accepted=moving.update(target,122,1,8,36,false,false,i*1000);
    if (i>=3) {
      assert(accepted);
      assert(PositionFilter::distance(target,122,moving.lat,moving.lng)<5);
    }
  }
  PositionFilter calm=moving, dynamic=moving;
  double target=moving.lat+0.0001;
  assert(calm.update(target,122,1,8,36,false,false,121000));
  assert(dynamic.update(target,122,1,8,36,false,true,121000));
  assert(dynamic.lat>calm.lat); // Higher process noise follows maneuvers sooner.
  assert(moving.update(12,123,1,8,36,false,false,200000));
  assert(moving.lat==12); // Reacquire after a long outage; no inertial invention.

  PositionFilter wrap;
  wrap.initialized=true; wrap.good=3; wrap.lat=10; wrap.lng=122;
  wrap.time=UINT32_MAX-500;
  assert(wrap.update(10,122,1,8,0,true,false,499));
  puts("Firmware filter: stationary jitter, motion, outlier, quality, recovery, dynamics and millis wrap passed.");
}
