import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users, goals } from "@/db/schema";
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
      console.warn(`[goals-api.test] cleanup dilewati (file terkunci): ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-goals-"));
  ctx = createDb(`file:${join(dir, "g.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "g.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); safeRm(dir); });

async function create(body: unknown) {
  const { createGoalHandler } = await import("@/app/api/goals/handler");
  return createGoalHandler(new Request("http://localhost/api/goals", {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body),
  }));
}

describe("goals API", () => {
  it("401 tanpa sesi", async () => {
    const { createGoalHandler } = await import("@/app/api/goals/handler");
    const res = await createGoalHandler(new Request("http://localhost/api/goals", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "khatam", targetPages: 604, startDate: "2026-10-10" }),
    }));
    expect(res.status).toBe(401);
  });
  it("menolak tenggat sebelum tanggal mulai", async () => {
    const res = await create({ type: "khatam", targetPages: 604, startDate: "2026-10-10", deadline: "2026-10-01" });
    expect(res.status).toBe(400);
  });
  it("membuat goal khatam", async () => {
    const res = await create({ type: "khatam", targetPages: 604, startDate: "2026-10-10", deadline: "2026-12-31" });
    expect(res.status).toBe(201);
  });
  it("hanya satu goal khatam aktif", async () => {
    await create({ type: "khatam", targetPages: 604, startDate: "2026-10-11", deadline: "2026-12-31" });
    const rows = await ctx.db.select().from(goals);
    const activeKhatam = rows.filter((g) => g.type === "khatam" && g.active);
    expect(activeKhatam).toHaveLength(1);
  });
  it("PATCH mengaktifkan khatam menonaktifkan khatam aktif lain", async () => {
    const a = (await (await create({ type: "khatam", targetPages: 604, startDate: "2026-10-12", deadline: "2026-12-31" })).json()).goal;
    await create({ type: "khatam", targetPages: 604, startDate: "2026-10-13", deadline: "2026-12-31" });

    const { updateGoalHandler } = await import("@/app/api/goals/[id]/handler");
    const res = await updateGoalHandler(new Request(`http://localhost/api/goals/${a.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ active: true }),
    }), a.id);
    expect(res.status).toBe(200);

    const rows = await ctx.db.select().from(goals);
    const activeKhatam = rows.filter((g) => g.type === "khatam" && g.active);
    expect(activeKhatam).toHaveLength(1);
    expect(activeKhatam[0].id).toBe(a.id);
  });
});
