import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRight, BookmarkSimple, Flame, Plus } from "@phosphor-icons/react/dist/ssr";
import { goals, restDays, sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { computeProgress } from "@/lib/tracker/progress";
import { computeProjection, STATUS_LABELS } from "@/lib/tracker/projection";
import { computeStreak, formatDateID, formatDateShortID, todayISO } from "@/lib/tracker/date";
import { QUALITY_COLORS, QUALITY_LABELS, QUALITY_TEXT, SESSION_TYPE_LABELS } from "@/lib/tracker/quality";
import ProgressRing from "@/components/ProgressRing";
import StatusChip from "@/components/StatusChip";

function pct(value: number): string {
  const p = value * 100;
  if (p === 0) return "0%";
  if (p < 1) return `${p.toFixed(2)}%`;
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="px-4 py-3.5 first:pl-0 last:pr-0 sm:px-5">
      <dt className="text-[12px] font-medium text-ink-faint">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1">
        <span className="tnum text-[19px] font-bold tracking-tight text-ink">{value}</span>
        {unit && <span className="text-[12px] font-medium text-ink-faint">{unit}</span>}
      </dd>
    </div>
  );
}

export default async function DashboardPage() {
  const db = getDb();
  const today = todayISO();

  const [progress, khatam, rest, recent, allDates] = await Promise.all([
    computeProgress(db),
    db.select().from(goals).where(and(eq(goals.type, "khatam"), eq(goals.active, true))),
    db.select().from(restDays),
    db.select().from(sessionsLog).orderBy(desc(sessionsLog.date), desc(sessionsLog.id)).limit(5),
    db.selectDistinct({ date: sessionsLog.date }).from(sessionsLog),
  ]);

  const restDates = rest.map((r) => r.date);
  const goal = khatam[0];

  const projection = goal
    ? computeProjection({
        targetPages: goal.targetPages,
        startDate: goal.startDate,
        deadline: goal.deadline,
        memorizedPages: progress.memorizedPages,
        restDays: restDates,
        today,
      })
    : null;

  const streak = computeStreak(
    allDates.map((d) => d.date),
    today,
    restDates,
  );
  const loggedToday = allDates.some((d) => d.date === today);
  const memorizedToday = recent.filter((r) => r.date === today).length;

  return (
    <div className="space-y-5">
      {/* Greeting -------------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
            Assalamu&apos;alaikum
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{formatDateID(today)}</p>
        </div>

        {projection?.daysRemainingToDeadline != null && (
          <div className="rounded-[10px] border border-line bg-surface px-3.5 py-2 text-right">
            <p className="text-[11px] font-medium text-ink-faint">Sisa waktu efektif</p>
            <p className="mt-0.5 flex items-baseline justify-end gap-1">
              <span className="tnum text-[19px] font-bold leading-none text-ink">
                {Math.max(projection.daysRemainingToDeadline, 0)}
              </span>
              <span className="text-[12px] font-medium text-ink-faint">hari</span>
            </p>
          </div>
        )}
      </div>

      {/* Hero: progress + status ----------------------------------------- */}
      <section className="card overflow-hidden rise" style={{ "--rise-delay": "60ms" } as React.CSSProperties}>
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr] md:items-center md:gap-8">
          <div className="flex items-center gap-5 md:block">
            <ProgressRing value={progress.percent} size={140} stroke={11}>
              <span className="tnum text-[26px] font-extrabold leading-none tracking-tight text-ink">
                {pct(progress.percent)}
              </span>
              <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Khatam
              </span>
            </ProgressRing>
            <div className="md:hidden">
              <p className="text-[12px] font-medium text-ink-faint">Halaman dihafal</p>
              <p className="mt-0.5 flex items-baseline gap-1">
                <span className="tnum text-2xl font-bold text-ink">{progress.memorizedPages}</span>
                <span className="text-sm font-medium text-ink-faint">/ {progress.totalPages}</span>
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-brand-700">
                <Flame size={14} weight={streak > 0 ? "fill" : "regular"} />
                {streak > 0 ? `${streak} hari beruntun` : "Belum beruntun"}
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <div className="hidden items-baseline justify-between md:flex">
              <div>
                <p className="text-[12px] font-medium text-ink-faint">Halaman dihafal</p>
                <p className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="tnum text-[30px] font-extrabold leading-none tracking-tight text-ink">
                    {progress.memorizedPages}
                  </span>
                  <span className="text-sm font-semibold text-ink-faint">
                    dari {progress.totalPages}
                  </span>
                </p>
              </div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-700">
                <Flame size={15} weight={streak > 0 ? "fill" : "regular"} />
                {streak > 0 ? `${streak} hari beruntun` : "Belum beruntun"}
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 divide-x divide-line border-t border-line pt-1 sm:grid-cols-3 md:mt-5">
              <Stat
                label="Pace saat ini"
                value={projection ? projection.pace.toFixed(2) : "0"}
                unit="hal/hari"
              />
              <Stat label="Sisa target" value={String(projection?.remainingPages ?? 604 - progress.memorizedPages)} unit="halaman" />
              <div className="col-span-2 sm:col-span-1">
                <Stat
                  label="Estimasi selesai"
                  value={
                    projection?.projectedFinishDate
                      ? formatDateShortID(projection.projectedFinishDate)
                      : "Belum bisa"
                  }
                />
              </div>
            </dl>
          </div>
        </div>

        {projection ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-sunken px-5 py-3 sm:px-6">
            <StatusChip status={projection.status} />
            <p className="text-[13px] text-ink-soft">
              {projection.status === "terlambat" && projection.requiredPace
                ? `Butuh ${projection.requiredPace.toFixed(2)} hal/hari untuk mengejar tenggat.`
                : projection.status === "on-track"
                  ? "Kamu di jalur yang tepat. Jaga ritmenya."
                  : projection.status === "belum-mulai"
                    ? "Belum ada setoran tercatat sejak target dimulai."
                    : "Target tanpa tenggat. Tambahkan tenggat agar proyeksi lebih jelas."}
            </p>
            <Link
              href="/target"
              className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:text-brand-800"
            >
              Atur target
              <ArrowRight size={13} weight="bold" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-sunken px-5 py-4 sm:px-6">
            <BookmarkSimple size={18} className="text-ink-faint" />
            <p className="text-[13px] text-ink-soft">Belum ada target khatam aktif.</p>
            <Link href="/target" className="ml-auto text-[13px] font-semibold text-brand-700 hover:text-brand-800">
              Buat target
            </Link>
          </div>
        )}
      </section>

      {/* Today + recent --------------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-5">
        <section
          className="card rise flex flex-col p-5 lg:col-span-2"
          style={{ "--rise-delay": "120ms" } as React.CSSProperties}
        >
          <h2 className="eyebrow">Hari ini</h2>
          {loggedToday ? (
            <>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="tnum text-[28px] font-extrabold leading-none tracking-tight text-brand-700">
                  {memorizedToday}
                </span>
                <span className="text-sm font-medium text-ink-soft">setoran tercatat</span>
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                Alhamdulillah, setoran hari ini sudah masuk. Tambah lagi kalau masih ada kesempatan.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-[15px] font-semibold text-ink">Belum ada setoran hari ini</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                Satu halaman hari ini lebih baik dari rencana sepuluh halaman besok.
              </p>
            </>
          )}

          {projection && projection.requiredPace !== null && (
            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-[12px] font-medium text-ink-faint">Butuh per hari</span>
              <span className="tnum text-[13px] font-bold text-ink">
                {projection.requiredPace.toFixed(2)} hal
              </span>
            </div>
          )}

          <Link
            href="/catat"
            className={`btn mt-auto w-full ${loggedToday ? "btn-secondary" : "btn-primary"}`}
          >
            <Plus size={16} weight="bold" />
            {loggedToday ? "Tambah setoran" : "Catat sekarang"}
          </Link>
        </section>

        <section
          className="card-flush rise lg:col-span-3"
          style={{ "--rise-delay": "180ms" } as React.CSSProperties}
        >
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="eyebrow">Setoran terakhir</h2>
            <Link
              href="/riwayat"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:text-brand-800"
            >
              Semua
              <ArrowRight size={13} weight="bold" />
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-medium text-ink-soft">Belum ada riwayat setoran.</p>
              <p className="mt-1 text-[13px] text-ink-faint">
                Setoran pertama akan muncul di sini.
              </p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[12px] font-bold tnum ${
                      QUALITY_COLORS[s.quality] ?? QUALITY_COLORS.belum
                    } ${QUALITY_TEXT[s.quality] ?? QUALITY_TEXT.belum}`}
                  >
                    {s.pageNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">
                      Halaman {s.pageNumber}
                      <span className="ml-2 font-medium text-ink-faint">
                        {SESSION_TYPE_LABELS[s.type] ?? s.type}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-faint">
                      {formatDateShortID(s.date)}
                      {s.ayahStart && s.ayahEnd ? ` · ayat ${s.ayahStart}-${s.ayahEnd}` : ""}
                    </p>
                  </div>
                  <span className="chip shrink-0 bg-sunken text-ink-soft">
                    {QUALITY_LABELS[s.quality] ?? s.quality}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {projection && (
        <p className="pb-2 text-center text-[12.5px] leading-relaxed text-ink-soft">
          Status dihitung dari {projection.effectiveDaysElapsed} hari efektif sejak target dimulai
          {projection.daysRemainingToDeadline !== null
            ? `, dengan ${Math.max(projection.daysRemainingToDeadline, 0)} hari efektif menuju tenggat`
            : ""}
          . {STATUS_LABELS[projection.status]}.
        </p>
      )}
    </div>
  );
}
