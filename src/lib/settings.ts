import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { settings as settingsTable } from "@/db/schema";
import type * as schema from "@/db/schema";

export interface AppSettings {
  sabqiWindowDays: number;
  manzilCycleDays: number;
  dailyLoadLimit: number;
  intervalCapDays: number;
  labels: Record<"sabaq" | "sabqi" | "manzil", string>;
}

/**
 * Rentang yang diterima setiap parameter numerik. Dipakai bersama oleh
 * `parseSettings` (clamp saat baca) dan `settingsPatchInput` (validasi API),
 * sehingga form dan API tidak mungkin berbeda pendapat soal batas.
 */
export const SETTINGS_LIMITS = {
  sabqiWindowDays: { min: 1, max: 90 },
  manzilCycleDays: { min: 1, max: 60 },
  dailyLoadLimit: { min: 1, max: 20 },
  intervalCapDays: { min: 2, max: 180 },
} as const;

export type NumericSettingKey = keyof typeof SETTINGS_LIMITS;

/**
 * Default tinggal di kode, bukan di database. Tabel `settings` hanya menyimpan
 * nilai yang benar-benar diubah pemilik, sehingga database lama (atau kosong)
 * tetap berjalan tanpa seed ulang ketika ada key baru.
 */
export const DEFAULT_SETTINGS: Record<string, string> = {
  sabqi_window_days: "14",
  manzil_cycle_days: "7",
  daily_load_limit: "2",
  interval_cap_days: "30",
  label_sabaq: "Sabaq",
  label_sabqi: "Sabqi",
  label_manzil: "Manzil",
};

export const NUMERIC_KEYS: Record<NumericSettingKey, string> = {
  sabqiWindowDays: "sabqi_window_days",
  manzilCycleDays: "manzil_cycle_days",
  dailyLoadLimit: "daily_load_limit",
  intervalCapDays: "interval_cap_days",
};

export const LABEL_KEYS = {
  sabaq: "label_sabaq",
  sabqi: "label_sabqi",
  manzil: "label_manzil",
} as const;

export function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function parseSettings(rows: { key: string; value: string }[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));

  function readNumber(key: NumericSettingKey): number {
    const dbKey = NUMERIC_KEYS[key];
    const fallback = Number(DEFAULT_SETTINGS[dbKey]);
    const limits = SETTINGS_LIMITS[key];
    return clampInt(map.get(dbKey), fallback, limits.min, limits.max);
  }

  function readLabel(key: keyof typeof LABEL_KEYS): string {
    const dbKey = LABEL_KEYS[key];
    const fallback = DEFAULT_SETTINGS[dbKey];
    const value = (map.get(dbKey) ?? fallback).trim();
    return value === "" ? fallback : value.slice(0, 24);
  }

  return {
    sabqiWindowDays: readNumber("sabqiWindowDays"),
    manzilCycleDays: readNumber("manzilCycleDays"),
    dailyLoadLimit: readNumber("dailyLoadLimit"),
    intervalCapDays: readNumber("intervalCapDays"),
    labels: {
      sabaq: readLabel("sabaq"),
      sabqi: readLabel("sabqi"),
      manzil: readLabel("manzil"),
    },
  };
}

export async function loadSettings(db: LibSQLDatabase<typeof schema>): Promise<AppSettings> {
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable);
  return parseSettings(rows);
}
