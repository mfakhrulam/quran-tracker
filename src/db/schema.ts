import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const pages = sqliteTable("pages", {
  pageNumber: integer("page_number").primaryKey(),
  juz: integer("juz").notNull(),
  surahStart: integer("surah_start").notNull(),
  ayahStart: integer("ayah_start").notNull(),
  surahEnd: integer("surah_end").notNull(),
  ayahEnd: integer("ayah_end").notNull(),
});

export const memorizationStatus = sqliteTable("memorization_status", {
  pageNumber: integer("page_number").primaryKey().references(() => pages.pageNumber),
  status: text("status").notNull().default("belum"),
  memorizedAt: integer("memorized_at", { mode: "timestamp" }),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp" }),
  nextReviewDate: text("next_review_date"),
  intervalDays: integer("interval_days").notNull().default(0),
});

export const sessionsLog = sqliteTable("sessions_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  pageNumber: integer("page_number").notNull(),
  type: text("type").notNull(),
  quality: text("quality").notNull(),
  mistakesNote: text("mistakes_note"),
  durationMin: integer("duration_min"),
});

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  targetPages: integer("target_pages").notNull(),
  deadline: text("deadline"),
  startDate: text("start_date").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const restDays = sqliteTable("rest_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  reason: text("reason"),
});

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  freeMinutes: integer("free_minutes"),
  focusTime: text("focus_time"),
  constraintsNote: text("constraints_note"),
});

export const plans = sqliteTable("plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  goalId: integer("goal_id").references(() => goals.id),
  inputSnapshot: text("input_snapshot").notNull(),
  planJson: text("plan_json").notNull(),
  explanation: text("explanation"),
  status: text("status").notNull().default("draft"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
