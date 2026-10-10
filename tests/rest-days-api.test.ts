import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users, restDays } from "@/db/schema";
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
      console.warn(`[rest-days-api.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-rest-"));
  ctx = createDb(`file:${join(dir, "r.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "r.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

describe("rest-days API", () => {
  it("401 tanpa sesi", async () => {
    const { createRestDayHandler } = await import("@/app/api/rest-days/handler");
    const res = await createRestDayHandler(new Request("http://localhost/api/rest-days", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-10-10" }),
    }));
    expect(res.status).toBe(401);
  });
  it("menambah lalu menghapus hari libur", async () => {
    const { createRestDayHandler, deleteRestDayHandler } = await import("@/app/api/rest-days/handler");
    const created = await createRestDayHandler(new Request("http://localhost/api/rest-days", {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ date: "2026-10-10", reason: "sakit" }),
    }));
    expect(created.status).toBe(201);
    expect(await ctx.db.select().from(restDays)).toHaveLength(1);

    const removed = await deleteRestDayHandler(new Request("http://localhost/api/rest-days", {
      method: "DELETE", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ date: "2026-10-10" }),
    }));
    expect(removed.status).toBe(200);
    expect(await ctx.db.select().from(restDays)).toHaveLength(0);
  });
});
