#line 1 "C:\\Users\\USER\\Projects\\TripTIcket\\gps_firmware\\esp32_gps\\MotionSensor.h"
#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <cmath>

class MotionSensor {
private:
  uint8_t address = 0x68;
  uint32_t quietSince = 0;
  uint32_t lastRead = 0;
  uint32_t lastDebug = 0;
  bool initialized = false;

  static constexpr uint16_t CALIBRATION_SAMPLES = 150;

  static constexpr float ACCEL_ACTIVE = 0.80f;
  static constexpr float ACCEL_IDLE = 0.35f;
  static constexpr float GYRO_ACTIVE = 8.0f;
  static constexpr float GYRO_IDLE = 3.0f;
  static constexpr uint32_t IDLE_DELAY_MS = 3000;

  uint16_t calibrationCount = 0;
  float magnitudeSum = 0;
  float gyroSumX = 0, gyroSumY = 0, gyroSumZ = 0;

  float idleMagnitude = 9.80665f;
  float gyroBiasX = 0, gyroBiasY = 0, gyroBiasZ = 0;

  float filteredAcceleration = 0;
  float filteredRotation = 0;
  uint32_t lastMotionUpdate = 0;
  bool idleCalibrated = false;

  bool write(uint8_t reg, uint8_t value) {
    lastRegister = reg;

    Wire.beginTransmission(address);
    Wire.write(reg);
    Wire.write(value);

    wireError = Wire.endTransmission();
    return wireError == 0;
  }

  bool read(uint8_t reg, uint8_t* bytes, uint8_t size) {
    lastRegister = reg;
    shortRead = false;

    Wire.beginTransmission(address);
    Wire.write(reg);

    wireError = Wire.endTransmission(false);
    if (wireError != 0) return false;

    const size_t received = Wire.requestFrom(address, size);

    if (received != size) {
      shortRead = true;
      while (Wire.available()) Wire.read();
      return false;
    }

    for (uint8_t i = 0; i < size; i++) {
      const int value = Wire.read();

      if (value < 0) {
        shortRead = true;
        return false;
      }

      bytes[i] = static_cast<uint8_t>(value);
    }

    return true;
  }

  static int16_t decodeInt16(const uint8_t* bytes, uint8_t index) {
    const uint16_t value =
        (static_cast<uint16_t>(bytes[index]) << 8) |
        static_cast<uint16_t>(bytes[index + 1]);

    const int32_t signedValue =
        (value & 0x8000u)
            ? static_cast<int32_t>(value) - 65536
            : static_cast<int32_t>(value);

    return static_cast<int16_t>(signedValue);
  }

public:
  const char* status = "not initialized";

  int whoAmI = -1;
  uint8_t wireError = 0;
  uint8_t lastRegister = 0;

  bool shortRead = false;
  bool alternateResponding = false;
  bool healthy = false;
  bool quiet = false;
  bool dynamic = false;
  bool hasSample = false;
  bool debugEnabled = false;

  uint32_t sampledAt = 0;

  int16_t rawAx = 0, rawAy = 0, rawAz = 0;
  int16_t rawGx = 0, rawGy = 0, rawGz = 0;
  int16_t rawTemperature = 0;

  // Acceleration includes gravity, in m/s².
  float ax = 0, ay = 0, az = 0;

  // Gyroscope readings in degrees/second.
  // Bias compensation applies after calibration.
  float gx = 0, gy = 0, gz = 0;

  const char* modelName() const {
    if (whoAmI == 0x70) return "MPU6500";
    if (whoAmI == 0x71) return "MPU9250";
    return "IMU (unidentified)";
  }

  bool isCalibrated() const {
    return idleCalibrated;
  }

  void recalibrateIdle() {
    idleCalibrated = false;
    calibrationCount = 0;

    magnitudeSum = 0;
    gyroSumX = gyroSumY = gyroSumZ = 0;

    idleMagnitude = 9.80665f;
    gyroBiasX = gyroBiasY = gyroBiasZ = 0;

    filteredAcceleration = 0;
    filteredRotation = 0;
    lastMotionUpdate = 0;

    quietSince = 0;
    quiet = false;
    dynamic = false;

    status = initialized
                 ? "calibrating idle; keep sensor still"
                 : "not initialized";
  }

  bool begin(uint8_t addr) {
    address = addr;
    initialized = false;
    healthy = false;
    hasSample = false;

    sampledAt = 0;
    lastRead = 0;
    lastDebug = 0;

    whoAmI = -1;
    wireError = 0;
    lastRegister = 0;
    shortRead = false;
    alternateResponding = false;

    rawAx = rawAy = rawAz = 0;
    rawGx = rawGy = rawGz = rawTemperature = 0;
    ax = ay = az = gx = gy = gz = 0;

    recalibrateIdle();

    if (address != 0x68 && address != 0x69) {
      status = "invalid I2C address; use 0x68 or 0x69";
      return false;
    }

    Wire.beginTransmission(address == 0x68 ? 0x69 : 0x68);
    alternateResponding = Wire.endTransmission() == 0;

    uint8_t id = 0;

    if (!read(0x75, &id, 1)) {
      status = "WHO_AM_I read failed";
      return false;
    }

    whoAmI = id;

    if (id != 0x70 && id != 0x71) {
      status = "unsupported chip ID";
      return false;
    }

    if (!write(0x6B, 0x01) || !write(0x6C, 0x00)) {
      status = "sensor wake failed";
      return false;
    }

    delay(100);

    // ±4 g, ±500 degrees/s, low-pass filtering, 50 Hz.
    // No magnetometer initialization.
    const bool configured =
        write(0x1A, 0x04) &&
        write(0x19, 19) &&
        write(0x1B, 0x08) &&
        write(0x1C, 0x08) &&
        write(0x1D, 0x04);

    if (!configured) {
      status = "sensor configuration write failed";
      return false;
    }

    lastRead = millis();
    initialized = true;
    healthy = true;
    status = "calibrating idle; keep sensor still";

    return true;
  }

