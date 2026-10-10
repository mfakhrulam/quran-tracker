import { and, eq } from "drizzle-orm";
import { goals } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { goalInput } from "@/lib/tracker/validation";

export async function listGoalsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  const rows = await getDb().select().from(goals).orderBy(goals.id);
  return Response.json({ goals: rows });
}

export async function createGoalHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = goalInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const data = parsed.data;

  const db = getDb();
  const inserted = await db.transaction(async (tx) => {
    if (data.type === "khatam") {
      await tx.update(goals).set({ active: false }).where(and(eq(goals.type, "khatam"), eq(goals.active, true)));
    }

    return tx
      .insert(goals)
      .values({
        type: data.type,
        targetPages: data.targetPages,
        startDate: data.startDate,
        deadline: data.deadline ?? null,
        active: true,
      })
      .returning();
  });
  return Response.json({ goal: inserted[0] }, { status: 201 });
}
