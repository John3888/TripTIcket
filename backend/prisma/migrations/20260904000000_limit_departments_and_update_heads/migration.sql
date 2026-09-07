-- Keep existing accounts usable while reducing the department list to the four
-- departments supported by the current workflow.
ALTER TABLE `employees` MODIFY `department` VARCHAR(32) NOT NULL DEFAULT 'OPERATIONS';
UPDATE `employees` SET `department` = 'MIS' WHERE `department` = 'ADMINISTRATION';
UPDATE `employees` SET `department` = 'OPERATIONS' WHERE `department` = 'FLEET_MANAGEMENT';
ALTER TABLE `employees` MODIFY `department` ENUM('MIS', 'FINANCE', 'HUMAN_RESOURCES', 'OPERATIONS') NOT NULL DEFAULT 'OPERATIONS';

-- Migrate the former workflow titles to the department-head titles.
UPDATE `employees` SET `role` = 'Department Head' WHERE `role` = 'Supervisor';
UPDATE `employees` SET `designation` = 'Department Head' WHERE `designation` = 'Supervisor';
UPDATE `users` SET `app_role` = 'Department Head' WHERE `app_role` = 'Supervisor';
UPDATE `employees` SET `role` = 'HR Head' WHERE `role` = 'Human Resources';
UPDATE `employees` SET `designation` = 'HR Head' WHERE `designation` = 'Human Resources';
UPDATE `users` SET `app_role` = 'HR Head' WHERE `app_role` = 'Human Resources';
UPDATE `employees` SET `role` = 'Finance Head' WHERE `role` = 'Finance';
UPDATE `employees` SET `designation` = 'Finance Head' WHERE `designation` = 'Finance';
UPDATE `users` SET `app_role` = 'Finance Head' WHERE `app_role` = 'Finance';

UPDATE `notification_recipients` SET `role` = 'Department Head' WHERE `role` = 'Supervisor';
UPDATE `notification_recipients` SET `role` = 'HR Head' WHERE `role` = 'Human Resources';
UPDATE `notification_recipients` SET `role` = 'Finance Head' WHERE `role` = 'Finance';
