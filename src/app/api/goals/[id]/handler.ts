import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { goals } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { guardAndReadJson } from "@/lib/http/csrf";

const patchSchema = z.object({ active: z.boolean() });

export async function updateGoalHandler(req: Request, id: number): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "ID tidak valid" }, { status: 400 });

  const body = await guardAndReadJson(req);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(goals).where(eq(goals.id, id));
  if (existing.length === 0) return Response.json({ error: "Goal tidak ditemukan" }, { status: 404 });

  if (parsed.data.active && existing[0].type === "khatam") {
    await db
      .update(goals)
      .set({ active: false })
      .where(and(eq(goals.type, "khatam"), eq(goals.active, true), ne(goals.id, id)));
  }

  const updated = await db.update(goals).set({ active: parsed.data.active }).where(eq(goals.id, id)).returning();
  return Response.json({ goal: updated[0] });
}
