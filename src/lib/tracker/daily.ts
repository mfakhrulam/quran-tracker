import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { memorizationStatus, sessionsLog, settings as settingsTable } from "@/db/schema";
import type * as schema from "@/db/schema";
import { parseSettings, type AppSettings } from "@/lib/settings";
import { addDays, todayISO } from "./date";
import { isQuality, isSessionType, type Quality, type SessionType } from "./quality";
import {
  buildDailyTasks,
  type DailyPlan,
  type PageSchedule,
  type ReviewedToday,
} from "./schedule";

export type StatusRecord = typeof memorizationStatus.$inferSelect;

export interface DayLog {
  date: string;
  pageNumber: number;
  type: string;
  quality: string;
}

export interface DailySource {
  statuses: StatusRecord[];
  logs: DayLog[];
  settings: AppSettings;
}

export interface DailyTasksResult {
  plan: DailyPlan;
  settings: AppSettings;
}

/**
 * Mengubah baris `memorization_status` menjadi jadwal yang bisa dihitung.
 *
 * Baris dengan jadwal kosong (data lama sebelum Fase 3 pernah di-recompute)
 * diperlakukan sebagai jatuh tempo: interval 1 dan tanggal review dihitung
 * dari `memorizedAt`. Dengan begitu tidak ada hafalan yang "hilang" dari
 * daftar hanya karena `db:recompute` belum dijalankan.
 */
function toSchedules(statuses: StatusRecord[], date: string): PageSchedule[] {
  return statuses.map((row) => {
    const intervalDays = row.intervalDays > 0 ? row.intervalDays : 1;
    const memorizedAt = row.memorizedAt ? todayISO(row.memorizedAt) : date;
    const lastReviewedAt = row.lastReviewedAt ? todayISO(row.lastReviewedAt) : memorizedAt;
    return {
      pageNumber: row.pageNumber,
      status: isQuality(row.status) ? row.status : "baru",
      memorizedAt,
      lastReviewedAt,
      intervalDays,
      nextReviewDate: row.nextReviewDate ?? addDays(memorizedAt, intervalDays),
    };
  });
}

/**
 * Fungsi murni: menyusun tugas harian dari data yang sudah ada di tangan.
 *
 * Dipakai dashboard, yang sudah memegang baris status dari
 * `getCachedStatuses()` dan log hari ini dari `db.batch()`. Memanggil
 * `loadDailyTasks` di sana akan menambah satu round-trip Turso (~180ms di
 * Netlify lintas region) hanya untuk data yang sudah tersedia.
 */
export function buildDailyPlan(source: DailySource, date: string): DailyPlan {
  const reviewedToday: ReviewedToday[] = source.logs
    .filter((log) => isSessionType(log.type) && isQuality(log.quality))
    .map((log) => ({
      pageNumber: log.pageNumber,
      quality: log.quality as Quality,
      type: log.type as SessionType,
    }));

  return buildDailyTasks({
    today: date,
    schedules: toSchedules(source.statuses, date),
    reviewedToday,
    settings: source.settings,
  });
}

/**
 * Versi yang mengambil datanya sendiri — SATU `db.batch()`, tiga statement
 * dalam satu round-trip HTTP.
 */
export async function loadDailyTasks(
  db: LibSQLDatabase<typeof schema>,
  date: string,
): Promise<DailyTasksResult> {
  const [statuses, logs, settingRows] = await db.batch([
    db.select().from(memorizationStatus),
    db.select().from(sessionsLog).where(eq(sessionsLog.date, date)),
    db.select({ key: settingsTable.key, value: settingsTable.value }).from(settingsTable),
  ]);

  const settings = parseSettings(settingRows);
  return { plan: buildDailyPlan({ statuses, logs, settings }, date), settings };
}
