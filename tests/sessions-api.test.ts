import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, users } from "@/db/schema";
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
      console.warn(`[sessions-api.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-sessapi-"));
  ctx = createDb(`file:${join(dir, "s.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  await ctx.db.insert(pages).values({ pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 });
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "s.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

async function post(body: unknown, withCookie = true) {
  const { createSessionLogHandler } = await import("@/app/api/sessions/handler");
  return createSessionLogHandler(new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
}

describe("sessions API", () => {
  it("401 tanpa sesi", async () => {
    const res = await post({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "lancar" }, false);
    expect(res.status).toBe(401);
  });
  it("400 saat pageNumber di luar rentang", async () => {
    const res = await post({ date: "2026-10-10", pageNumber: 999, type: "sabaq", quality: "lancar" });
    expect(res.status).toBe(400);
  });
  it("400 saat tanggal di masa depan", async () => {
    const res = await post({ date: "2099-01-01", pageNumber: 1, type: "sabaq", quality: "lancar" });
    expect(res.status).toBe(400);
  });
  it("400 saat rentang ayat di luar halaman", async () => {
    const res = await post({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "lancar", ayahStart: 8, ayahEnd: 9 });
    expect(res.status).toBe(400);
  });
  it("400 saat tanggal kalender tidak valid", async () => {
    const res = await post({ date: "2026-13-45", pageNumber: 1, type: "sabaq", quality: "lancar" });
    expect(res.status).toBe(400);
  });
  it("400 saat query daftar tidak valid", async () => {
    const { listSessionsHandler } = await import("@/app/api/sessions/handler");
    const res = await listSessionsHandler(new Request("http://localhost/api/sessions?pageNumber=999", { headers: { cookie } }));
    expect(res.status).toBe(400);
  });
  it("201 saat sukses & memperbarui status hafalan", async () => {
    const res = await post({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "mutqin" });
    expect(res.status).toBe(201);
    const { listSessionsHandler } = await import("@/app/api/sessions/handler");
    const list = await listSessionsHandler(new Request("http://localhost/api/sessions", { headers: { cookie } }));
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.sessions.length).toBe(1);
  });
});
