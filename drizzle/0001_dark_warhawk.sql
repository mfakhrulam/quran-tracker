ALTER TABLE `sessions_log` ADD `ayah_start` integer;--> statement-breakpoint
ALTER TABLE `sessions_log` ADD `ayah_end` integer;--> statement-breakpoint
CREATE INDEX `sessions_log_date_idx` ON `sessions_log` (`date`);--> statement-breakpoint
CREATE INDEX `sessions_log_page_idx` ON `sessions_log` (`page_number`);