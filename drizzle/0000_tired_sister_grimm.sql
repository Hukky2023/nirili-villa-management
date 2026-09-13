CREATE TABLE `restaurant_bills` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_by` text NOT NULL
);
