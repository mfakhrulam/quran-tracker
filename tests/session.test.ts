import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, verifySession, deleteSession, hashToken } from "@/lib/auth/session";

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
      console.warn(`[session.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let userId: number;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-sess-"));
  ctx = createDb(`file:${join(dir, "s.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  userId = inserted[0].id;
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

describe("session", () => {
  it("membuat sesi dengan token acak & hash tersimpan", async () => {
    const { token } = await createSession(ctx.db, userId);
    expect(token.length).toBeGreaterThan(20);
    const found = await verifySession(ctx.db, token);
    expect(found?.userId).toBe(userId);
    expect(hashToken(token)).not.toBe(token);
  });
  it("menolak token tidak dikenal", async () => {
    expect(await verifySession(ctx.db, "tidak-ada")).toBeNull();
  });
  it("menolak sesi kedaluwarsa", async () => {
    const { token } = await createSession(ctx.db, userId);
    const { sessions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await ctx.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.tokenHash, hashToken(token)));
    expect(await verifySession(ctx.db, token)).toBeNull();
  });
  it("deleteSession menghapus", async () => {
    const { token } = await createSession(ctx.db, userId);
    await deleteSession(ctx.db, token);
    expect(await verifySession(ctx.db, token)).toBeNull();
  });
});
