import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { sessionsLog } from "@/db/schema";
import { checkSabaqAnchor, earliestSabaqDate } from "@/lib/tracker/sabaq-anchor";

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
      console.warn(`[sabaq-anchor.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-anchor-"));
  ctx = createDb(`file:${join(dir, "a.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

async function log(date: string, pageNumber: number, type: string) {
  const inserted = await ctx.db
    .insert(sessionsLog)
    .values({ date, pageNumber, type, quality: "lancar" })
    .returning();
  return inserted[0];
}

describe("jangkar tanggal sabaq (audit F-07)", () => {
  it("mengizinkan sabaq pertama", async () => {
    expect(await checkSabaqAnchor(ctx.db, 10, "2026-03-10")).toBeNull();
  });

  it("menolak sabaq yang memundurkan hafalan pertama", async () => {
    await log("2026-03-10", 20, "sabaq");
    const err = await checkSabaqAnchor(ctx.db, 20, "2026-03-01");
    expect(err).toContain("2026-03-10");
  });

  it("mengizinkan sabaq lebih baru dari hafalan pertama", async () => {
    await log("2026-03-10", 30, "sabaq");
    expect(await checkSabaqAnchor(ctx.db, 30, "2026-04-01")).toBeNull();
  });

  it("mengabaikan log yang sedang diedit (koreksi tanggal log pertama)", async () => {
    const first = await log("2026-03-15", 40, "sabaq");
    expect(await checkSabaqAnchor(ctx.db, 40, "2026-03-01", first.id)).toBeNull();
  });

  it("tidak menghitung review (sabqi/manzil) sebagai jangkar", async () => {
    await log("2026-03-01", 50, "manzil");
    await log("2026-03-05", 50, "sabaq");
    expect(await earliestSabaqDate(ctx.db, 50)).toBe("2026-03-05");
    expect(await checkSabaqAnchor(ctx.db, 50, "2026-03-02")).not.toBeNull();
  });
});
