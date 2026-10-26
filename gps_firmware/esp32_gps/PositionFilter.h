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
  unsigned good=0,quietSamples=0;
  bool candidate=false;
  double candidateLat=0,candidateLng=0;
  uint32_t candidateTime=0;
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
  bool reject(const char* reason) { status=reason; good=0; quietSamples=0; candidate=false; return false; }
  bool update(double latitude,double longitude,double hdop,unsigned satellites,
              double speed,bool stationary,bool dynamic,uint32_t now) {
    if (!std::isfinite(latitude) || !std::isfinite(longitude) || std::fabs(latitude)>90 || std::fabs(longitude)>180)
      return reject("invalid coordinates");
    // NaN/zero ancillary values denote unavailable metadata, not a lost location.
    if ((satellites>0 && satellites<3) || (std::isfinite(hdop) && (hdop<0 || hdop>10)))
      return reject("poor GPS quality");
    const bool speedKnown=std::isfinite(speed);
    if (speedKnown && (speed<0 || speed>300)) return reject("invalid speed");
    const double accuracy=std::isfinite(hdop) && hdop>0 ? std::max(5.0,hdop*5) : 25;
    const double r=accuracy*accuracy;
    const double dt=double(uint32_t(now-time))/1000;
    if (initialized && dt<=0) return reject("duplicate sample time");
    if (initialized && dt>30) {
      const double elapsed=double(uint32_t(now-candidateTime))/1000;
      if (!candidate || elapsed<=0 || elapsed>10 || distance(candidateLat,candidateLng,latitude,longitude)>55*elapsed+2*accuracy) {
        candidate=true; candidateLat=latitude; candidateLng=longitude; candidateTime=now;
        quietSamples=0; status="confirming reacquired fix"; return false;
      }
      initialized=false;
    }
    if (!initialized) {
      lat=latitude; lng=longitude; variance=r; time=now; initialized=true;
      candidate=false; good=1; status="GPS fix acquired"; return true;
    }
    const double displacement=distance(lat,lng,latitude,longitude);
    // A spike never modifies the accepted state or becomes a raw fallback.
    if (displacement>55*dt+3*std::sqrt(variance+r)) return reject("GPS jump rejected");
    if (stationary && !dynamic && speedKnown && speed<2) quietSamples=std::min(quietSamples+1,3u);
    else quietSamples=0;
    const double holdRadius=std::min(15.0,std::max(8.0,accuracy*1.5));
    if (quietSamples>=3 && displacement<holdRadius) {
      time=now; candidate=false; status="stationary drift held"; return true;
    }
    const double process=std::pow(std::max(2.0,(speedKnown ? speed : 18)/3.6),2)*dt*(dynamic ? 2 : 1);
    const double predicted=variance+process;
    const double gain=predicted/(predicted+r);
    lat+=gain*(latitude-lat);
    lng+=gain*longitudeDelta(longitude,lng);
    if (lng>180) lng-=360; if (lng< -180) lng+=360;
    variance=std::max(1.0,(1-gain)*predicted); time=now;
    candidate=false; good=std::min(good+1,3u); status="GPS fix smoothed"; return true;
  }
};
