CREATE TABLE `checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`free_minutes` integer,
	`focus_time` text,
	`constraints_note` text
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`target_pages` integer NOT NULL,
	`deadline` text,
	`start_date` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memorization_status` (
	`page_number` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'belum' NOT NULL,
	`memorized_at` integer,
	`last_reviewed_at` integer,
	`next_review_date` text,
	`interval_days` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`page_number`) REFERENCES `pages`(`page_number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`page_number` integer PRIMARY KEY NOT NULL,
	`juz` integer NOT NULL,
	`surah_start` integer NOT NULL,
	`ayah_start` integer NOT NULL,
	`surah_end` integer NOT NULL,
	`ayah_end` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`goal_id` integer,
	`input_snapshot` text NOT NULL,
	`plan_json` text NOT NULL,
	`explanation` text,
	`status` text DEFAULT 'draft' NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rest_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sessions_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`page_number` integer NOT NULL,
	`type` text NOT NULL,
	`quality` text NOT NULL,
	`mistakes_note` text,
	`duration_min` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);