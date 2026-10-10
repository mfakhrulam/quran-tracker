import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { pages, memorizationStatus } from "@/db/schema";
import type * as schema from "@/db/schema";
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

export async function computeProgress(db: LibSQLDatabase<typeof schema>): Promise<ProgressSummary> {
  const allPages = await db.select({ pageNumber: pages.pageNumber, juz: pages.juz }).from(pages);
  const statuses = await db.select().from(memorizationStatus);
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
