import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { pages, users } from "@/db/schema";

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
});
