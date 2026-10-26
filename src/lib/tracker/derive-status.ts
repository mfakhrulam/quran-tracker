import { notInArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessionsLog, memorizationStatus } from "@/db/schema";
import type * as schema from "@/db/schema";
import { loadSettings } from "@/lib/settings";
import { replayPageSchedule } from "./schedule";
import type { Quality, SessionType } from "./quality";

/**
 * Menurunkan ulang `memorization_status` dari `sessions_log`.
 *
 * `memorization_status` adalah data turunan, bukan sumber kebenaran:
 * - status         = kualitas `sabaq` terbaru
 * - memorizedAt    = tanggal `sabaq` pertama
 * - lastReviewedAt = tanggal log terakhir (sabaq/sabqi/manzil)
 * - intervalDays & nextReviewDate = hasil replay jadwal (Fase 3)
 *
 * Semua tulis dikirim lewat satu `db.batch()` — satu round-trip HTTP, bukan
 * satu INSERT per halaman. Versi lama melakukan `await insert` di dalam loop,
 * sehingga 604 halaman hafalan = 604 round-trip berurutan (~60 detik di
 * Netlify lintas region).
 */
export async function recomputeMemorizationStatus(
  db: LibSQLDatabase<typeof schema>,
): Promise<void> {
  const [logs, settings] = await Promise.all([
    db.select().from(sessionsLog).orderBy(sessionsLog.date, sessionsLog.id),
    loadSettings(db),
  ]);

  const schedules = replayPageSchedule(
    logs.map((log) => ({
      id: log.id,
      date: log.date,
      pageNumber: log.pageNumber,
      type: log.type as SessionType,
      quality: log.quality as Quality,
    })),
    settings.intervalCapDays,
  );

  const writes = [...schedules.values()].map((schedule) => {
    const memorizedAt = new Date(schedule.memorizedAt);
    const lastReviewedAt = new Date(schedule.lastReviewedAt);
    return db
      .insert(memorizationStatus)
      .values({
        pageNumber: schedule.pageNumber,
        status: schedule.status,
        memorizedAt,
        lastReviewedAt,
        intervalDays: schedule.intervalDays,
        nextReviewDate: schedule.nextReviewDate,
      })
      .onConflictDoUpdate({
        target: memorizationStatus.pageNumber,
        set: {
          status: schedule.status,
          memorizedAt,
          lastReviewedAt,
          intervalDays: schedule.intervalDays,
          nextReviewDate: schedule.nextReviewDate,
        },
      });
  });

  const memorizedPageNumbers = [...schedules.keys()];
  const prune =
    memorizedPageNumbers.length === 0
      ? db.delete(memorizationStatus)
      : db.delete(memorizationStatus).where(notInArray(memorizationStatus.pageNumber, memorizedPageNumbers));

  // Satu round-trip: semua upsert + prune dikirim bersama. `batch()` menuntut
  // tuple non-kosong, jadi saat belum ada sabaq sama sekali cukup prune saja.
  if (writes.length === 0) {
    await prune;
    return;
  }
  await db.batch([writes[0], ...writes.slice(1), prune]);
}
