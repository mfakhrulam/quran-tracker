export const SESSION_TYPES = ["sabaq", "sabqi", "manzil"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const QUALITY_LEVELS = ["baru", "lancar", "mutqin", "lemah"] as const;
export type Quality = (typeof QUALITY_LEVELS)[number];

export const MEMO_STATUSES = ["belum", ...QUALITY_LEVELS] as const;
export type MemoStatus = (typeof MEMO_STATUSES)[number];

/**
 * Fill colours per memorization status. Kept as literal class strings so
 * Tailwind's scanner can see them. One hue family plus a single amber warning.
 */
export const QUALITY_COLORS: Record<string, string> = {
  belum: "bg-[#e8eae2]",
  baru: "bg-[#9dc4d4]",
  lancar: "bg-[#6fb894]",
  mutqin: "bg-[#216b4b]",
  lemah: "bg-[#dfae5a]",
};

/** Text colour that sits on top of the matching QUALITY_COLORS fill. */
export const QUALITY_TEXT: Record<string, string> = {
  belum: "text-[#7c877f]",
  baru: "text-[#20414d]",
  lancar: "text-[#143729]",
  mutqin: "text-white",
  lemah: "text-[#4a3410]",
};

export const QUALITY_LABELS: Record<string, string> = {
  belum: "Belum",
  baru: "Baru",
  lancar: "Lancar",
  mutqin: "Mutqin",
  lemah: "Lemah",
};

export const SESSION_TYPE_LABELS: Record<string, string> = {
  sabaq: "Sabaq",
  sabqi: "Sabqi",
  manzil: "Manzil",
};

export const SESSION_TYPE_HINTS: Record<string, string> = {
  sabaq: "Hafalan baru hari ini",
  sabqi: "Ulangan hafalan baru",
  manzil: "Murajaah hafalan lama",
};

export function isSessionType(value: string): value is SessionType {
  return (SESSION_TYPES as readonly string[]).includes(value);
}

export function isQuality(value: string): value is Quality {
  return (QUALITY_LEVELS as readonly string[]).includes(value);
}
