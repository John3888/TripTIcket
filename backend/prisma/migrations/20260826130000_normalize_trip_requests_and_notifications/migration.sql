CREATE TABLE IF NOT EXISTS `notification_recipients` (
  `notification_id` VARCHAR(80) NOT NULL,
  `role` VARCHAR(80) NOT NULL,
  PRIMARY KEY (`notification_id`, `role`),
  INDEX `notification_recipients_role_idx` (`role`),
  CONSTRAINT `notification_recipients_notification_id_fkey`
    FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `id`, 'Noter' FROM `notifications` WHERE JSON_CONTAINS(`recipients`, JSON_QUOTE('Noter'));
INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `id`, 'Requester' FROM `notifications` WHERE JSON_CONTAINS(`recipients`, JSON_QUOTE('Requester'));
INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `id`, 'Supervisor' FROM `notifications` WHERE JSON_CONTAINS(`recipients`, JSON_QUOTE('Supervisor'));
INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `id`, 'Human Resources' FROM `notifications` WHERE JSON_CONTAINS(`recipients`, JSON_QUOTE('Human Resources'));
INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `id`, 'Finance' FROM `notifications` WHERE JSON_CONTAINS(`recipients`, JSON_QUOTE('Finance'));
INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `id`, 'Administrator' FROM `notifications` WHERE JSON_CONTAINS(`recipients`, JSON_QUOTE('Administrator'));
INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `id`, 'Employee' FROM `notifications` WHERE JSON_CONTAINS(`recipients`, JSON_QUOTE('Employee'));

CREATE TABLE IF NOT EXISTS `notification_receipts` (
  `notification_id` VARCHAR(80) NOT NULL,
  `user_id` VARCHAR(24) NOT NULL,
  `status` ENUM('READ', 'CLOSED') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`notification_id`, `user_id`, `status`),
  INDEX `notification_receipts_user_id_idx` (`user_id`),
  CONSTRAINT `notification_receipts_notification_id_fkey`
    FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `notification_receipts_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `trip_requests`
  DROP COLUMN `employee_name`,
  DROP COLUMN `vehicle_plate`,
  DROP COLUMN `requested_by`,
  DROP COLUMN `requester_role`;

ALTER TABLE `notifications`
  DROP COLUMN `recipients`,
  DROP COLUMN `closed_by`,
  DROP COLUMN `read_by`;
