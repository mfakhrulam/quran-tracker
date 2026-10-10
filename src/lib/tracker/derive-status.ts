import { notInArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessionsLog, memorizationStatus } from "@/db/schema";
import type * as schema from "@/db/schema";

export async function recomputeMemorizationStatus(db: LibSQLDatabase<typeof schema>): Promise<void> {
  const logs = await db.select().from(sessionsLog).orderBy(sessionsLog.date, sessionsLog.id);

  const sabaqFirst = new Map<number, string>();
  const sabaqLast = new Map<number, string>();
  const lastReview = new Map<number, string>();

  for (const log of logs) {
    lastReview.set(log.pageNumber, log.date);
    if (log.type === "sabaq") {
      if (!sabaqFirst.has(log.pageNumber)) sabaqFirst.set(log.pageNumber, log.date);
      sabaqLast.set(log.pageNumber, log.quality);
    }
  }

  for (const [pageNumber, quality] of sabaqLast) {
    const memorizedAt = new Date(sabaqFirst.get(pageNumber)!);
    const lastReviewedAt = new Date(lastReview.get(pageNumber)!);
    await db
      .insert(memorizationStatus)
      .values({ pageNumber, status: quality, memorizedAt, lastReviewedAt })
      .onConflictDoUpdate({
        target: memorizationStatus.pageNumber,
        set: { status: quality, memorizedAt, lastReviewedAt },
      });
  }

  const memorizedPageNumbers = [...sabaqLast.keys()];
  if (memorizedPageNumbers.length === 0) {
    await db.delete(memorizationStatus);
  } else {
    await db.delete(memorizationStatus).where(notInArray(memorizationStatus.pageNumber, memorizedPageNumbers));
  }
}