  void sample(uint32_t now) {
    if (!initialized) return;
    if (uint32_t(now - lastRead) < 20) return;

    const uint32_t sampleGap = uint32_t(now - lastRead);
    lastRead = now;

    // Do not carry an idle timer across a long sampling gap.
    if (sampleGap > 250) {
      quietSince = 0;
      quiet = false;
      dynamic = false;
      filteredAcceleration = 0;
      filteredRotation = 0;

      if (!idleCalibrated) {
        recalibrateIdle();
      }
    }

    uint8_t bytes[14] = {};

    if (!read(0x3B, bytes, sizeof(bytes))) {
      healthy = false;
      quiet = false;
      dynamic = false;
      quietSince = 0;
      hasSample = false;

      if (!idleCalibrated) {
        recalibrateIdle();
      }

      status = "accelerometer/gyro read failed";
      return;
    }

    rawAx = decodeInt16(bytes, 0);
    rawAy = decodeInt16(bytes, 2);
    rawAz = decodeInt16(bytes, 4);
    rawTemperature = decodeInt16(bytes, 6);
    rawGx = decodeInt16(bytes, 8);
    rawGy = decodeInt16(bytes, 10);
    rawGz = decodeInt16(bytes, 12);

    ax = rawAx * 9.80665f / 8192.0f;
    ay = rawAy * 9.80665f / 8192.0f;
    az = rawAz * 9.80665f / 8192.0f;

    gx = rawGx / 65.5f;
    gy = rawGy / 65.5f;
    gz = rawGz / 65.5f;

    const float magnitude = sqrtf(ax * ax + ay * ay + az * az);

    sampledAt = now;
    hasSample = true;
    healthy = true;

    if (!idleCalibrated) {
      quiet = false;
      dynamic = false;
      quietSince = 0;
      status = "calibrating idle; keep sensor still";

      magnitudeSum += magnitude;
      gyroSumX += gx;
      gyroSumY += gy;
      gyroSumZ += gz;
      calibrationCount++;

      if (calibrationCount >= CALIBRATION_SAMPLES) {
        const float count = static_cast<float>(calibrationCount);

        idleMagnitude = magnitudeSum / count;
        gyroBiasX = gyroSumX / count;
        gyroBiasY = gyroSumY / count;
        gyroBiasZ = gyroSumZ / count;

        idleCalibrated = true;
        lastMotionUpdate = now;
        status = "idle calibration complete";

        if (debugEnabled) {
          Serial.printf(
              "[IMU CAL] baseline=%.3f m/s2 | "
              "gyro bias=%.3f,%.3f,%.3f deg/s\n",
              idleMagnitude, gyroBiasX, gyroBiasY, gyroBiasZ);
        }
      }

      return;
    }

    gx -= gyroBiasX;
    gy -= gyroBiasY;
    gz -= gyroBiasZ;

    // Motion indicators, not gravity-free acceleration vectors.
    const float acceleration = fabsf(magnitude - idleMagnitude);
    const float rotation = sqrtf(gx * gx + gy * gy + gz * gz);

    const float dt = uint32_t(now - lastMotionUpdate) / 1000.0f;
    lastMotionUpdate = now;

    const float alpha = dt / (0.20f + dt);

    filteredAcceleration +=
        alpha * (acceleration - filteredAcceleration);

    filteredRotation +=
        alpha * (rotation - filteredRotation);

    if (filteredAcceleration > ACCEL_ACTIVE ||
        filteredRotation > GYRO_ACTIVE) {
      dynamic = true;
      quiet = false;
      quietSince = 0;
    } else if (filteredAcceleration < ACCEL_IDLE &&
               filteredRotation < GYRO_IDLE) {
      if (quietSince == 0) quietSince = now;

      if (uint32_t(now - quietSince) >= IDLE_DELAY_MS) {
        quiet = true;
        dynamic = false;
      }
    } else {
      quietSince = 0;
      quiet = false;
    }

    status = "reading; idle compensation active";

    if (debugEnabled && uint32_t(now - lastDebug) >= 1000) {
      lastDebug = now;

      Serial.print("[IMU BUFFER]");
      for (uint8_t i = 0; i < sizeof(bytes); i++) {
        Serial.printf(" %02X", static_cast<unsigned int>(bytes[i]));
      }
      Serial.println();

      Serial.printf(
          "[IMU DECODED] accel=%d,%d,%d gyro=%d,%d,%d temp=%d\n",
          static_cast<int>(rawAx),
          static_cast<int>(rawAy),
          static_cast<int>(rawAz),
          static_cast<int>(rawGx),
          static_cast<int>(rawGy),
          static_cast<int>(rawGz),
          static_cast<int>(rawTemperature));

      Serial.printf(
          "[IMU SCALED] accel=%.3f,%.3f,%.3f m/s2 | "
          "magnitude=%.3f | gyro=%.3f,%.3f,%.3f deg/s\n",
          ax, ay, az, magnitude, gx, gy, gz);

      Serial.printf(
          "[IMU MOTION] accel deviation=%.3f m/s2 | "
          "rotation=%.3f deg/s | quiet=%s dynamic=%s\n",
          filteredAcceleration,
          filteredRotation,
          quiet ? "yes" : "no",
          dynamic ? "yes" : "no");
    }
  }
};
