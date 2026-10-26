import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, sessionsLog, memorizationStatus } from "@/db/schema";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";

function forceGc(): void {
  v8.setFlagsFromString("--expose_gc");
  const gc = vm.runInNewContext("gc") as () => void;
  v8.setFlagsFromString("--no-expose_gc");
  gc();
}

function safeRm(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    forceGc();
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      console.warn(`[tracker-derive-status.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-derive-"));
  ctx = createDb(`file:${join(dir, "d.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  await ctx.db.insert(pages).values([
    { pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 },
    { pageNumber: 2, juz: 1, surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 },
  ]);
});
afterAll(() => { ctx.client.close(); safeRm(dir); });
beforeEach(async () => { await ctx.db.delete(sessionsLog); await ctx.db.delete(memorizationStatus); });

describe("recomputeMemorizationStatus", () => {
  it("status dari sabaq terbaru, memorizedAt dari sabaq pertama", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "baru" },
      { date: "2026-10-05", pageNumber: 1, type: "sabaq", quality: "mutqin" },
      { date: "2026-10-06", pageNumber: 1, type: "manzil", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    const rows = await ctx.db.select().from(memorizationStatus);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("mutqin");
    expect(rows[0].memorizedAt?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(rows[0].lastReviewedAt?.toISOString().slice(0, 10)).toBe("2026-10-06");
  });

  it("halaman tanpa sabaq tidak dihitung meski ada sabqi/manzil", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-06", pageNumber: 2, type: "manzil", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    expect(await ctx.db.select().from(memorizationStatus)).toHaveLength(0);
  });

  it("menghapus status saat sabaq satu-satunya dihapus", async () => {
    await ctx.db.insert(sessionsLog).values({ date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "lancar" });
    await recomputeMemorizationStatus(ctx.db);
    expect(await ctx.db.select().from(memorizationStatus)).toHaveLength(1);
    await ctx.db.delete(sessionsLog);
    await recomputeMemorizationStatus(ctx.db);
    expect(await ctx.db.select().from(memorizationStatus)).toHaveLength(0);
  });

  it("mengisi interval dan tanggal review berikutnya", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: "2026-10-02", pageNumber: 1, type: "sabqi", quality: "mutqin" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    const [row] = await ctx.db.select().from(memorizationStatus);
    expect(row.intervalDays).toBe(2);
    expect(row.nextReviewDate).toBe("2026-10-04");
  });

  it("review lemah mereset interval ke 1", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "mutqin" },
      { date: "2026-10-03", pageNumber: 1, type: "sabqi", quality: "mutqin" },
      { date: "2026-10-07", pageNumber: 1, type: "manzil", quality: "lemah" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    const [row] = await ctx.db.select().from(memorizationStatus);
    expect(row.intervalDays).toBe(1);
    expect(row.nextReviewDate).toBe("2026-10-08");
    expect(row.status).toBe("mutqin");
  });

  it("menghapus log memundurkan jadwal kembali", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: "2026-10-02", pageNumber: 1, type: "sabqi", quality: "mutqin" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    await ctx.db.delete(sessionsLog).where(eq(sessionsLog.date, "2026-10-02"));
    await recomputeMemorizationStatus(ctx.db);
    const [row] = await ctx.db.select().from(memorizationStatus);
    expect(row.intervalDays).toBe(1);
    expect(row.nextReviewDate).toBe("2026-10-02");
  });

  it("mengisi jadwal untuk banyak halaman dalam satu recompute", async () => {
    await ctx.db.insert(pages).values(
      Array.from({ length: 20 }, (_, i) => ({
        pageNumber: i + 3,
        juz: 1,
        surahStart: 1,
        ayahStart: 1,
        surahEnd: 1,
        ayahEnd: 7,
      })),
    );
    await ctx.db.insert(sessionsLog).values(
      Array.from({ length: 20 }, (_, i) => ({
        date: "2026-10-01",
        pageNumber: i + 3,
        type: "sabaq",
        quality: "lancar",
      })),
    );
    await recomputeMemorizationStatus(ctx.db);
    const rows = await ctx.db.select().from(memorizationStatus);
    expect(rows).toHaveLength(20);
    expect(rows.every((r) => r.intervalDays === 1 && r.nextReviewDate === "2026-10-02")).toBe(true);
  });
});
