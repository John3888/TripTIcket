#line 1 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\MotionSensor.h"
#pragma once
#include <Wire.h>
#include <cmath>

class MotionSensor {
  uint8_t address = 0x68;
  uint32_t quietSince = 0, lastRead = 0;
  bool write(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(address); Wire.write(reg); Wire.write(value);
    return Wire.endTransmission() == 0;
  }
  bool read(uint8_t reg, uint8_t* bytes, uint8_t size) {
    Wire.beginTransmission(address); Wire.write(reg);
    if (Wire.endTransmission(false) != 0 || Wire.requestFrom(address,size) != size) return false;
    for (uint8_t i=0;i<size;i++) bytes[i] = Wire.read();
    return true;
  }
public:
  bool healthy = false, quiet = false, dynamic = false;
  float ax = 0, ay = 0, az = 0;
  bool begin(uint8_t addr) {
    address = addr;
    uint8_t id;
    if (!read(0x75,&id,1) || id != 0x71) return false;
    // ±4g, ±500 deg/s, ~20Hz low-pass, 50Hz sampling.
    healthy = write(0x6B,0x01) && write(0x1A,0x04) && write(0x19,19) &&
              write(0x1B,0x08) && write(0x1C,0x08) && write(0x1D,0x04);
    return healthy;
  }
  void sample(uint32_t now) {
    if (uint32_t(now-lastRead)<20) return;
    lastRead=now;
    uint8_t bytes[14];
    if (!read(0x3B,bytes,14)) { healthy=false; quiet=false; quietSince=0; return; }
    healthy=true;
    auto word = [&](int i) { return int16_t((uint16_t(bytes[i])<<8)|bytes[i+1]); };
    ax=word(0)*9.80665f/8192; ay=word(2)*9.80665f/8192; az=word(4)*9.80665f/8192;
    float gx=word(8)/65.5f, gy=word(10)/65.5f, gz=word(12)/65.5f;
    float acceleration=fabs(sqrt(ax*ax+ay*ay+az*az)-9.80665f);
    float rotation=sqrt(gx*gx+gy*gy+gz*gz);
    dynamic=acceleration>0.5f || rotation>5;
    if (acceleration<0.18f && rotation<1.5f) {
      if (!quietSince) quietSince=now;
      quiet=uint32_t(now-quietSince)>5000;
    } else { quietSince=0; quiet=false; }
  }
};
