import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { pages, users, sessionsLog } from "@/db/schema";

let dir: string;
let ctx: ReturnType<typeof createDb>;

function forceGc(): void {
  v8.setFlagsFromString("--expose_gc");
  const gc = vm.runInNewContext("gc") as () => void;
  v8.setFlagsFromString("--no-expose_gc");
  gc();
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-"));
  ctx = createDb(`file:${join(dir, "test.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterAll(() => {
  ctx.client.close();
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    forceGc();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      console.warn(`[db.test] cleanup dilewati (file terkunci): ${dir}`);
    }
  }
});

describe("schema", () => {
  it("insert & select page", async () => {
    await ctx.db.insert(pages).values({ pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 });
    const rows = await ctx.db.select().from(pages).where(eq(pages.pageNumber, 1));
    expect(rows[0]?.surahEnd).toBe(1);
  });
  it("username unik", async () => {
    await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" });
    await expect(ctx.db.insert(users).values({ username: "owner", passwordHash: "y" })).rejects.toThrow();
  });
  it("menyimpan log dengan rentang ayat opsional", async () => {
    await ctx.db.insert(sessionsLog).values({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "lancar" });
    await ctx.db.insert(sessionsLog).values({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "mutqin", ayahStart: 1, ayahEnd: 3 });
    const rows = await ctx.db.select().from(sessionsLog);
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.ayahStart === 1)?.ayahEnd).toBe(3);
  });
});
