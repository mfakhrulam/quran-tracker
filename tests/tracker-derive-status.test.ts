import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
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
});
