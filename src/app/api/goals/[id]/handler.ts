import { eq } from "drizzle-orm";
import { z } from "zod";
import { goals } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";

const patchSchema = z.object({ active: z.boolean() });

export async function updateGoalHandler(req: Request, id: number): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "ID tidak valid" }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(goals).where(eq(goals.id, id));
  if (existing.length === 0) return Response.json({ error: "Goal tidak ditemukan" }, { status: 404 });

  const updated = await db.update(goals).set({ active: parsed.data.active }).where(eq(goals.id, id)).returning();
  return Response.json({ goal: updated[0] });
}
