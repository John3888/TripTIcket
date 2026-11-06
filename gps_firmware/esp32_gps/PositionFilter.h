#pragma once
#include <cmath>
#include <cstdint>
#include <algorithm>

// Position-only Kalman smoothing. MPU motion adjusts confidence; acceleration
// is never integrated into location without a calibrated vehicle frame.
struct PositionFilter {
  double lat=0,lng=0,variance=625;
  uint32_t time=0;
  bool initialized=false;
  unsigned quietSamples=0;
  unsigned movingSamples=0;
  bool held=false;
  double maxSpeedKph=200;
  const char* status="waiting for fix";
  static double longitudeDelta(double to,double from) {
    double delta=std::fmod(to-from+540.0,360.0)-180.0;
    return delta;
  }
  static double distance(double a,double b,double c,double d) {
    constexpr double rad=0.017453292519943295;
    double h=std::pow(std::sin((c-a)*rad/2),2)+std::cos(a*rad)*std::cos(c*rad)*std::pow(std::sin(longitudeDelta(d,b)*rad/2),2);
    return 12742000*std::asin(std::sqrt(std::max(0.0,std::min(1.0,h))));
  }
  bool reject(const char* reason) { status=reason; return false; }
  bool update(double latitude,double longitude,double hdop,unsigned satellites,
              double speed,bool stationary,bool dynamic,uint32_t now) {
    if (!std::isfinite(latitude) || !std::isfinite(longitude) || std::fabs(latitude)>90 || std::fabs(longitude)>180)
      return reject("invalid coordinates");
    if (std::isfinite(hdop) && hdop>4) return reject("poor HDOP; fix withheld");
    if (satellites>0 && satellites<4) return reject("too few satellites; fix withheld");
    if (std::isfinite(speed) && speed>maxSpeedKph) return reject("implausible GPS speed; fix withheld");
    // Quality metadata controls confidence, never acceptance of a receiver-valid fix.
    // MPU motion changes responsiveness without inventing coordinates.
    (void)satellites;
    const bool speedKnown=std::isfinite(speed) && speed>=0 && speed<=300;
    const double accuracy=std::isfinite(hdop) && hdop>0 ? std::max(5.0,hdop*5) : 25;
    const double r=accuracy*accuracy;
    const double dt=double(uint32_t(now-time))/1000;
    if (initialized && dt<=0) return reject("duplicate sample time");
    if (!initialized || dt>30) {
      lat=latitude; lng=longitude; variance=r; time=now; initialized=true;
      quietSamples=0;
      movingSamples=0; held=false;
      status="GPS fix acquired"; return true;
    }
    const bool quiet=!dynamic && (stationary ? !speedKnown || speed<2.5 : speedKnown && speed<0.8);
    quietSamples=quiet ? std::min(quietSamples+1,3u) : 0;
    const double displacement=distance(lat,lng,latitude,longitude);
    if (!held && displacement>55*dt+3*std::sqrt(variance+r)) return reject("GPS jump withheld");
    if (held) {
      const bool moving=speedKnown ? speed>=2.5 && displacement>=8 : dynamic && displacement>=20;
      movingSamples=moving ? std::min(movingSamples+1,3u) : 0;
      if (movingSamples<3) { time=now; status="stationary GPS drift held"; return true; }
      held=false; movingSamples=0; quietSamples=0;
    }
    if (quietSamples>=3) {
      held=true;
      time=now; status="stationary GPS drift held"; return true;
    }
    const double process=std::pow(std::max(quiet ? 0.2 : 1.0,(speedKnown ? speed : 10)/3.6),2)*dt*(dynamic ? 1.5 : quiet ? 0.1 : 1.0);
    const double predicted=variance+process;
    const double allowance=std::max(15.0,3*std::sqrt(predicted+r))+(speedKnown ? speed/3.6*dt : 0);
    const double measurement=r*std::max(1.0,std::pow(displacement/allowance,2));
    const double gain=predicted/(predicted+measurement);
    lat+=gain*(latitude-lat);
    lng+=gain*longitudeDelta(longitude,lng);
    if (lng>180) lng-=360; if (lng< -180) lng+=360;
    variance=std::max(1.0,(1-gain)*predicted); time=now;
    status="GPS fix smoothed"; return true;
  }
};
