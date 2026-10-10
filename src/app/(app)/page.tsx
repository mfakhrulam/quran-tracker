import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { goals, restDays } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { computeProgress } from "@/lib/tracker/progress";
import { computeProjection } from "@/lib/tracker/projection";
import { todayISO } from "@/lib/tracker/date";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function DashboardPage() {
  const db = getDb();
  const progress = await computeProgress(db);
  const khatam = await db.select().from(goals).where(and(eq(goals.type, "khatam"), eq(goals.active, true)));
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Assalamu&apos;alaikum</h1>

      <section className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-sm font-medium text-neutral-500">Progres khatam</h2>
        <p className="mt-1 text-3xl font-semibold">{pct(progress.percent)}</p>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full bg-emerald-600" style={{ width: `${progress.percent * 100}%` }} />
        </div>
        <p className="mt-2 text-sm text-neutral-600">
          {progress.memorizedPages} dari {progress.totalPages} halaman
        </p>
      </section>

      <section className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-sm font-medium text-neutral-500">Status target</h2>
        {projection ? (
          <div className="mt-1 space-y-1 text-sm">
            <p>Status: <span className="font-medium">{projection.status}</span></p>
            <p>Pace saat ini: {projection.pace.toFixed(2)} halaman/hari</p>
            <p>Sisa: {projection.remainingPages} halaman</p>
            <p>Estimasi selesai: {projection.projectedFinishDate ?? "-"}</p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-neutral-600">
            Belum ada target khatam. <Link href="/target" className="text-emerald-700 underline">Buat target</Link>.
          </p>
        )}
      </section>

      <div className="flex gap-3">
        <Link href="/catat" className="rounded bg-emerald-600 px-4 py-2 text-white">Catat setoran</Link>
        <Link href="/peta" className="rounded border border-neutral-300 px-4 py-2">Lihat peta</Link>
      </div>
    </div>
  );
}
