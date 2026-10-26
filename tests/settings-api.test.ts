import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { settings, users } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

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
      console.warn(`[settings-api.test] cleanup dilewati: ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-settingsapi-"));
  ctx = createDb(`file:${join(dir, "s.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "s.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});

afterAll(() => {
  ctx.client.close();
  safeRm(dir);
});

beforeEach(async () => {
  await ctx.db.delete(settings);
});

async function get(withCookie = true) {
  const { getSettingsHandler } = await import("@/app/api/settings/handler");
  return getSettingsHandler(
    new Request("http://localhost/api/settings", { headers: withCookie ? { cookie } : {} }),
  );
}

async function patch(body: unknown, withCookie = true) {
  const { updateSettingsHandler } = await import("@/app/api/settings/handler");
  return updateSettingsHandler(
    new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/settings", () => {
  it("401 tanpa sesi", async () => {
    expect((await get(false)).status).toBe(401);
    expect((await patch({ dailyLoadLimit: 3 }, false)).status).toBe(401);
  });

  it("GET mengembalikan default saat tabel kosong", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toMatchObject({
      sabqiWindowDays: 14,
      manzilCycleDays: 7,
      dailyLoadLimit: 2,
      intervalCapDays: 30,
    });
  });

  it("PATCH menyimpan nilai dan GET membacanya kembali", async () => {
    const res = await patch({ dailyLoadLimit: 4, sabqiWindowDays: 21 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.dailyLoadLimit).toBe(4);
    expect(body.settings.sabqiWindowDays).toBe(21);

    const again = await (await get()).json();
    expect(again.settings.dailyLoadLimit).toBe(4);
    expect((await ctx.db.select().from(settings)).length).toBe(2);
  });

  it("PATCH bersifat parsial dan idempotent", async () => {
    await patch({ dailyLoadLimit: 3 });
    await patch({ dailyLoadLimit: 3 });
    expect((await ctx.db.select().from(settings)).length).toBe(1);
  });

  it("PATCH label tersimpan", async () => {
    const res = await patch({ labels: { sabaq: "Ziyadah", sabqi: "Sabqi", manzil: "Manzil" } });
    expect(res.status).toBe(200);
    expect((await res.json()).settings.labels.sabaq).toBe("Ziyadah");
  });

  it("400 untuk key tak dikenal dan nilai di luar rentang", async () => {
    expect((await patch({ unknownKey: 1 })).status).toBe(400);
    expect((await patch({ dailyLoadLimit: 0 })).status).toBe(400);
    expect((await patch({ intervalCapDays: 1 })).status).toBe(400);
  });
});
