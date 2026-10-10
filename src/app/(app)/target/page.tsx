import { goals, restDays } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { todayISO } from "@/lib/tracker/date";
import GoalForm from "@/components/GoalForm";
import RestDayManager from "@/components/RestDayManager";

export default async function TargetPage() {
  const db = getDb();
  const goalRows = await db.select().from(goals).orderBy(goals.id);
  const restRows = await db.select().from(restDays).orderBy(restDays.date);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Target & hari libur</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-600">Target aktif</h2>
        <ul className="divide-y divide-neutral-200 rounded-xl bg-white text-sm shadow">
          {goalRows.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="font-medium">{g.type}</span>
              <span>{g.targetPages} halaman</span>
              <span className="text-neutral-500">mulai {g.startDate}</span>
              <span className="text-neutral-500">tenggat {g.deadline ?? "-"}</span>
              <span className={`ml-auto rounded px-2 py-0.5 text-xs ${g.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>
                {g.active ? "aktif" : "nonaktif"}
              </span>
            </li>
          ))}
          {goalRows.length === 0 && <li className="p-3 text-neutral-500">Belum ada target.</li>}
        </ul>
      </section>

      <GoalForm today={todayISO()} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-600">Hari libur</h2>
        <RestDayManager today={todayISO()} restDays={restRows} />
      </section>
    </div>
  );
}
