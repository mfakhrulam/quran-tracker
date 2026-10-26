import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { memorizationStatus, pages, sessionsLog, users } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { addDays, todayISO } from "@/lib/tracker/date";

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
      console.warn(`[murajaah-api.test] cleanup dilewati: ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-murajaahapi-"));
  ctx = createDb(`file:${join(dir, "m.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  await ctx.db.insert(pages).values([
    { pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 },
    { pageNumber: 2, juz: 1, surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 },
  ]);
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "m.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});

afterAll(() => {
  ctx.client.close();
  safeRm(dir);
});

beforeEach(async () => {
  await ctx.db.delete(sessionsLog);
  await ctx.db.delete(memorizationStatus);
});

async function post(body: unknown, withCookie = true) {
  const { completeMurajaahHandler } = await import("@/app/api/murajaah/complete/handler");
  return completeMurajaahHandler(
    new Request("http://localhost/api/murajaah/complete", {
      method: "POST",
      headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/murajaah/complete", () => {
  const TODAY = todayISO();
  const YESTERDAY = addDays(TODAY, -1);

  it("401 tanpa sesi", async () => {
    const res = await post({ date: TODAY, items: [{ pageNumber: 1, quality: "lancar" }] }, false);
    expect(res.status).toBe(401);
  });

  it("400 saat payload tidak valid", async () => {
    expect((await post({ date: TODAY, items: [] })).status).toBe(400);
    expect((await post({ date: TODAY, items: [{ pageNumber: 999, quality: "lancar" }] })).status).toBe(400);
  });

  it("400 saat tanggal di masa depan", async () => {
    const res = await post({ date: "2099-01-01", items: [{ pageNumber: 1, quality: "lancar" }] });
    expect(res.status).toBe(400);
  });

  it("400 dan tidak menulis log saat halaman belum dihafal", async () => {
    const res = await post({ date: TODAY, items: [{ pageNumber: 1, quality: "lancar" }] });
    expect(res.status).toBe(400);
    expect((await ctx.db.select().from(sessionsLog)).length).toBe(0);
  });

  it("201, mencatat jenis sabqi untuk hafalan baru, dan memperbarui interval", async () => {
    await ctx.db.insert(sessionsLog).values({ date: YESTERDAY, pageNumber: 1, type: "sabaq", quality: "lancar" });
    await recomputeMemorizationStatus(ctx.db);

    const res = await post({ date: TODAY, items: [{ pageNumber: 1, quality: "mutqin" }] });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.items[0]).toMatchObject({ pageNumber: 1, type: "sabqi" });

    const logs = await ctx.db.select().from(sessionsLog);
    expect(logs).toHaveLength(2);
    expect(logs.find((l) => l.date === TODAY)?.type).toBe("sabqi");

    const [status] = await ctx.db.select().from(memorizationStatus);
    expect(status.intervalDays).toBe(2);
    expect(status.nextReviewDate).toBe(addDays(TODAY, 2));
  });

  it("201 dengan jenis manzil untuk hafalan lama", async () => {
    await ctx.db.insert(sessionsLog).values({ date: "2026-01-05", pageNumber: 2, type: "sabaq", quality: "mutqin" });
    await recomputeMemorizationStatus(ctx.db);

    const res = await post({ date: TODAY, items: [{ pageNumber: 2, quality: "lancar" }] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.items[0].type).toBe("manzil");
  });

  it("mendedupe item duplikat dalam satu request", async () => {
    await ctx.db.insert(sessionsLog).values({ date: YESTERDAY, pageNumber: 1, type: "sabaq", quality: "lancar" });
    await recomputeMemorizationStatus(ctx.db);

    const res = await post({
      date: TODAY,
      items: [
        { pageNumber: 1, quality: "lemah" },
        { pageNumber: 1, quality: "mutqin" },
      ],
    });
    expect(res.status).toBe(201);
    const logs = await ctx.db.select().from(sessionsLog);
    const today = logs.filter((l) => l.date === TODAY);
    expect(today).toHaveLength(1);
    expect(today[0].quality).toBe("mutqin");
  });

  it("mencatat banyak halaman sekaligus dalam satu request", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: YESTERDAY, pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: YESTERDAY, pageNumber: 2, type: "sabaq", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);

    const res = await post({
      date: TODAY,
      items: [
        { pageNumber: 1, quality: "lancar" },
        { pageNumber: 2, quality: "mutqin" },
      ],
    });
    expect(res.status).toBe(201);
    expect((await res.json()).created).toBe(2);
    expect((await ctx.db.select().from(sessionsLog)).length).toBe(4);
  });
});
