INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `notification_id`, 'Supervisor'
FROM `notification_recipients`
WHERE `role` = 'Noter';

INSERT IGNORE INTO `notification_recipients` (`notification_id`, `role`)
SELECT `notification_id`, 'Human Resources'
FROM `notification_recipients`
WHERE `role` = 'Noter';

DELETE FROM `notification_recipients` WHERE `role` = 'Noter';
