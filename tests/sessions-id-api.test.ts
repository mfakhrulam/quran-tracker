import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, users, memorizationStatus } from "@/db/schema";
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
      console.warn(`[sessions-id-api.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-sessid-"));
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

describe("sessions/[id] API", () => {
  it("PATCH mengubah kualitas dan recompute", async () => {
    const { createSessionLogHandler } = await import("@/app/api/sessions/handler");
    const { updateSessionLogHandler } = await import("@/app/api/sessions/[id]/handler");
    const created = await createSessionLogHandler(new Request("http://localhost/api/sessions", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru" }),
    }));
    const { session } = await created.json();

    const res = await updateSessionLogHandler(new Request(`http://localhost/api/sessions/${session.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "mutqin" }),
    }), session.id);
    expect(res.status).toBe(200);
    const status = await ctx.db.select().from(memorizationStatus);
    expect(status[0].status).toBe("mutqin");
  });

  it("DELETE menghapus log dan mengosongkan status", async () => {
    const { listSessionsHandler } = await import("@/app/api/sessions/handler");
    const { deleteSessionLogHandler } = await import("@/app/api/sessions/[id]/handler");
    const list = await listSessionsHandler(new Request("http://localhost/api/sessions", { headers: { cookie } }));
    const { sessions } = await list.json();
    const res = await deleteSessionLogHandler(new Request(`http://localhost/api/sessions/${sessions[0].id}`, {
      method: "DELETE", headers: { cookie },
    }), sessions[0].id);
    expect(res.status).toBe(200);
    expect(await ctx.db.select().from(memorizationStatus)).toHaveLength(0);
  });

  it("404 untuk id tidak ada", async () => {
    const { updateSessionLogHandler } = await import("@/app/api/sessions/[id]/handler");
    const res = await updateSessionLogHandler(new Request("http://localhost/api/sessions/9999", {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru" }),
    }), 9999);
    expect(res.status).toBe(404);
  });

  it("400 saat PATCH memakai tanggal masa depan", async () => {
    const { createSessionLogHandler } = await import("@/app/api/sessions/handler");
    const { updateSessionLogHandler } = await import("@/app/api/sessions/[id]/handler");
    const created = await createSessionLogHandler(new Request("http://localhost/api/sessions", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru" }),
    }));
    const { session } = await created.json();
    const res = await updateSessionLogHandler(new Request(`http://localhost/api/sessions/${session.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2099-01-01", pageNumber: 1, type: "sabaq", quality: "baru" }),
    }), session.id);
    expect(res.status).toBe(400);
  });

  it("400 saat PATCH memakai rentang ayat di luar halaman", async () => {
    const { createSessionLogHandler } = await import("@/app/api/sessions/handler");
    const { updateSessionLogHandler } = await import("@/app/api/sessions/[id]/handler");
    const created = await createSessionLogHandler(new Request("http://localhost/api/sessions", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru" }),
    }));
    const { session } = await created.json();
    const res = await updateSessionLogHandler(new Request(`http://localhost/api/sessions/${session.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru", ayahStart: 8, ayahEnd: 9 }),
    }), session.id);
    expect(res.status).toBe(400);
  });

  it("400 saat PATCH ke halaman yang tidak ada", async () => {
    const { createSessionLogHandler } = await import("@/app/api/sessions/handler");
    const { updateSessionLogHandler } = await import("@/app/api/sessions/[id]/handler");
    const created = await createSessionLogHandler(new Request("http://localhost/api/sessions", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru" }),
    }));
    const { session } = await created.json();
    const res = await updateSessionLogHandler(new Request(`http://localhost/api/sessions/${session.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 500, type: "sabaq", quality: "baru" }),
    }), session.id);
    expect(res.status).toBe(400);
  });

  it("PATCH tanpa durationMin mempertahankan nilai lama", async () => {
    const { createSessionLogHandler } = await import("@/app/api/sessions/handler");
    const { updateSessionLogHandler } = await import("@/app/api/sessions/[id]/handler");
    const created = await createSessionLogHandler(new Request("http://localhost/api/sessions", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru", durationMin: 30 }),
    }));
    const { session } = await created.json();
    expect(session.durationMin).toBe(30);

    const res = await updateSessionLogHandler(new Request(`http://localhost/api/sessions/${session.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "lancar" }),
    }), session.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.durationMin).toBe(30);
  });
});
