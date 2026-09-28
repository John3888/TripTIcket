#pragma once
#include <cmath>
#include <cstdint>
#include <algorithm>

// IMU-assisted Kalman position filter. Device-frame acceleration is deliberately
// not integrated into latitude/longitude without calibrated gravity/yaw/mounting.
struct PositionFilter {
  double lat = 0, lng = 0, variance = 625;
  uint32_t time = 0;
  bool initialized = false;
  unsigned good = 0;
  static double distance(double a, double b, double c, double d) {
    constexpr double rad = 0.017453292519943295;
    double h = pow(sin((c-a)*rad/2),2) + cos(a*rad)*cos(c*rad)*pow(sin((d-b)*rad/2),2);
    return 12742000 * asin(sqrt(std::min(1.0, h)));
  }
  bool update(double latitude, double longitude, double hdop, unsigned satellites,
              double speed, bool stationary, bool dynamic, uint32_t now) {
    if (!std::isfinite(latitude) || !std::isfinite(longitude) || !std::isfinite(hdop) ||
        !std::isfinite(speed) || speed < 0 || speed > 198 || fabs(latitude)>90 || fabs(longitude)>180 ||
        satellites < 6 || hdop <= 0 || hdop > 2.5) { good = 0; return false; }
    if (good < 3) ++good;
    if (good < 3) return false;
    const double r = pow(std::max(5.0, hdop*5),2);
    const double dt = double(uint32_t(now-time))/1000;
    if (!initialized || dt > 60) {
      lat = latitude; lng = longitude; variance = r; time = now; initialized = true; return true;
    }
    if (dt <= 0) return false;
    const double displacement = distance(lat,lng,latitude,longitude);
    if (displacement > 55*dt + 3*sqrt(variance+r)) { good = 0; return false; }
    if (stationary && speed < 3 && displacement < std::max(8.0, hdop*7.5)) {
      time = now; return true;
    }
    const double process = pow(std::max(2.0,speed/3.6),2) * dt * (dynamic ? 2 : 1);
    const double predicted = variance+process;
    const double gain = predicted/(predicted+r);
    lat += gain*(latitude-lat); lng += gain*(longitude-lng);
    variance = (1-gain)*predicted; time = now;
    return true;
  }
};
