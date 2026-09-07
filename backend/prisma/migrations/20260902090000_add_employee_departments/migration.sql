-- Existing people remain valid after the change and are placed in Operations
-- until an administrator assigns a more specific department.
ALTER TABLE `employees`
  ADD COLUMN `department` ENUM('ADMINISTRATION', 'FINANCE', 'HUMAN_RESOURCES', 'OPERATIONS', 'FLEET_MANAGEMENT') NOT NULL DEFAULT 'OPERATIONS';
