import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users, pages, goals, memorizationStatus } from "@/db/schema";
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
      console.warn(`[progress-api.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-progressapi-"));
  ctx = createDb(`file:${join(dir, "p.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  await ctx.db.insert(pages).values([
    { pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 },
    { pageNumber: 2, juz: 1, surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 },
  ]);
  await ctx.db.insert(memorizationStatus).values({ pageNumber: 1, status: "lancar" });
  await ctx.db.insert(goals).values({ type: "khatam", targetPages: 604, startDate: "2026-01-01", deadline: "2026-12-31", active: true });
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "p.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

describe("progress API", () => {
  it("401 tanpa sesi", async () => {
    const { GET } = await import("@/app/api/progress/route");
    const res = await GET(new Request("http://localhost/api/progress"));
    expect(res.status).toBe(401);
  });
  it("200 dengan progress & projection", async () => {
    const { GET } = await import("@/app/api/progress/route");
    const res = await GET(new Request("http://localhost/api/progress", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress.memorizedPages).toBe(1);
    expect(body.projection).not.toBeNull();
    expect(body.projection.remainingPages).toBe(603);
  });
});
