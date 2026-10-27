import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";

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
      console.warn(`[logout-route.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string; let ctx: ReturnType<typeof createDb>;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-logout-"));
  ctx = createDb(`file:${join(dir, "l.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  process.env.DATABASE_URL = `file:${join(dir, "l.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

async function callLogout(cookie?: string) {
  const { logoutHandler } = await import("@/app/api/auth/logout/handler");
  return logoutHandler(new Request("http://localhost/api/auth/logout", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  }));
}

describe("logout handler", () => {
  it("redirect 303 ke /login (tanpa cookie)", async () => {
    const res = await callLogout();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
  });
  it("menghapus cookie sesi via Set-Cookie", async () => {
    const res = await callLogout();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
  });
  it("tetap redirect saat cookie sesi ada", async () => {
    const res = await callLogout("session=token-tidak-ada");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  // audit F-12: Location relatif supaya Host dari klien tidak dipakai membangun origin.
  it("tidak memakai Host request untuk membangun Location", async () => {
    const { logoutHandler } = await import("@/app/api/auth/logout/handler");
    const res = await logoutHandler(
      new Request("http://evil.example/api/auth/logout", { method: "POST" }),
    );
    expect(res.headers.get("location")).toBe("/login");
  });
  // audit F-08: form lintas situs tidak boleh menghapus sesi pengguna.
  it("menolak logout dari Origin lintas situs", async () => {
    const { logoutHandler } = await import("@/app/api/auth/logout/handler");
    const res = await logoutHandler(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(res.status).toBe(403);
  });
});
