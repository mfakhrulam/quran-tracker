"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, CheckCircle, Info, WarningCircle } from "@phosphor-icons/react";
import { QUALITY_COLORS, QUALITY_LABELS, QUALITY_TEXT } from "@/lib/tracker/quality";
import { formatDateShortID } from "@/lib/tracker/date";
import type { DailyPlan, DailyTask } from "@/lib/tracker/schedule";

const ACTIONS = [
  { quality: "lancar", label: "Lancar", dot: "bg-[#6fb894]" },
  { quality: "mutqin", label: "Mutqin", dot: "bg-[#216b4b]" },
  { quality: "lemah", label: "Lemah", dot: "bg-[#dfae5a]" },
  { quality: "baru", label: "Baru", dot: "bg-[#9dc4d4]" },
] as const;

export interface PageMeta {
  surah: string;
  juz: number;
}

interface Props {
  today: string;
  plan: DailyPlan;
  labels: { sabaq: string; sabqi: string; manzil: string };
  pageMeta: Record<number, PageMeta>;
}

function TaskRow({
  task,
  pageMeta,
  busy,
  onMark,
}: {
  task: DailyTask;
  pageMeta: PageMeta | undefined;
  busy: boolean;
  onMark: (pageNumber: number, quality: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold tnum ${
          QUALITY_COLORS[task.status] ?? QUALITY_COLORS.belum
        } ${QUALITY_TEXT[task.status] ?? QUALITY_TEXT.belum}`}
      >
        {task.pageNumber}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">
          Halaman {task.pageNumber}
          {pageMeta && (
            <span className="ml-2 font-medium text-ink-faint">
              {pageMeta.surah} · Juz {pageMeta.juz}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-faint">
          {QUALITY_LABELS[task.status] ?? task.status} · interval {task.intervalDays} hari · jatuh
          tempo {formatDateShortID(task.nextReviewDate)}
          {task.overdueDays > 0 && ` · terlambat ${task.overdueDays} hari`}
        </p>
      </div>

      <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
        {ACTIONS.map((action) => (
          <button
            key={action.quality}
            type="button"
            disabled={busy}
            onClick={() => onMark(task.pageNumber, action.quality)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-2 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-40 sm:flex-none"
          >
            <span className={`h-2 w-2 rounded-full ${action.dot}`} aria-hidden="true" />
            {action.label}
          </button>
        ))}
      </div>
    </li>
  );
}

export default function MurajaahBoard({ today, plan, labels, pageMeta }: Props) {
  const router = useRouter();
  const [busyPage, setBusyPage] = useState<number | null>(null);
  const [bulk, setBulk] = useState(false);
  const [error, setError] = useState("");

  const total = plan.scheduled + plan.done.length;
  const pending = plan.sabqi.length + plan.manzil.length;

  async function submit(items: { pageNumber: number; quality: string }[]) {
    setError("");
    const res = await fetch("/api/murajaah/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: today, items }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Gagal menyimpan" }));
      setError(err.error ?? "Gagal menyimpan");
      return;
    }
    router.refresh();
  }

  async function mark(pageNumber: number, quality: string) {
    setBusyPage(pageNumber);
    await submit([{ pageNumber, quality }]);
    setBusyPage(null);
  }

  async function markAll() {
    const items = [...plan.sabqi, ...plan.manzil].map((task) => ({
      pageNumber: task.pageNumber,
      quality: "lancar",
    }));
    if (items.length === 0) return;
    setBulk(true);
    await submit(items);
    setBulk(false);
  }

  return (
    <div className="space-y-5">
      {/* Ringkasan ------------------------------------------------------ */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Tugas hari ini</p>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className="tnum text-[30px] font-extrabold leading-none tracking-tight text-ink">
                {plan.done.length}
              </span>
              <span className="text-sm font-semibold text-ink-faint">/ {total} halaman</span>
            </p>
            <p className="mt-2 text-[13px] text-ink-soft">
              {pending === 0
                ? "Tidak ada halaman yang jatuh tempo. Alhamdulillah."
                : `${plan.sabqi.length} ${labels.sabqi.toLowerCase()} dan ${plan.manzil.length} ${labels.manzil.toLowerCase()} menunggu.`}
            </p>
          </div>

          <button
            type="button"
            onClick={markAll}
            disabled={bulk || pending === 0}
            className="btn btn-primary"
          >
            <CheckCircle size={16} weight="bold" />
            {bulk ? "Menyimpan..." : "Tandai semua lancar"}
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-[12px] font-medium text-ink-faint">Jatuh tempo</dt>
            <dd className="tnum text-[17px] font-bold text-ink">{plan.totalDue}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-ink-faint">Ditampilkan</dt>
            <dd className="tnum text-[17px] font-bold text-ink">{plan.scheduled}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-ink-faint">Ditunda</dt>
            <dd
              className={`tnum text-[17px] font-bold ${plan.deferred > 0 ? "text-[#8a5a12]" : "text-ink"}`}
            >
              {plan.deferred}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-ink-faint">Batas harian</dt>
            <dd className="tnum text-[17px] font-bold text-ink">{plan.capacityPerDay}</dd>
          </div>
        </dl>
      </section>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[10px] bg-[#fdf0ee] px-3.5 py-3 text-[13px] font-medium text-[#8f2f26]"
        >
          <WarningCircle size={16} weight="fill" className="mt-px shrink-0" />
          {error}
        </p>
      )}

      {plan.deferred > 0 && (
        <p className="flex items-start gap-2 rounded-[10px] border border-line bg-sunken px-3.5 py-3 text-[13px] text-ink-soft">
          <Info size={16} className="mt-px shrink-0 text-ink-faint" />
          <span>
            {plan.deferred} halaman lain juga jatuh tempo hari ini. Tidak perlu dikejar semua —
            naikkan batas harian di{" "}
            <a href="/pengaturan" className="font-semibold text-brand-700 hover:text-brand-800">
              Pengaturan
            </a>{" "}
            kalau sedang longgar.
          </span>
        </p>
      )}

      {plan.capacityWarning && (
        <p className="flex items-start gap-2 rounded-[10px] border border-[#f0dcbd] bg-[#fbeedb] px-3.5 py-3 text-[13px] text-[#8a5a12]">
          <ArrowClockwise size={16} className="mt-px shrink-0" />
          <span>
            Dengan {plan.capacityPerDay} halaman/hari, seluruh hafalan manzil ({plan.manzilTotal}{" "}
            halaman) baru tersentuh tiap {plan.coverageDays} hari — siklus yang kamu tetapkan{" "}
            {plan.cycleDays} hari.
          </span>
        </p>
      )}

      {/* Sabqi ---------------------------------------------------------- */}
      <section className="card-flush overflow-hidden">
        <header className="flex items-baseline justify-between border-b border-line bg-sunken px-4 py-2.5">
          <h2 className="text-[13px] font-bold text-ink">{labels.sabqi}</h2>
          <span className="text-[12px] font-medium text-ink-faint">
            hafalan &lt; {plan.sabqiWindowDays} hari
          </span>
        </header>
        {plan.sabqi.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-faint">
            Tidak ada {labels.sabqi.toLowerCase()} yang jatuh tempo.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {plan.sabqi.map((task) => (
              <TaskRow
                key={task.pageNumber}
                task={task}
                pageMeta={pageMeta[task.pageNumber]}
                busy={busyPage === task.pageNumber || bulk}
                onMark={mark}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Manzil --------------------------------------------------------- */}
      <section className="card-flush overflow-hidden">
        <header className="flex items-baseline justify-between border-b border-line bg-sunken px-4 py-2.5">
          <h2 className="text-[13px] font-bold text-ink">{labels.manzil}</h2>
          <span className="text-[12px] font-medium text-ink-faint">
            giliran {plan.rotationSlot + 1} dari {plan.cycleDays}
          </span>
        </header>
        {plan.manzil.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-faint">
            Tidak ada {labels.manzil.toLowerCase()} yang jatuh tempo.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {plan.manzil.map((task) => (
              <TaskRow
                key={task.pageNumber}
                task={task}
                pageMeta={pageMeta[task.pageNumber]}
                busy={busyPage === task.pageNumber || bulk}
                onMark={mark}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Selesai -------------------------------------------------------- */}
      {plan.done.length > 0 && (
        <section className="card-flush overflow-hidden">
          <header className="border-b border-line bg-brand-50 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-brand-800">
              Selesai hari ini ({plan.done.length})
            </h2>
          </header>
          <ul className="divide-y divide-line">
            {plan.done.map((task) => (
              <li key={task.pageNumber} className="flex items-center gap-3 px-4 py-2.5">
                <CheckCircle size={16} weight="fill" className="shrink-0 text-brand-600" />
                <span className="tnum text-[13px] font-semibold text-ink">
                  Halaman {task.pageNumber}
                </span>
                <span className="text-[12px] text-ink-faint">
                  {pageMeta[task.pageNumber]?.surah ?? ""}
                </span>
                <span className="chip ml-auto bg-sunken text-ink-soft">
                  {QUALITY_LABELS[task.status] ?? task.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
