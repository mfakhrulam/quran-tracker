import { and, eq } from "drizzle-orm";
import { goals, restDays } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { computeProgress } from "@/lib/tracker/progress";
import { computeProjection } from "@/lib/tracker/projection";
import { todayISO } from "@/lib/tracker/date";

export async function GET(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const db = getDb();
  const progress = await computeProgress(db);

  const khatam = await db
    .select()
    .from(goals)
    .where(and(eq(goals.type, "khatam"), eq(goals.active, true)));
  const rest = await db.select().from(restDays);

  const projection = khatam[0]
    ? computeProjection({
        targetPages: khatam[0].targetPages,
        startDate: khatam[0].startDate,
        deadline: khatam[0].deadline,
        memorizedPages: progress.memorizedPages,
        restDays: rest.map((r) => r.date),
        today: todayISO(),
      })
    : null;

  return Response.json({ progress, projection });
}
