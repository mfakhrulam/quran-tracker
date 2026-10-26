import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { memorizationStatus, pages, sessionsLog, settings } from "@/db/schema";
import { buildDailyPlan, loadDailyTasks } from "@/lib/tracker/daily";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { parseSettings } from "@/lib/settings";
import { rotationSlot } from "@/lib/tracker/schedule";

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
      console.warn(`[tracker-daily-loader.test] cleanup dilewati: ${target}`);
    }
  }
}

const TODAY = "2026-10-21";

let dir: string;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-daily-"));
  ctx = createDb(`file:${join(dir, "d.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  // FK: memorization_status.page_number -> pages.page_number, jadi setiap
  // halaman yang dipakai test harus ada di tabel pages.
  await ctx.db.insert(pages).values(
    Array.from({ length: 12 }, (_, i) => ({
      pageNumber: i + 1,
      juz: 1,
      surahStart: 1,
      ayahStart: 1,
      surahEnd: 1,
      ayahEnd: 7,
    })),
  );
});

afterAll(() => {
  ctx.client.close();
  safeRm(dir);
});

beforeEach(async () => {
  await ctx.db.delete(sessionsLog);
  await ctx.db.delete(memorizationStatus);
  await ctx.db.delete(settings);
});

describe("loadDailyTasks", () => {
  it("membentuk tugas dari status hasil recompute", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: "2026-10-02", pageNumber: 2, type: "sabaq", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);

    const { plan, settings: s } = await loadDailyTasks(ctx.db, TODAY);
    expect(s.dailyLoadLimit).toBe(2);
    expect(plan.manzilTotal).toBe(2);
    expect(plan.done).toHaveLength(0);
    expect(plan.date).toBe(TODAY);
  });

  it("menghitung murajaah hari ini sebagai selesai dan mengeluarkannya dari tugas", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-20", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: TODAY, pageNumber: 1, type: "sabqi", quality: "mutqin" },
    ]);
    await recomputeMemorizationStatus(ctx.db);

    const { plan } = await loadDailyTasks(ctx.db, TODAY);
    expect(plan.sabqi).toHaveLength(0);
    expect(plan.done).toHaveLength(1);
    expect(plan.done[0]).toMatchObject({ pageNumber: 1, status: "mutqin", lane: "sabqi" });
  });

  it("menghormati settings dari DB", async () => {
    await ctx.db.insert(settings).values([
      { key: "daily_load_limit", value: "1" },
      { key: "sabqi_window_days", value: "1" },
    ]);
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-20", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: "2026-10-20", pageNumber: 2, type: "sabaq", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);

    const { plan, settings: s } = await loadDailyTasks(ctx.db, TODAY);
    expect(s.dailyLoadLimit).toBe(1);
    expect(s.sabqiWindowDays).toBe(1);
    expect(plan.capacityPerDay).toBe(1);
    expect(plan.sabqi.length).toBeLessThanOrEqual(1);
  });

  it("halaman dengan jadwal kosong tetap dianggap jatuh tempo", async () => {
    await ctx.db.insert(memorizationStatus).values({
      pageNumber: 1,
      status: "lancar",
      memorizedAt: new Date("2026-01-01"),
      lastReviewedAt: new Date("2026-01-01"),
      intervalDays: 0,
      nextReviewDate: null,
    });
    const { plan } = await loadDailyTasks(ctx.db, TODAY);
    expect(plan.manzilTotal).toBe(1);
    expect(plan.manzil.map((t) => t.pageNumber)).toContain(1);
  });
});

describe("buildDailyPlan", () => {
  it("menghitung tanpa menyentuh DB, dari baris yang dioper pemanggil", () => {
    // Meniru dashboard: status sudah ada di tangan (dari cache), tidak ada query.
    const settingsValue = parseSettings([{ key: "daily_load_limit", value: "5" }]);
    const slot = rotationSlot(TODAY, settingsValue.manzilCycleDays);
    const duePage = slot + 1;

    const plan = buildDailyPlan(
      {
        statuses: [
          {
            pageNumber: duePage,
            status: "lancar",
            memorizedAt: new Date("2026-01-01"),
            lastReviewedAt: new Date("2026-01-01"),
            intervalDays: 30,
            nextReviewDate: "2026-12-31",
          },
        ],
        logs: [],
        settings: settingsValue,
      },
      TODAY,
    );

    expect(plan.manzil.map((t) => t.pageNumber)).toEqual([duePage]);
    expect(plan.manzilTotal).toBe(1);
  });

  it("memakai log hari itu untuk daftar selesai", () => {
    const settingsValue = parseSettings([]);
    const plan = buildDailyPlan(
      {
        statuses: [
          {
            pageNumber: 3,
            status: "mutqin",
            memorizedAt: new Date("2026-10-19"),
            lastReviewedAt: new Date(TODAY),
            intervalDays: 2,
            nextReviewDate: "2026-10-23",
          },
        ],
        logs: [{ date: TODAY, pageNumber: 3, type: "sabqi", quality: "mutqin" }],
        settings: settingsValue,
      },
      TODAY,
    );

    expect(plan.sabqi).toHaveLength(0);
    expect(plan.done).toHaveLength(1);
    expect(plan.done[0].pageNumber).toBe(3);
  });
});
