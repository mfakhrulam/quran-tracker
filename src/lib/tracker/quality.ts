export const SESSION_TYPES = ["sabaq", "sabqi", "manzil"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const QUALITY_LEVELS = ["baru", "lancar", "mutqin", "lemah"] as const;
export type Quality = (typeof QUALITY_LEVELS)[number];

export const MEMO_STATUSES = ["belum", ...QUALITY_LEVELS] as const;
export type MemoStatus = (typeof MEMO_STATUSES)[number];

export const QUALITY_COLORS: Record<string, string> = {
  belum: "bg-neutral-200",
  baru: "bg-sky-300",
  lancar: "bg-emerald-400",
  mutqin: "bg-emerald-600",
  lemah: "bg-amber-400",
};

export function isSessionType(value: string): value is SessionType {
  return (SESSION_TYPES as readonly string[]).includes(value);
}

export function isQuality(value: string): value is Quality {
  return (QUALITY_LEVELS as readonly string[]).includes(value);
}
