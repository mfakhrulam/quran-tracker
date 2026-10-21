import { STATUS_LABELS, type ProjectionStatus } from "@/lib/tracker/projection";

export const STATUS_STYLES: Record<ProjectionStatus, string> = {
  "on-track": "bg-brand-100 text-brand-800",
  "belum-mulai": "bg-[#e9edf0] text-[#445b66]",
  terlambat: "bg-[#fbeedb] text-[#8a5a12]",
  "tanpa-tenggat": "bg-[#eef0ea] text-ink-soft",
};

export default function StatusChip({ status }: { status: ProjectionStatus }) {
  return (
    <span className={`chip ${STATUS_STYLES[status]}`}>
      <span
        className={[
          "h-1.5 w-1.5 rounded-full",
          status === "on-track"
            ? "bg-brand-600"
            : status === "terlambat"
              ? "bg-[#c98a2a]"
              : status === "belum-mulai"
                ? "bg-[#6b8290]"
                : "bg-ink-faint",
        ].join(" ")}
        aria-hidden="true"
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
