import { goals, restDays } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { todayISO } from "@/lib/tracker/date";
import GoalForm from "@/components/GoalForm";
import GoalList from "@/components/GoalList";
import RestDayManager from "@/components/RestDayManager";

export default async function TargetPage() {
  const db = getDb();
  const today = todayISO();
  const [goalRows, restRows] = await Promise.all([
    db.select().from(goals).orderBy(goals.id),
    db.select().from(restDays).orderBy(restDays.date),
  ]);

  const activeKhatam = goalRows.find((g) => g.type === "khatam" && g.active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
          Target & hari libur
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Tentukan arah khatam dan hari-hari yang tidak dihitung sebagai hari efektif.
        </p>
      </div>

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow">Daftar target</h2>
          {activeKhatam && (
            <span className="text-[12px] font-medium text-ink-faint">
              Aktif: {activeKhatam.targetPages} halaman
            </span>
          )}
        </div>
        <GoalList goals={goalRows} />
      </section>

      <GoalForm today={today} />

      <RestDayManager today={today} restDays={restRows} />
    </div>
  );
}
