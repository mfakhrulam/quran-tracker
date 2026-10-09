import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

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
      console.warn(`[login-route.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string; let ctx: ReturnType<typeof createDb>;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-login-"));
  ctx = createDb(`file:${join(dir, "l.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  await ctx.db.insert(users).values({ username: "owner", passwordHash: await hashPassword("rahasia123") });
  process.env.DATABASE_URL = `file:${join(dir, "l.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

async function callLogin(body: unknown) {
  const { loginHandler } = await import("@/app/api/auth/login/route");
  return loginHandler(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(body),
  }));
}

describe("login handler", () => {
  it("berhasil dengan kredensial benar (200 + cookie)", async () => {
    const res = await callLogin({ username: "owner", password: "rahasia123" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("session=");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("gagal dengan password salah (401, tanpa cookie)", async () => {
    const res = await callLogin({ username: "owner", password: "salah" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("body tidak valid (400)", async () => {
    const res = await callLogin({ username: "" });
    expect(res.status).toBe(400);
  });
});
