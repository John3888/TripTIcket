-- CreateTable
CREATE TABLE `employees` (
    `employee_id` VARCHAR(24) NOT NULL,
    `first_name` VARCHAR(80) NOT NULL,
    `middle_name` VARCHAR(80) NOT NULL,
    `surname` VARCHAR(80) NOT NULL,
    `display_name` VARCHAR(255) NOT NULL,
    `designation` VARCHAR(80) NOT NULL,
    `role` VARCHAR(80) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `rfid_uid` VARCHAR(32) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employees_email_key`(`email`),
    UNIQUE INDEX `employees_rfid_uid_key`(`rfid_uid`),
    PRIMARY KEY (`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `user_id` VARCHAR(24) NOT NULL,
    `employee_id` VARCHAR(24) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `app_role` VARCHAR(80) NOT NULL,
    `notification_mode` ENUM('ON', 'SILENT', 'OFF') NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_employee_id_key`(`employee_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicles` (
    `vehicle_id` VARCHAR(24) NOT NULL,
    `plate` VARCHAR(32) NOT NULL,
    `status` ENUM('STANDBY', 'ON_TRIP', 'INACTIVE') NOT NULL DEFAULT 'STANDBY',
    `description` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vehicles_plate_key`(`plate`),
    PRIMARY KEY (`vehicle_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_steps` (
    `step` INTEGER NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `actor_role` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NOT NULL,

    PRIMARY KEY (`step`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trip_requests` (
    `id` VARCHAR(12) NOT NULL,
    `status` ENUM('PENDING', 'NOTED', 'APPROVED', 'ONGOING', 'COMPLETED', 'DENIED') NOT NULL DEFAULT 'PENDING',
    `employee_id` VARCHAR(24) NOT NULL,
    `vehicle_id` VARCHAR(24) NOT NULL,
    `employee_name` VARCHAR(255) NOT NULL,
    `vehicle_plate` VARCHAR(32) NOT NULL,
    `destination` VARCHAR(500) NOT NULL,
    `purpose` TEXT NOT NULL,
    `estimated_seconds` INTEGER NOT NULL,
    `requested_by` VARCHAR(255) NOT NULL,
    `requester_role` VARCHAR(80) NOT NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `noted_by_supervisor` VARCHAR(255) NULL,
    `noted_by_supervisor_at` DATETIME(3) NULL,
    `noted_by_hr` VARCHAR(255) NULL,
    `noted_by_hr_at` DATETIME(3) NULL,
    `approved_by` VARCHAR(255) NULL,
    `approved_at` DATETIME(3) NULL,
    `decision_by` VARCHAR(255) NULL,
    `decision_status` VARCHAR(32) NULL,
    `departed_at` DATETIME(3) NULL,
    `arrived_at` DATETIME(3) NULL,
    `elapsed_seconds` INTEGER NOT NULL DEFAULT 0,
    `warned15` BOOLEAN NOT NULL DEFAULT false,
    `flagged` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `trip_requests_status_idx`(`status`),
    INDEX `trip_requests_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gps_points` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `trip_request_id` VARCHAR(12) NOT NULL,
    `device_id` VARCHAR(80) NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `speed_kph` DECIMAL(8, 2) NULL,
    `heading` DECIMAL(8, 2) NULL,
    `accuracy_meters` DECIMAL(8, 2) NULL,
    `recorded_at` DATETIME(3) NOT NULL,

    INDEX `gps_points_trip_request_id_recorded_at_idx`(`trip_request_id`, `recorded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(80) NOT NULL,
    `trip_request_id` VARCHAR(12) NULL,
    `recipients` JSON NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `kind` VARCHAR(80) NOT NULL,
    `closed_by` JSON NOT NULL,
    `read_by` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_trip_request_id_idx`(`trip_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trip_requests` ADD CONSTRAINT `trip_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trip_requests` ADD CONSTRAINT `trip_requests_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`vehicle_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gps_points` ADD CONSTRAINT `gps_points_trip_request_id_fkey` FOREIGN KEY (`trip_request_id`) REFERENCES `trip_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_trip_request_id_fkey` FOREIGN KEY (`trip_request_id`) REFERENCES `trip_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
