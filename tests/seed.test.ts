import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, users } from "@/db/schema";
import { seed } from "../scripts/seed-db";

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
      console.warn(`[seed.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-seed-"));
  ctx = createDb(`file:${join(dir, "seed.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

describe("seed", () => {
  it("mengisi 604 halaman dan 1 user", async () => {
    await seed(ctx.db, { ownerUsername: "owner", ownerPassword: "rahasia123" });
    expect((await ctx.db.select().from(pages)).length).toBe(604);
    expect((await ctx.db.select().from(users)).length).toBe(1);
  });
  it("idempotent saat dijalankan ulang", async () => {
    await seed(ctx.db, { ownerUsername: "owner", ownerPassword: "rahasia123" });
    expect((await ctx.db.select().from(pages)).length).toBe(604);
    expect((await ctx.db.select().from(users)).length).toBe(1);
  });
  it("tanpa kredensial owner, hanya seed halaman", async () => {
    const d2 = mkdtempSync(join(tmpdir(), "qt-seed2-"));
    const c2 = createDb(`file:${join(d2, "s.db")}`);
    await migrate(c2.db, { migrationsFolder: "./drizzle" });
    await seed(c2.db, {});
    expect((await c2.db.select().from(users)).length).toBe(0);
    c2.client.close();
    safeRm(d2);
  });
});
