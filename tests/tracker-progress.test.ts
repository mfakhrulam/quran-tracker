import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, memorizationStatus } from "@/db/schema";
import { computeProgress } from "@/lib/tracker/progress";

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
      console.warn(`[tracker-progress.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-prog-"));
  ctx = createDb(`file:${join(dir, "p.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  await ctx.db.insert(pages).values([
    { pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 },
    { pageNumber: 2, juz: 1, surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 },
    { pageNumber: 3, juz: 1, surahStart: 2, ayahStart: 6, surahEnd: 2, ayahEnd: 10 },
    { pageNumber: 22, juz: 2, surahStart: 2, ayahStart: 142, surahEnd: 2, ayahEnd: 150 },
  ]);
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

describe("computeProgress", () => {
  // `pages` kini berasal dari modul statis, jadi unit test mengoper basis
  // halaman eksplisit — yang diuji adalah logika agregasi, bukan sumber data.
  const fixture = [
    { pageNumber: 1, juz: 1 },
    { pageNumber: 2, juz: 1 },
    { pageNumber: 3, juz: 1 },
    { pageNumber: 22, juz: 2 },
  ];

  it("menghitung hafalan & persen dari status != belum", async () => {
    await ctx.db.insert(memorizationStatus).values([
      { pageNumber: 1, status: "mutqin" },
      { pageNumber: 2, status: "lemah" },
    ]);
    const p = await computeProgress(ctx.db, fixture);
    expect(p.totalPages).toBe(4);
    expect(p.memorizedPages).toBe(2);
    expect(p.percent).toBeCloseTo(0.5);
    expect(p.byStatus.belum).toBe(2);
    expect(p.byStatus.mutqin).toBe(1);
    expect(p.byStatus.lemah).toBe(1);
  });
  it("mengelompokkan per juz", async () => {
    const p = await computeProgress(ctx.db, fixture);
    const juz1 = p.byJuz.find((j) => j.juz === 1);
    const juz2 = p.byJuz.find((j) => j.juz === 2);
    expect(juz1).toMatchObject({ total: 3, memorized: 2 });
    expect(juz2).toMatchObject({ total: 1, memorized: 0 });
  });
  it("default memakai 604 halaman mushaf yang dibundel", async () => {
    const p = await computeProgress(ctx.db);
    expect(p.totalPages).toBe(604);
  });
});
