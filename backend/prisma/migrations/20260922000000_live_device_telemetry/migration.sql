ALTER TABLE `gps_points` ADD COLUMN `filter_version` INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN `filter_variance` DOUBLE NULL;
CREATE TABLE `tracking_devices` (
 `device_id` VARCHAR(80) NOT NULL, `vehicle_id` VARCHAR(24) NOT NULL,
 `enabled` BOOLEAN NOT NULL DEFAULT true, `last_seen_at` DATETIME(3) NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`device_id`), UNIQUE INDEX `tracking_devices_vehicle_id_key` (`vehicle_id`),
 CONSTRAINT `tracking_devices_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`vehicle_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `device_telemetry` (
 `id` BIGINT NOT NULL AUTO_INCREMENT, `device_id` VARCHAR(80) NOT NULL,
 `trip_request_id` VARCHAR(12) NULL, `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `recorded_at` DATETIME(3) NOT NULL, `has_fix` BOOLEAN NOT NULL,
 `latitude` DOUBLE NULL, `longitude` DOUBLE NULL, `speed_kph` DOUBLE NULL,
 `hdop` DOUBLE NULL, `satellites` INTEGER NULL, `altitude_m` DOUBLE NULL,
 `uptime_ms` BIGINT NULL, `sensor_version` INTEGER NOT NULL DEFAULT 1,
 `acceleration` JSON NULL, `disposition` VARCHAR(40) NOT NULL,
 PRIMARY KEY (`id`), INDEX `device_telemetry_device_id_received_at_idx` (`device_id`, `received_at`),
 INDEX `device_telemetry_trip_request_id_recorded_at_idx` (`trip_request_id`, `recorded_at`),
 CONSTRAINT `device_telemetry_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `tracking_devices` (`device_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT `device_telemetry_trip_request_id_fkey` FOREIGN KEY (`trip_request_id`) REFERENCES `trip_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Explicit installation requested for the current unit; preserve all historical GPS.
INSERT INTO `tracking_devices` (`device_id`, `vehicle_id`)
 SELECT 'GPS-EMB-024', `vehicle_id` FROM `vehicles` WHERE `plate` = 'EMB 024';
