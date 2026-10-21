"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle, WarningCircle } from "@phosphor-icons/react";
import { formatDateShortID } from "@/lib/tracker/date";

export interface GoalRow {
  id: number;
  type: string;
  targetPages: number;
  startDate: string;
  deadline: string | null;
  active: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  khatam: "Khatam",
  harian: "Harian",
};

export default function GoalList({ goals }: { goals: GoalRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggle(goal: GoalRow) {
    setError("");
    setBusyId(goal.id);
    const res = await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !goal.active }),
    });
    setBusyId(null);
    if (!res.ok) setError("Gagal mengubah status target");
    else router.refresh();
  }

  if (goals.length === 0) {
    return (
      <div className="card px-5 py-10 text-center">
        <p className="text-[14px] font-semibold text-ink">Belum ada target</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-soft">
          Buat target khatam di bawah untuk mulai melihat proyeksi dan status on-track.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[10px] bg-[#fdf0ee] px-3.5 py-3 text-[13px] font-medium text-[#8f2f26]"
        >
          <WarningCircle size={16} weight="fill" className="mt-px shrink-0" />
          {error}
        </p>
      )}

      <ul className="card-flush divide-y divide-line overflow-hidden">
        {goals.map((g) => (
          <li
            key={g.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 ${
              g.active ? "" : "bg-sunken/60"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
                {TYPE_LABELS[g.type] ?? g.type}
                <span className="tnum rounded-[6px] bg-sunken px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-soft">
                  {g.targetPages} hal
                </span>
              </p>
              <p className="mt-0.5 text-[12px] text-ink-faint">
                {formatDateShortID(g.startDate)}
                {" → "}
                {g.deadline ? formatDateShortID(g.deadline) : "tanpa tenggat"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => toggle(g)}
              disabled={busyId === g.id}
              aria-pressed={g.active}
              className={[
                "chip shrink-0 border transition-colors disabled:opacity-60",
                g.active
                  ? "border-brand-200 bg-brand-50 text-brand-800"
                  : "border-line-strong bg-surface text-ink-soft hover:bg-sunken",
              ].join(" ")}
            >
              {g.active ? (
                <CheckCircle size={13} weight="fill" />
              ) : (
                <Circle size={13} weight="bold" />
              )}
              {g.active ? "Aktif" : "Nonaktif"}
            </button>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[12px] text-ink-faint">
        Hanya satu target khatam yang bisa aktif pada satu waktu.
      </p>
    </div>
  );
}
