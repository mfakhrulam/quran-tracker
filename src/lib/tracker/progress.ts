import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { memorizationStatus } from "@/db/schema";
import type * as schema from "@/db/schema";
import { PAGE_LITES, type PageLite } from "@/lib/mushaf/pages";
import { QUALITY_LEVELS } from "./quality";

export interface JuzProgress {
  juz: number;
  total: number;
  memorized: number;
}

export interface ProgressSummary {
  totalPages: number;
  memorizedPages: number;
  percent: number;
  byStatus: Record<string, number>;
  byJuz: JuzProgress[];
}

export interface StatusRow {
  pageNumber: number;
  status: string;
}

/**
 * Fungsi murni: tidak menyentuh DB sama sekali.
 *
 * Dipisah dari `computeProgress` supaya pemanggil yang sudah mengambil
 * `memorization_status` lewat `db.batch()` bisa menghitung ringkasan tanpa
 * round-trip tambahan.
 */
export function summarizeProgress(
  allPages: PageLite[],
  statuses: StatusRow[],
): ProgressSummary {
  const statusByPage = new Map(statuses.map((s) => [s.pageNumber, s.status]));

  const byStatus: Record<string, number> = { belum: 0 };
  for (const q of QUALITY_LEVELS) byStatus[q] = 0;

  let memorizedPages = 0;
  const juzMap = new Map<number, JuzProgress>();

  for (const page of allPages) {
    const status = statusByPage.get(page.pageNumber) ?? "belum";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const isMemorized = status !== "belum";
    if (isMemorized) memorizedPages += 1;

    const entry = juzMap.get(page.juz) ?? { juz: page.juz, total: 0, memorized: 0 };
    entry.total += 1;
    if (isMemorized) entry.memorized += 1;
    juzMap.set(page.juz, entry);
  }

  const byJuz = [...juzMap.values()].sort((a, b) => a.juz - b.juz);
  return {
    totalPages: allPages.length,
    memorizedPages,
    percent: allPages.length > 0 ? memorizedPages / allPages.length : 0,
    byStatus,
    byJuz,
  };
}

/**
 * Versi yang mengambil status sendiri (1 round-trip).
 *
 * `allPages` default ke metadata mushaf yang dibundel, sehingga tidak ada
 * query ke tabel `pages` sama sekali. Pemanggil yang butuh basis halaman lain
 * (mis. unit test dengan fixture kecil) boleh mengopernya eksplisit.
 */
export async function computeProgress(
  db: LibSQLDatabase<typeof schema>,
  allPages: PageLite[] = PAGE_LITES,
): Promise<ProgressSummary> {
  const statuses = await db
    .select({ pageNumber: memorizationStatus.pageNumber, status: memorizationStatus.status })
    .from(memorizationStatus);
  return summarizeProgress(allPages, statuses);
}
