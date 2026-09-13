CREATE TABLE `staff_access` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`granted_by` text NOT NULL
);
