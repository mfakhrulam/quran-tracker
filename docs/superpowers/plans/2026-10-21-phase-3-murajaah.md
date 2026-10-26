# Fase 3 (Murajaah Otomatis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan penjadwalan murajaah otomatis — jadwal per halaman (`interval_days`, `next_review_date`) yang diturunkan ulang dari riwayat, daftar tugas harian terbagi sabqi/manzil dengan batas kapasitas, pencatatan satu ketukan, dan halaman Pengaturan untuk mengubah parameter.

**Architecture:** Semua keputusan penjadwalan adalah fungsi murni di `src/lib/tracker/schedule.ts` (diuji Vitest tanpa DB), dibungkus loader tipis `src/lib/tracker/daily.ts` untuk dipakai halaman server. `recomputeMemorizationStatus` diperluas agar me-replay seluruh `sessions_log` dan menulis `interval_days` + `next_review_date` — jadi jadwal selalu konsisten walau log diedit, dihapus, atau di-backdate. Route mengikuti pola Fase 1/2 (`handler.ts` + `route.ts`).

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Drizzle ORM + `@libsql/client`, Zod, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-21-phase-3-murajaah-design.md` dan `rencana_pengembangan.md` (bagian 5.4, 9, 15).

## Global Constraints

- Bahasa aplikasi: **Indonesia** saja.
- **Tidak ada migrasi skema.** `memorization_status.next_review_date` dan `interval_days` sudah ada sejak Fase 1. Fase ini hanya mengisinya.
- Sumber kebenaran jadwal = **replay `sessions_log`**, bukan increment. Setiap create/update/delete log memanggil `recomputeMemorizationStatus(db)`.
- **"Hafalan" = halaman yang pernah disetor `sabaq`.** Status halaman tetap berasal dari kualitas `sabaq` terakhir (semantik Fase 2 tidak boleh berubah).
- Jenis log murajaah (`sabqi`/`manzil`) **ditentukan server** dari umur hafalan, bukan dari klien.
- Tanggal = teks `YYYY-MM-DD` zona Asia/Jakarta. Perbandingan tanggal memakai perbandingan string ISO.
- Semua route/halaman kecuali `/login` wajib terautentikasi; route baru balas 401 tanpa sesi.
- Semua input divalidasi Zod di server. Rahasia hanya dari env.
- Package manager: **pnpm**. Node ≥ 22.
- Patuhi pola repo: `handler.ts` (logika teruji) + `route.ts` (re-export); test memakai DB temp (`mkdtempSync` + `migrate` + `safeRm`).
- Tailwind: pakai token yang sudah ada (`card`, `btn`, `chip`, `eyebrow`, `input`, `field-label`, `text-ink*`, `brand-*`). Jangan menambah warna baru.

### Aturan performa (WAJIB — jangan regresi `bf64436`)

Commit `bf64436` memangkas dashboard dari 216ms ke 108ms lokal. Di produksi Netlify fungsi berjalan di `cmh` (Ohio) sementara Turso di `aws-ap-northeast-1`, jadi **satu round-trip ≈ 180ms dan jumlah round-trip adalah segalanya**. Setiap task di bawah harus mematuhi:

- **`db.batch()` untuk semua pembacaan per halaman.** Satu HTTP request, banyak statement. `batch()` menuntut tuple non-kosong — tangani kasus kosong eksplisit.
- **Tabel `pages` tidak boleh di-query dari DB.** Pakai `MUSHAF_PAGES` / `findPage()` / `PAGE_LITES` dari `@/lib/mushaf/pages`.
- **`memorization_status` dibaca lewat `getCachedStatuses()`** (`unstable_cache` + tag `PROGRESS_TAG`), bukan query langsung, untuk semua halaman render.
- **`recomputeMemorizationStatus` menulis lewat satu `db.batch()`.** Jangan pernah kembali ke `await insert` di dalam loop — itu N+1 yang dulu butuh ~60 detik di prod untuk 604 halaman.
- **`revalidateTag(PROGRESS_TAG)` hanya di `route.ts`**, tidak pernah di `handler.ts` (tes mengimpor handler tanpa request context dan `revalidateTag` melempar di luar scope).
- **Setiap route mutasi baru wajib memanggil `revalidateTag(PROGRESS_TAG)`** setelah respons sukses, kalau tidak dashboard/peta menyajikan angka basi.
- **`loadDailyTasks` tidak boleh menambah round-trip ke dashboard.** Dashboard mengoper baris status yang sudah di-cache lewat opsi `statuses`, dan settings + log hari ini digabung ke `db.batch()` yang sudah ada.

## Review Focus

1. **Backdate & edit log** — mengubah tanggal satu log `sabaq`/`manzil` harus menggeser `next_review_date` halaman itu; replay harus deterministik (urut `date`, lalu `id`), bukan hasil akumulasi increment.
2. **Halaman `lemah`** — review `lemah`/`baru` wajib mereset interval ke 1 sehingga halaman muncul lagi besok, dan halaman berinterval terkecil harus tampil paling atas.
3. **Kapasitas harian** — sabqi menang klaim kapasitas; manzil hanya mendapat sisa; sisa yang tidak tertampung dilaporkan sebagai `deferred`, bukan hilang diam-diam.
4. **Halaman yang sudah diulang hari ini** — tidak boleh muncul lagi sebagai tugas (mencegah dobel catat), tetapi harus muncul di daftar "selesai".
5. **Halaman belum dihafal** — memanggil `/api/murajaah/complete` untuk halaman tanpa `sabaq` harus 400 dan **tidak** membuat log.
6. **Regresi performa** — `recomputeMemorizationStatus` harus tetap satu `db.batch()` (bukan loop `await`), dan dashboard tidak boleh bertambah round-trip setelah ditambah kartu murajaah.

---

## File Structure

```
quran-tracker/
  scripts/
    recompute.ts                        # BARU — isi jadwal untuk data lama
  src/
    lib/
      settings.ts                       # BARU — default, clamp, parse, load
      tracker/
        schedule.ts                     # BARU — interval, replay, rotasi, buildDailyTasks
        daily.ts                        # BARU — loader tugas harian (DB → plan)
        validation.ts                   # + murajaahCompleteInput, settingsPatchInput
        derive-status.ts                # + tulis interval_days & next_review_date
    app/
      (app)/
        murajaah/page.tsx               # BARU
        pengaturan/page.tsx             # BARU
        page.tsx                        # + kartu murajaah
      api/
        murajaah/complete/
          handler.ts                    # BARU
          route.ts                      # BARU
        settings/
          handler.ts                    # BARU
          route.ts                      # BARU
    components/
      MurajaahBoard.tsx                 # BARU
      SettingsForm.tsx                  # BARU
      Nav.tsx                           # + Murajaah + ikon pengaturan
  tests/
    settings.test.ts                    # BARU
    tracker-schedule.test.ts            # BARU
    tracker-daily-tasks.test.ts         # BARU
    tracker-daily-loader.test.ts        # BARU
    murajaah-validation.test.ts         # BARU
    murajaah-api.test.ts                # BARU
    settings-api.test.ts                # BARU
    tracker-derive-status.test.ts       # + kasus interval
  package.json                          # + script db:recompute
  README.md                             # + bagian Fase 3
```

---

### Task 1: Modul `settings.ts`

**Objective:** Satu sumber kebenaran untuk parameter algoritma, dengan default di kode sehingga DB kosong tetap berfungsi.

**Files:**
- Create: `src/lib/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Produces:
  - `interface AppSettings { sabqiWindowDays; manzilCycleDays; dailyLoadLimit; intervalCapDays; labels: { sabaq; sabqi; manzil } }`
  - `SETTINGS_LIMITS`, `DEFAULT_SETTINGS: Record<string,string>`, `NUMERIC_KEYS`, `LABEL_KEYS`
  - `clampInt(raw, fallback, min, max): number`
  - `parseSettings(rows: {key: string; value: string}[]): AppSettings`
  - `loadSettings(db): Promise<AppSettings>`

- [ ] **Step 1: Tulis failing test**

`tests/settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clampInt, parseSettings, DEFAULT_SETTINGS } from "@/lib/settings";

describe("settings", () => {
  it("clampInt memakai fallback untuk nilai kosong / bukan angka", () => {
    expect(clampInt(undefined, 14, 1, 90)).toBe(14);
    expect(clampInt("", 14, 1, 90)).toBe(14);
    expect(clampInt("abc", 14, 1, 90)).toBe(14);
  });

  it("clampInt membatasi ke rentang dan membulatkan", () => {
    expect(clampInt("0", 14, 1, 90)).toBe(1);
    expect(clampInt("999", 14, 1, 90)).toBe(90);
    expect(clampInt("7.6", 14, 1, 90)).toBe(8);
  });

  it("parseSettings memakai default saat tabel kosong", () => {
    const s = parseSettings([]);
    expect(s.sabqiWindowDays).toBe(14);
    expect(s.manzilCycleDays).toBe(7);
    expect(s.dailyLoadLimit).toBe(2);
    expect(s.intervalCapDays).toBe(30);
    expect(s.labels).toEqual({ sabaq: "Sabaq", sabqi: "Sabqi", manzil: "Manzil" });
  });

  it("parseSettings menimpa default dengan baris DB", () => {
    const s = parseSettings([
      { key: "sabqi_window_days", value: "21" },
      { key: "manzil_cycle_days", value: "10" },
      { key: "daily_load_limit", value: "4" },
      { key: "interval_cap_days", value: "60" },
      { key: "label_sabaq", value: "Ziyadah" },
    ]);
    expect(s.sabqiWindowDays).toBe(21);
    expect(s.manzilCycleDays).toBe(10);
    expect(s.dailyLoadLimit).toBe(4);
    expect(s.intervalCapDays).toBe(60);
    expect(s.labels.sabaq).toBe("Ziyadah");
    expect(s.labels.sabqi).toBe("Sabqi");
  });

  it("parseSettings mengabaikan nilai di luar rentang dan label kosong", () => {
    const s = parseSettings([
      { key: "sabqi_window_days", value: "9999" },
      { key: "daily_load_limit", value: "0" },
      { key: "label_manzil", value: "   " },
    ]);
    expect(s.sabqiWindowDays).toBe(90);
    expect(s.dailyLoadLimit).toBe(1);
    expect(s.labels.manzil).toBe(DEFAULT_SETTINGS.label_manzil);
  });
});
```

- [ ] **Step 2: Jalankan test (harus gagal)**

Run: `pnpm test tests/settings.test.ts`
Expected: FAIL — modul `@/lib/settings` belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/settings.ts`:

```ts
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

/** Rentang yang diterima. Dipakai juga oleh validasi API. */
export const SETTINGS_LIMITS = {
  sabqiWindowDays: { min: 1, max: 90 },
  manzilCycleDays: { min: 1, max: 60 },
  dailyLoadLimit: { min: 1, max: 20 },
  intervalCapDays: { min: 2, max: 180 },
} as const;

export type NumericSettingKey = keyof typeof SETTINGS_LIMITS;

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
```

- [ ] **Step 4: Jalankan test (harus lulus)**

Run: `pnpm test tests/settings.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Tambah `interval_cap_days` ke seed**

Di `scripts/seed-db.ts`, tambahkan satu baris ke `DEFAULT_SETTINGS` (setelah `daily_load_limit`):

```ts
  interval_cap_days: "30",
```

- [ ] **Step 6: Verifikasi seed masih lulus**

Run: `pnpm test tests/seed.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/settings.ts tests/settings.test.ts scripts/seed-db.ts
git commit -m "feat: modul settings dengan default di kode dan clamp rentang"
```

---

### Task 2: `advanceInterval` + `rotationSlot`

**Objective:** Aturan pertumbuhan interval dan pemetaan rotasi manzil sebagai fungsi murni.

**Files:**
- Create: `src/lib/tracker/schedule.ts`
- Test: `tests/tracker-schedule.test.ts`

**Interfaces:**
- Produces:
  - `ROTATION_EPOCH = "2024-01-01"`
  - `advanceInterval(current: number, quality: Quality, cap: number): number`
  - `rotationSlot(date: string, cycleDays: number): number`

- [ ] **Step 1: Tulis failing test**

`tests/tracker-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { advanceInterval, rotationSlot, ROTATION_EPOCH } from "@/lib/tracker/schedule";

describe("advanceInterval", () => {
  it("mutqin menggandakan interval", () => {
    expect(advanceInterval(1, "mutqin", 30)).toBe(2);
    expect(advanceInterval(4, "mutqin", 30)).toBe(8);
    expect(advanceInterval(10, "mutqin", 30)).toBe(20);
  });

  it("lancar menambah setengah (dibulatkan ke atas)", () => {
    expect(advanceInterval(1, "lancar", 30)).toBe(2);
    expect(advanceInterval(4, "lancar", 30)).toBe(6);
    expect(advanceInterval(5, "lancar", 30)).toBe(8);
  });

  it("lemah dan baru mereset ke 1", () => {
    expect(advanceInterval(16, "lemah", 30)).toBe(1);
    expect(advanceInterval(16, "baru", 30)).toBe(1);
  });

  it("menghormati batas atas interval", () => {
    expect(advanceInterval(20, "mutqin", 30)).toBe(30);
    expect(advanceInterval(30, "mutqin", 30)).toBe(30);
  });

  it("tidak pernah menghasilkan 0 walau input aneh", () => {
    expect(advanceInterval(0, "lancar", 30)).toBe(2);
    expect(advanceInterval(-5, "mutqin", 30)).toBe(2);
  });
});

describe("rotationSlot", () => {
  it("deterministik dan selalu di dalam rentang siklus", () => {
    for (let i = 0; i < 30; i += 1) {
      const slot = rotationSlot("2026-10-21", 7);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(7);
    }
  });

  it("bertambah satu setiap hari lalu berputar", () => {
    const a = rotationSlot("2026-10-21", 7);
    const b = rotationSlot("2026-10-22", 7);
    expect(b).toBe((a + 1) % 7);
  });

  it("epoch sendiri berada di slot 0", () => {
    expect(rotationSlot(ROTATION_EPOCH, 7)).toBe(0);
  });

  it("tanggal sebelum epoch tetap menghasilkan slot valid", () => {
    const slot = rotationSlot("2023-12-31", 7);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(7);
  });
});
```

- [ ] **Step 2: Jalankan test (harus gagal)**

Run: `pnpm test tests/tracker-schedule.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/tracker/schedule.ts` (bagian pertama — sisanya ditambahkan di Task 3 & 4):

```ts
import { addDays, daysBetween } from "./date";
import type { Quality } from "./quality";

/** Titik acuan tetap untuk rotasi manzil. Tanpa state, aman dihitung ulang kapan pun. */
export const ROTATION_EPOCH = "2024-01-01";

/**
 * Interval berikutnya untuk sebuah halaman.
 * mutqin  -> x2
 * lancar  -> +50%
 * baru    -> 1 (belum stabil, ulang besok)
 * lemah   -> 1 (banyak salah, ulang besok)
 */
export function advanceInterval(current: number, quality: Quality, cap: number): number {
  const base = Math.max(1, Math.round(current));
  let next: number;
  switch (quality) {
    case "mutqin":
      next = base * 2;
      break;
    case "lancar":
      next = base + Math.ceil(base / 2);
      break;
    default:
      next = 1;
      break;
  }
  return Math.max(1, Math.min(Math.max(1, cap), next));
}

/** Slot rotasi manzil untuk sebuah tanggal: (tanggal - epoch) mod siklus. */
export function rotationSlot(date: string, cycleDays: number): number {
  const cycle = Math.max(1, Math.round(cycleDays));
  const offset = daysBetween(ROTATION_EPOCH, date);
  return ((offset % cycle) + cycle) % cycle;
}
```

- [ ] **Step 4: Jalankan test (harus lulus)**

Run: `pnpm test tests/tracker-schedule.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker/schedule.ts tests/tracker-schedule.test.ts
git commit -m "feat: aturan interval murajaah dan slot rotasi manzil"
```

---

### Task 3: `replayPageSchedule`

**Objective:** Menurunkan jadwal setiap halaman dari riwayat log secara deterministik.

**Files:**
- Modify: `src/lib/tracker/schedule.ts`
- Test: `tests/tracker-schedule.test.ts` (tambahkan `describe`)

**Interfaces:**
- Consumes: `advanceInterval` (Task 2), `addDays` dari `./date`.
- Produces:
  - `interface ScheduleLog { id: number; date: string; pageNumber: number; type: SessionType; quality: Quality }`
  - `interface PageSchedule { pageNumber; status: Quality; memorizedAt; lastReviewedAt; intervalDays; nextReviewDate }`
  - `replayPageSchedule(logs: ScheduleLog[], cap: number): Map<number, PageSchedule>`

- [ ] **Step 1: Tulis failing test**

Tambahkan ke `tests/tracker-schedule.test.ts`:

```ts
import { replayPageSchedule, type ScheduleLog } from "@/lib/tracker/schedule";

function log(id: number, date: string, pageNumber: number, type: ScheduleLog["type"], quality: ScheduleLog["quality"]): ScheduleLog {
  return { id, date, pageNumber, type, quality };
}

describe("replayPageSchedule", () => {
  it("sabaq pertama memulai interval 1 dan jatuh tempo besok", () => {
    const map = replayPageSchedule([log(1, "2026-10-01", 5, "sabaq", "lancar")], 30);
    const s = map.get(5)!;
    expect(s.memorizedAt).toBe("2026-10-01");
    expect(s.lastReviewedAt).toBe("2026-10-01");
    expect(s.status).toBe("lancar");
    expect(s.intervalDays).toBe(1);
    expect(s.nextReviewDate).toBe("2026-10-02");
  });

  it("review berikutnya memajukan interval sesuai kualitas", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 5, "sabaq", "lancar"),
        log(2, "2026-10-02", 5, "sabqi", "mutqin"),
        log(3, "2026-10-04", 5, "sabqi", "lancar"),
      ],
      30,
    );
    const s = map.get(5)!;
    expect(s.intervalDays).toBe(3); // 1 -> 2 (mutqin) -> 3 (lancar: 2 + 1)
    expect(s.lastReviewedAt).toBe("2026-10-04");
    expect(s.nextReviewDate).toBe("2026-10-07");
  });

  it("status mengikuti kualitas sabaq terakhir, bukan review", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 5, "sabaq", "mutqin"),
        log(2, "2026-10-05", 5, "manzil", "lemah"),
      ],
      30,
    );
    const s = map.get(5)!;
    expect(s.status).toBe("mutqin");
    expect(s.intervalDays).toBe(1);
    expect(s.nextReviewDate).toBe("2026-10-06");
  });

  it("urutan log diacak tetap menghasilkan jadwal sama", () => {
    const logs = [
      log(1, "2026-10-01", 5, "sabaq", "lancar"),
      log(2, "2026-10-02", 5, "sabqi", "mutqin"),
      log(3, "2026-10-04", 5, "sabqi", "lancar"),
    ];
    const a = replayPageSchedule(logs, 30).get(5)!;
    const b = replayPageSchedule([logs[2], logs[0], logs[1]], 30).get(5)!;
    expect(b).toEqual(a);
  });

  it("log sabqi/manzil sebelum sabaq diabaikan", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 7, "manzil", "lancar"),
        log(2, "2026-10-03", 7, "sabaq", "baru"),
      ],
      30,
    );
    const s = map.get(7)!;
    expect(s.memorizedAt).toBe("2026-10-03");
    expect(s.intervalDays).toBe(1);
  });

  it("sabaq ulang pada halaman yang sama juga memajukan interval", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 9, "sabaq", "lancar"),
        log(2, "2026-10-03", 9, "sabaq", "mutqin"),
      ],
      30,
    );
    const s = map.get(9)!;
    expect(s.status).toBe("mutqin");
    expect(s.intervalDays).toBe(2);
    expect(s.nextReviewDate).toBe("2026-10-05");
  });

  it("menghormati batas interval", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 11, "sabaq", "lancar"),
        log(2, "2026-10-02", 11, "sabqi", "mutqin"),
        log(3, "2026-10-04", 11, "sabqi", "mutqin"),
        log(4, "2026-10-08", 11, "sabqi", "mutqin"),
      ],
      3,
    );
    expect(map.get(11)!.intervalDays).toBe(3);
  });

  it("halaman tanpa sabaq tidak masuk hasil", () => {
    const map = replayPageSchedule([log(1, "2026-10-01", 12, "sabqi", "lancar")], 30);
    expect(map.size).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan test (harus gagal)**

Run: `pnpm test tests/tracker-schedule.test.ts`
Expected: FAIL — `replayPageSchedule` belum ada.

- [ ] **Step 3: Implementasi**

Tambahkan ke `src/lib/tracker/schedule.ts` — ubah baris import tipe di atas file menjadi `import type { Quality, SessionType } from "./quality";` (karena `ScheduleLog` memakai `SessionType`), lalu tambahkan:

```ts
export interface ScheduleLog {
  id: number;
  date: string;
  pageNumber: number;
  type: SessionType;
  quality: Quality;
}

export interface PageSchedule {
  pageNumber: number;
  status: Quality;
  memorizedAt: string;
  lastReviewedAt: string;
  intervalDays: number;
  nextReviewDate: string;
}

function compareLogs(a: ScheduleLog, b: ScheduleLog): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id - b.id;
}

/**
 * Menurunkan jadwal setiap halaman dari riwayat log.
 * Deterministik: log diurutkan (tanggal, id) lalu di-replay dari nol,
 * sehingga hasilnya sama berapa kali pun dipanggil dan konsisten
 * walau log diedit/dihapus/di-backdate.
 */
export function replayPageSchedule(
  logs: ScheduleLog[],
  cap: number,
): Map<number, PageSchedule> {
  const ordered = [...logs].sort(compareLogs);
  const result = new Map<number, PageSchedule>();

  for (const entry of ordered) {
    const current = result.get(entry.pageNumber);

    if (!current) {
      // Hafalan hanya lahir dari sabaq. Review sebelum sabaq tidak dihitung.
      if (entry.type !== "sabaq") continue;
      result.set(entry.pageNumber, {
        pageNumber: entry.pageNumber,
        status: entry.quality,
        memorizedAt: entry.date,
        lastReviewedAt: entry.date,
        intervalDays: 1,
        nextReviewDate: addDays(entry.date, 1),
      });
      continue;
    }

    const intervalDays = advanceInterval(current.intervalDays, entry.quality, cap);
    result.set(entry.pageNumber, {
      pageNumber: entry.pageNumber,
      status: entry.type === "sabaq" ? entry.quality : current.status,
      memorizedAt: current.memorizedAt,
      lastReviewedAt: entry.date,
      intervalDays,
      nextReviewDate: addDays(entry.date, intervalDays),
    });
  }

  return result;
}
```

- [ ] **Step 4: Jalankan test (harus lulus)**

Run: `pnpm test tests/tracker-schedule.test.ts`
Expected: PASS (17 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker/schedule.ts tests/tracker-schedule.test.ts
git commit -m "feat: replay jadwal murajaah per halaman dari riwayat log"
```

---

### Task 4: `buildDailyTasks`

**Objective:** Menyusun tugas hari ini: pemisahan jalur, prioritas, kapasitas, dan laporan tertunda.

**Files:**
- Modify: `src/lib/tracker/schedule.ts`
- Test: `tests/tracker-daily-tasks.test.ts`

**Interfaces:**
- Consumes: `rotationSlot`, `PageSchedule`, `AppSettings`.
- Produces:
  - `interface ReviewedToday { pageNumber: number; quality: Quality; type: SessionType }`
  - `interface DailyTask { pageNumber; lane: "sabqi" | "manzil"; status: Quality; memorizedAt; lastReviewedAt; intervalDays; nextReviewDate; overdueDays }`
  - `interface DailyPlan { date; sabqi; manzil; done; dueSabqi; dueManzil; totalDue; scheduled; deferred; manzilTotal; coverageDays; capacityWarning; capacityPerDay; cycleDays; sabqiWindowDays; rotationSlot }`
  - `buildDailyTasks({ today, schedules, reviewedToday, settings }): DailyPlan`

- [ ] **Step 1: Tulis failing test**

`tests/tracker-daily-tasks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDailyTasks, rotationSlot, type PageSchedule } from "@/lib/tracker/schedule";
import { parseSettings, type AppSettings } from "@/lib/settings";

const TODAY = "2026-10-21";

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...parseSettings([]), ...overrides };
}

function page(pageNumber: number, memorizedAt: string, intervalDays: number, nextReviewDate: string, status: PageSchedule["status"] = "lancar"): PageSchedule {
  return { pageNumber, status, memorizedAt, lastReviewedAt: memorizedAt, intervalDays, nextReviewDate };
}

describe("buildDailyTasks", () => {
  it("memisahkan sabqi (baru) dan manzil (lama) berdasarkan umur hafalan", () => {
    const s = settings({ manzilCycleDays: 7 });
    const slot = rotationSlot(TODAY, 7);
    // Pilih halaman yang slot rotasinya BUKAN hari ini, supaya test tidak bergantung tanggal.
    const offSlot = [2, 3, 4, 5, 6, 7, 8].find((p) => (p - 1) % 7 !== slot) ?? 8;

    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [
        page(1, "2026-10-18", 1, "2026-10-19"), // 3 hari -> sabqi, jatuh tempo
        page(offSlot, "2026-08-01", 30, "2026-12-31"), // lama, belum slotnya, belum jatuh tempo
      ],
      reviewedToday: [],
      settings: s,
    });
    expect(plan.sabqi.map((t) => t.pageNumber)).toEqual([1]);
    expect(plan.manzil).toHaveLength(0);
    expect(plan.manzilTotal).toBe(1);
  });

  it("halaman manzil yang slot rotasinya hari ini masuk tugas", () => {
    const s = settings({ manzilCycleDays: 7 });
    const slot = rotationSlot(TODAY, 7);
    const duePage = slot + 1; // (pageNumber - 1) % 7 === slot
    const otherPage = ((slot + 1) % 7) + 1;
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [
        page(duePage, "2026-01-01", 30, "2026-12-31"),
        page(otherPage, "2026-01-01", 30, "2026-12-31"),
      ],
      reviewedToday: [],
      settings: s,
    });
    expect(plan.manzil.map((t) => t.pageNumber)).toEqual([duePage]);
  });

  it("manzil dengan interval jatuh tempo tetap muncul walau bukan slotnya", () => {
    const s = settings({ manzilCycleDays: 7 });
    const slot = rotationSlot(TODAY, 7);
    const offSlot = ((slot + 3) % 7) + 1;
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [page(offSlot, "2026-01-01", 1, "2026-10-20")],
      reviewedToday: [],
      settings: s,
    });
    expect(plan.manzil.map((t) => t.pageNumber)).toEqual([offSlot]);
  });

  it("sabqi menang kapasitas, manzil mendapat sisa, sisanya dilaporkan deferred", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [
        page(1, "2026-10-20", 1, "2026-10-21"),
        page(2, "2026-10-20", 1, "2026-10-21"),
        page(3, "2026-10-20", 1, "2026-10-21"),
        page(4, "2026-01-01", 1, "2026-10-01"),
        page(5, "2026-01-01", 1, "2026-10-01"),
      ],
      reviewedToday: [],
      settings: settings({ dailyLoadLimit: 2 }),
    });
    expect(plan.sabqi).toHaveLength(2);
    expect(plan.manzil).toHaveLength(0);
    expect(plan.dueSabqi).toBe(3);
    expect(plan.dueManzil).toBe(2);
    expect(plan.totalDue).toBe(5);
    expect(plan.scheduled).toBe(2);
    expect(plan.deferred).toBe(3);
  });

  it("halaman yang sudah diulang hari ini tidak muncul lagi, tetapi masuk daftar selesai", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [page(1, "2026-10-20", 1, "2026-10-21"), page(2, "2026-10-20", 1, "2026-10-21")],
      reviewedToday: [{ pageNumber: 1, quality: "mutqin", type: "sabqi" }],
      settings: settings(),
    });
    expect(plan.sabqi.map((t) => t.pageNumber)).toEqual([2]);
    expect(plan.done).toHaveLength(1);
    expect(plan.done[0]).toMatchObject({ pageNumber: 1, status: "mutqin", lane: "sabqi" });
  });

  it("sabaq hari ini tidak dihitung sebagai murajaah selesai", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [page(1, "2026-10-21", 1, "2026-10-22")],
      reviewedToday: [{ pageNumber: 1, quality: "lancar", type: "sabaq" }],
      settings: settings(),
    });
    expect(plan.done).toHaveLength(0);
    expect(plan.sabqi).toHaveLength(0);
  });

  it("prioritas: interval terkecil dulu, lalu status paling lemah, lalu terlambat, lalu nomor halaman", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [
        page(10, "2026-10-19", 8, "2026-10-21", "mutqin"),
        page(11, "2026-10-19", 1, "2026-10-21", "lancar"),
        page(12, "2026-10-19", 1, "2026-10-21", "lemah"),
        page(13, "2026-10-19", 1, "2026-10-15", "lancar"),
        page(14, "2026-10-19", 1, "2026-10-18", "lemah"),
      ],
      reviewedToday: [],
      settings: settings({ dailyLoadLimit: 20 }),
    });
    expect(plan.sabqi.map((t) => t.pageNumber)).toEqual([14, 12, 13, 11, 10]);
  });

  it("menghitung cakupan siklus dan memberi peringatan bila kapasitas tidak cukup", () => {
    const many = Array.from({ length: 16 }, (_, i) => page(i + 1, "2026-01-01", 30, "2026-12-31"));
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: many,
      reviewedToday: [],
      settings: settings({ dailyLoadLimit: 2, manzilCycleDays: 7 }),
    });
    expect(plan.manzilTotal).toBe(16);
    expect(plan.coverageDays).toBe(8);
    expect(plan.capacityWarning).toBe(true);
  });

  it("tanpa halaman manzil, tidak ada peringatan kapasitas", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [page(1, "2026-10-20", 1, "2026-10-21")],
      reviewedToday: [],
      settings: settings(),
    });
    expect(plan.manzilTotal).toBe(0);
    expect(plan.coverageDays).toBe(0);
    expect(plan.capacityWarning).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test (harus gagal)**

Run: `pnpm test tests/tracker-daily-tasks.test.ts`
Expected: FAIL — `buildDailyTasks` belum ada.

- [ ] **Step 3: Implementasi**

Tambahkan ke `src/lib/tracker/schedule.ts` — **`import type { AppSettings } from "@/lib/settings";` diletakkan di blok import paling atas file** (jangan di tengah), lalu tipe & fungsi berikut:

```ts
export interface ReviewedToday {
  pageNumber: number;
  quality: Quality;
  type: SessionType;
}

export interface DailyTask {
  pageNumber: number;
  lane: "sabqi" | "manzil";
  status: Quality;
  memorizedAt: string;
  lastReviewedAt: string;
  intervalDays: number;
  nextReviewDate: string;
  overdueDays: number;
}

export interface DailyPlan {
  date: string;
  sabqi: DailyTask[];
  manzil: DailyTask[];
  done: DailyTask[];
  dueSabqi: number;
  dueManzil: number;
  totalDue: number;
  scheduled: number;
  deferred: number;
  manzilTotal: number;
  coverageDays: number;
  capacityWarning: boolean;
  capacityPerDay: number;
  cycleDays: number;
  sabqiWindowDays: number;
  rotationSlot: number;
}

const STATUS_RANK: Record<Quality, number> = { lemah: 0, baru: 1, lancar: 2, mutqin: 3 };

function toTask(schedule: PageSchedule, lane: "sabqi" | "manzil", today: string): DailyTask {
  return {
    ...schedule,
    lane,
    overdueDays: Math.max(0, daysBetween(schedule.nextReviewDate, today)),
  };
}

/** Paling rapuh dulu: interval terkecil, status terlemah, terlambat paling lama, nomor terkecil. */
function compareTasks(a: DailyTask, b: DailyTask): number {
  if (a.intervalDays !== b.intervalDays) return a.intervalDays - b.intervalDays;
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
  return a.pageNumber - b.pageNumber;
}

export function buildDailyTasks(input: {
  today: string;
  schedules: PageSchedule[];
  reviewedToday: ReviewedToday[];
  settings: AppSettings;
}): DailyPlan {
  const { today, schedules, reviewedToday, settings } = input;
  const cycle = Math.max(1, settings.manzilCycleDays);
  const limit = Math.max(1, settings.dailyLoadLimit);
  const slot = rotationSlot(today, cycle);

  const reviewedPages = new Set(reviewedToday.map((r) => r.pageNumber));
  const byPage = new Map(schedules.map((s) => [s.pageNumber, s]));

  const sabqiDue: DailyTask[] = [];
  const manzilDue: DailyTask[] = [];
  let manzilTotal = 0;

  for (const schedule of schedules) {
    const isSabqi = daysBetween(schedule.memorizedAt, today) < settings.sabqiWindowDays;
    const dueByInterval = schedule.nextReviewDate <= today;

    if (!isSabqi) {
      manzilTotal += 1;
      if (reviewedPages.has(schedule.pageNumber)) continue;
      const dueByRotation = (schedule.pageNumber - 1) % cycle === slot;
      if (dueByRotation || dueByInterval) manzilDue.push(toTask(schedule, "manzil", today));
      continue;
    }

    if (reviewedPages.has(schedule.pageNumber)) continue;
    if (dueByInterval) sabqiDue.push(toTask(schedule, "sabqi", today));
  }

  sabqiDue.sort(compareTasks);
  manzilDue.sort(compareTasks);

  const sabqi = sabqiDue.slice(0, limit);
  const manzil = manzilDue.slice(0, Math.max(0, limit - sabqi.length));

  const done: DailyTask[] = reviewedToday
    .filter((r) => r.type !== "sabaq")
    .map((r) => {
      const schedule = byPage.get(r.pageNumber);
      if (!schedule) return null;
      const lane: "sabqi" | "manzil" =
        daysBetween(schedule.memorizedAt, today) < settings.sabqiWindowDays ? "sabqi" : "manzil";
      return { ...toTask(schedule, lane, today), status: r.quality };
    })
    .filter((t): t is DailyTask => t !== null)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const coverageDays = manzilTotal === 0 ? 0 : Math.ceil(manzilTotal / limit);
  const totalDue = sabqiDue.length + manzilDue.length;

  return {
    date: today,
    sabqi,
    manzil,
    done,
    dueSabqi: sabqiDue.length,
    dueManzil: manzilDue.length,
    totalDue,
    scheduled: sabqi.length + manzil.length,
    deferred: totalDue - sabqi.length - manzil.length,
    manzilTotal,
    coverageDays,
    capacityWarning: manzilTotal > 0 && coverageDays > cycle,
    capacityPerDay: limit,
    cycleDays: cycle,
    sabqiWindowDays: settings.sabqiWindowDays,
    rotationSlot: slot,
  };
}
```

- [ ] **Step 4: Jalankan test (harus lulus)**

Run: `pnpm test tests/tracker-daily-tasks.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker/schedule.ts tests/tracker-daily-tasks.test.ts
git commit -m "feat: daftar tugas murajaah harian dengan prioritas dan kapasitas"
```

---

### Task 5: `derive-status` menulis jadwal

**Objective:** `memorization_status` kini juga menyimpan `interval_days` dan `next_review_date` hasil replay.

**Files:**
- Modify: `src/lib/tracker/derive-status.ts`
- Test: `tests/tracker-derive-status.test.ts` (tambah kasus)

**Interfaces:**
- Consumes: `replayPageSchedule` (Task 3), `loadSettings` (Task 1).
- Produces: `recomputeMemorizationStatus(db)` dengan signature sama, tetapi mengisi 5 kolom.

- [ ] **Step 1: Tulis failing test**

Tambahkan ke `tests/tracker-derive-status.test.ts` (di dalam `describe` yang ada):

```ts
  it("mengisi interval dan tanggal review berikutnya", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: "2026-10-02", pageNumber: 1, type: "sabqi", quality: "mutqin" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    const [row] = await ctx.db.select().from(memorizationStatus);
    expect(row.intervalDays).toBe(2);
    expect(row.nextReviewDate).toBe("2026-10-04");
  });

  it("review lemah mereset interval ke 1", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "mutqin" },
      { date: "2026-10-03", pageNumber: 1, type: "sabqi", quality: "mutqin" },
      { date: "2026-10-07", pageNumber: 1, type: "manzil", quality: "lemah" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    const [row] = await ctx.db.select().from(memorizationStatus);
    expect(row.intervalDays).toBe(1);
    expect(row.nextReviewDate).toBe("2026-10-08");
    expect(row.status).toBe("mutqin");
  });

  it("menghapus log memundurkan jadwal kembali", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: "2026-10-02", pageNumber: 1, type: "sabqi", quality: "mutqin" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    await ctx.db.delete(sessionsLog).where(eq(sessionsLog.date, "2026-10-02"));
    await recomputeMemorizationStatus(ctx.db);
    const [row] = await ctx.db.select().from(memorizationStatus);
    expect(row.intervalDays).toBe(1);
    expect(row.nextReviewDate).toBe("2026-10-02");
  });
```

Tambahkan import `eq` di bagian atas file:

```ts
import { eq } from "drizzle-orm";
```

- [ ] **Step 2: Jalankan test (harus gagal)**

Run: `pnpm test tests/tracker-derive-status.test.ts`
Expected: FAIL — `intervalDays` masih `0` / `nextReviewDate` masih `null`.

- [ ] **Step 3: Implementasi**

Ganti seluruh isi `src/lib/tracker/derive-status.ts`.

**PENTING:** semua tulis tetap lewat **satu `db.batch()`** seperti versi `bf64436`. Jangan kembali ke `await insert` di dalam loop — itu N+1 yang dulu butuh ~60 detik di produksi untuk 604 halaman. Pola `writes[0], ...writes.slice(1), prune` dipertahankan karena `batch()` menuntut tuple non-kosong.

```ts
import { notInArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessionsLog, memorizationStatus } from "@/db/schema";
import type * as schema from "@/db/schema";
import { loadSettings } from "@/lib/settings";
import { replayPageSchedule } from "./schedule";
import type { Quality, SessionType } from "./quality";

/**
 * Menghitung ulang `memorization_status` dari `sessions_log`.
 *
 * `memorization_status` adalah data turunan, bukan sumber kebenaran:
 * - status         = kualitas `sabaq` terbaru
 * - memorizedAt    = tanggal `sabaq` pertama
 * - lastReviewedAt = tanggal log terakhir (tipe apa pun)
 * - intervalDays & nextReviewDate = hasil replay jadwal (Fase 3)
 *
 * Semua tulis dikirim lewat satu `db.batch()` — satu round-trip HTTP, bukan
 * satu INSERT per halaman. `batch()` menuntut tuple non-kosong, jadi saat belum
 * ada sabaq sama sekali cukup prune saja.
 */
export async function recomputeMemorizationStatus(
  db: LibSQLDatabase<typeof schema>,
): Promise<void> {
  const [logs, settings] = await Promise.all([
    db.select().from(sessionsLog).orderBy(sessionsLog.date, sessionsLog.id),
    loadSettings(db),
  ]);

  const schedules = replayPageSchedule(
    logs.map((log) => ({
      id: log.id,
      date: log.date,
      pageNumber: log.pageNumber,
      type: log.type as SessionType,
      quality: log.quality as Quality,
    })),
    settings.intervalCapDays,
  );

  const writes = [...schedules.values()].map((schedule) => {
    const memorizedAt = new Date(schedule.memorizedAt);
    const lastReviewedAt = new Date(schedule.lastReviewedAt);
    return db
      .insert(memorizationStatus)
      .values({
        pageNumber: schedule.pageNumber,
        status: schedule.status,
        memorizedAt,
        lastReviewedAt,
        intervalDays: schedule.intervalDays,
        nextReviewDate: schedule.nextReviewDate,
      })
      .onConflictDoUpdate({
        target: memorizationStatus.pageNumber,
        set: {
          status: schedule.status,
          memorizedAt,
          lastReviewedAt,
          intervalDays: schedule.intervalDays,
          nextReviewDate: schedule.nextReviewDate,
        },
      });
  });

  const memorizedPageNumbers = [...schedules.keys()];
  const prune =
    memorizedPageNumbers.length === 0
      ? db.delete(memorizationStatus)
      : db.delete(memorizationStatus).where(notInArray(memorizationStatus.pageNumber, memorizedPageNumbers));

  if (writes.length === 0) {
    await prune;
    return;
  }
  await db.batch([writes[0], ...writes.slice(1), prune]);
}
```

- [ ] **Step 4: Jalankan test (harus lulus)**

Run: `pnpm test tests/tracker-derive-status.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Pastikan test Fase 2 tidak rusak**

Run: `pnpm test tests/sessions-api.test.ts tests/sessions-id-api.test.ts tests/progress-api.test.ts`
Expected: PASS semua.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tracker/derive-status.ts tests/tracker-derive-status.test.ts
git commit -m "feat: recompute menyimpan interval dan tanggal review berikutnya"
```

---

### Task 6: Loader tugas harian (satu round-trip, bisa menerima data cache)

**Objective:** Menjembatani DB ke `buildDailyTasks` **tanpa menambah round-trip**, dan bisa menerima baris status yang sudah diambil pemanggil (dashboard memakai `getCachedStatuses()`).

**Files:**
- Create: `src/lib/tracker/daily.ts`
- Modify: `src/lib/tracker/progress-cache.ts` (cache menyimpan seluruh kolom status)
- Test: `tests/tracker-daily-loader.test.ts`

**Interfaces:**
- Consumes: `parseSettings` (Task 1), `buildDailyTasks` (Task 4).
- Produces:
  - `type StatusRecord = typeof memorizationStatus.$inferSelect`
  - `type DayLog = { date; pageNumber; type; quality }`
  - `interface DailySource { statuses: StatusRecord[]; logs: DayLog[]; settings: AppSettings }`
  - `interface DailyTasksResult { plan: DailyPlan; settings: AppSettings }`
  - `buildDailyPlan(source: DailySource, date: string): DailyPlan` — **murni, tanpa DB**
  - `loadDailyTasks(db, date): Promise<DailyTasksResult>` — **satu `db.batch()`**

**Mengapa begini:** dashboard sudah membayar 1 round-trip lewat `db.batch()`. Kalau `loadDailyTasks` melakukan 3 query sendiri, dashboard menjadi 2 round-trip (~+180ms di prod). Karena itu pemisahan `buildDailyPlan` (murni) dari `loadDailyTasks` (I/O) wajib, dan `getCachedStatuses()` harus mengembalikan **seluruh kolom** `memorization_status` — bukan hanya `pageNumber`+`status` — supaya `interval_days`/`next_review_date` tersedia tanpa query tambahan.

- [ ] **Step 1: Perluas cache status**

Di `src/lib/tracker/progress-cache.ts`, ganti blok `getCachedStatuses` menjadi:

```ts
export type CachedStatusRow = typeof memorizationStatus.$inferSelect;

/**
 * Tabel `memorization_status` dibaca di hampir setiap halaman. Di Netlify satu
 * query = satu round-trip lintas region ke Turso, jadi hasilnya di-cache di
 * Netlify Durable Cache (otomatis aktif untuk Next Runtime 5.5+) dengan
 * revalidasi berbasis tag.
 *
 * Seluruh kolom ikut di-cache (bukan hanya pageNumber+status): halaman
 * murajaah dan dashboard butuh `memorizedAt`, `intervalDays`, dan
 * `nextReviewDate` untuk menghitung jadwal. Cache ini praktis selalu hit pada
 * navigasi antar halaman karena isinya hanya berubah saat ada setoran baru.
 */
export const getCachedStatuses = unstable_cache(
  async (): Promise<CachedStatusRow[]> => {
    return getDb().select().from(memorizationStatus);
  },
  ["memorization-status"],
  { tags: [PROGRESS_TAG], revalidate: 300 },
);
```

`summarizeProgress(statuses: StatusRow[])` tetap kompatibel: `StatusRow = { pageNumber; status }` adalah subset struktural, jadi baris yang lebih lebar tetap lolos type-check.

- [ ] **Step 2: Tulis failing test**

`tests/tracker-daily-loader.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { memorizationStatus, pages, sessionsLog, settings } from "@/db/schema";
import { buildDailyPlan, loadDailyTasks } from "@/lib/tracker/daily";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { parseSettings } from "@/lib/settings";
import { rotationSlot } from "@/lib/tracker/schedule";

function forceGc(): void {
  v8.setFlagsFromString("--expose_gc");
  const gc = vm.runInNewContext("gc") as () => void;
  v8.setFlagsFromString("--no-expose_gc");
  gc();
}

function safeRm(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    forceGc();
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      console.warn(`[tracker-daily-loader.test] cleanup dilewati: ${target}`);
    }
  }
}

const TODAY = "2026-10-21";

let dir: string;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-daily-"));
  ctx = createDb(`file:${join(dir, "d.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  // FK: memorization_status.page_number -> pages.page_number, jadi setiap
  // halaman yang dipakai test harus ada di tabel pages.
  await ctx.db.insert(pages).values(
    Array.from({ length: 12 }, (_, i) => ({
      pageNumber: i + 1,
      juz: 1,
      surahStart: 1,
      ayahStart: 1,
      surahEnd: 1,
      ayahEnd: 7,
    })),
  );
});

afterAll(() => {
  ctx.client.close();
  safeRm(dir);
});

beforeEach(async () => {
  await ctx.db.delete(sessionsLog);
  await ctx.db.delete(memorizationStatus);
  await ctx.db.delete(settings);
});

describe("loadDailyTasks", () => {
  it("membentuk tugas dari status hasil recompute", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: "2026-10-02", pageNumber: 2, type: "sabaq", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);

    const { plan, settings: s } = await loadDailyTasks(ctx.db, TODAY);
    expect(s.dailyLoadLimit).toBe(2);
    expect(plan.manzilTotal).toBe(2);
    expect(plan.done).toHaveLength(0);
    expect(plan.date).toBe(TODAY);
  });

  it("menghitung murajaah hari ini sebagai selesai dan mengeluarkannya dari tugas", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-20", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: TODAY, pageNumber: 1, type: "sabqi", quality: "mutqin" },
    ]);
    await recomputeMemorizationStatus(ctx.db);

    const { plan } = await loadDailyTasks(ctx.db, TODAY);
    expect(plan.sabqi).toHaveLength(0);
    expect(plan.done).toHaveLength(1);
    expect(plan.done[0]).toMatchObject({ pageNumber: 1, status: "mutqin", lane: "sabqi" });
  });

  it("menghormati settings dari DB", async () => {
    await ctx.db.insert(settings).values([
      { key: "daily_load_limit", value: "1" },
      { key: "sabqi_window_days", value: "1" },
    ]);
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-20", pageNumber: 1, type: "sabaq", quality: "lancar" },
      { date: "2026-10-20", pageNumber: 2, type: "sabaq", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);

    const { plan, settings: s } = await loadDailyTasks(ctx.db, TODAY);
    expect(s.dailyLoadLimit).toBe(1);
    expect(s.sabqiWindowDays).toBe(1);
    expect(plan.capacityPerDay).toBe(1);
    expect(plan.sabqi.length).toBeLessThanOrEqual(1);
  });

  it("halaman dengan jadwal kosong tetap dianggap jatuh tempo", async () => {
    await ctx.db.insert(memorizationStatus).values({
      pageNumber: 1,
      status: "lancar",
      memorizedAt: new Date("2026-01-01"),
      lastReviewedAt: new Date("2026-01-01"),
      intervalDays: 0,
      nextReviewDate: null,
    });
    const { plan } = await loadDailyTasks(ctx.db, TODAY);
    expect(plan.manzilTotal).toBe(1);
    expect(plan.manzil.map((t) => t.pageNumber)).toContain(1);
  });
});

describe("buildDailyPlan", () => {
  it("menghitung tanpa menyentuh DB, dari baris yang dioper pemanggil", () => {
    // Meniru dashboard: status sudah ada di tangan (dari cache), tidak ada query.
    const settingsValue = parseSettings([{ key: "daily_load_limit", value: "5" }]);
    const slot = rotationSlot(TODAY, settingsValue.manzilCycleDays);
    const duePage = slot + 1;

    const plan = buildDailyPlan(
      {
        statuses: [
          {
            pageNumber: duePage,
            status: "lancar",
            memorizedAt: new Date("2026-01-01"),
            lastReviewedAt: new Date("2026-01-01"),
            intervalDays: 30,
            nextReviewDate: "2026-12-31",
          },
        ],
        logs: [],
        settings: settingsValue,
      },
      TODAY,
    );

    expect(plan.manzil.map((t) => t.pageNumber)).toEqual([duePage]);
    expect(plan.manzilTotal).toBe(1);
  });

  it("memakai log hari itu untuk daftar selesai", () => {
    const settingsValue = parseSettings([]);
    const plan = buildDailyPlan(
      {
        statuses: [
          {
            pageNumber: 3,
            status: "mutqin",
            memorizedAt: new Date("2026-10-19"),
            lastReviewedAt: new Date(TODAY),
            intervalDays: 2,
            nextReviewDate: "2026-10-23",
          },
        ],
        logs: [{ date: TODAY, pageNumber: 3, type: "sabqi", quality: "mutqin" }],
        settings: settingsValue,
      },
      TODAY,
    );

    expect(plan.sabqi).toHaveLength(0);
    expect(plan.done).toHaveLength(1);
    expect(plan.done[0].pageNumber).toBe(3);
  });
});
```

- [ ] **Step 3: Jalankan test (harus gagal)**

Run: `pnpm test tests/tracker-daily-loader.test.ts`
Expected: FAIL — `@/lib/tracker/daily` belum ada.

- [ ] **Step 4: Implementasi**

`src/lib/tracker/daily.ts`:

```ts
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { memorizationStatus, sessionsLog, settings as settingsTable } from "@/db/schema";
import type * as schema from "@/db/schema";
import { parseSettings, type AppSettings } from "@/lib/settings";
import { addDays, todayISO } from "./date";
import { isQuality, isSessionType, type Quality, type SessionType } from "./quality";
import {
  buildDailyTasks,
  type DailyPlan,
  type PageSchedule,
  type ReviewedToday,
} from "./schedule";

export type StatusRecord = typeof memorizationStatus.$inferSelect;

export interface DayLog {
  date: string;
  pageNumber: number;
  type: string;
  quality: string;
}

export interface DailySource {
  statuses: StatusRecord[];
  logs: DayLog[];
  settings: AppSettings;
}

export interface DailyTasksResult {
  plan: DailyPlan;
  settings: AppSettings;
}

/**
 * Mengubah baris `memorization_status` menjadi jadwal yang bisa dihitung.
 *
 * Baris dengan jadwal kosong (data lama sebelum Fase 3 pernah di-recompute)
 * diperlakukan sebagai jatuh tempo: interval 1 dan tanggal review dihitung
 * dari `memorizedAt`. Dengan begitu tidak ada hafalan yang "hilang" dari
 * daftar hanya karena `db:recompute` belum dijalankan.
 */
function toSchedules(statuses: StatusRecord[], date: string): PageSchedule[] {
  return statuses.map((row) => {
    const intervalDays = row.intervalDays > 0 ? row.intervalDays : 1;
    const memorizedAt = row.memorizedAt ? todayISO(row.memorizedAt) : date;
    const lastReviewedAt = row.lastReviewedAt ? todayISO(row.lastReviewedAt) : memorizedAt;
    return {
      pageNumber: row.pageNumber,
      status: isQuality(row.status) ? row.status : "baru",
      memorizedAt,
      lastReviewedAt,
      intervalDays,
      nextReviewDate: row.nextReviewDate ?? addDays(memorizedAt, intervalDays),
    };
  });
}

/**
 * Fungsi murni: menyusun tugas harian dari data yang sudah ada di tangan.
 *
 * Dipakai dashboard, yang sudah memegang baris status dari
 * `getCachedStatuses()` dan log hari ini dari `db.batch()`. Memanggil
 * `loadDailyTasks` di sana akan menambah satu round-trip Turso (~180ms di
 * Netlify lintas region) hanya untuk data yang sudah tersedia.
 */
export function buildDailyPlan(source: DailySource, date: string): DailyPlan {
  const reviewedToday: ReviewedToday[] = source.logs
    .filter((log) => isSessionType(log.type) && isQuality(log.quality))
    .map((log) => ({
      pageNumber: log.pageNumber,
      quality: log.quality as Quality,
      type: log.type as SessionType,
    }));

  return buildDailyTasks({
    today: date,
    schedules: toSchedules(source.statuses, date),
    reviewedToday,
    settings: source.settings,
  });
}

/**
 * Versi yang mengambil datanya sendiri — SATU `db.batch()`, tiga statement
 * dalam satu round-trip HTTP.
 */
export async function loadDailyTasks(
  db: LibSQLDatabase<typeof schema>,
  date: string,
): Promise<DailyTasksResult> {
  const [statuses, logs, settingRows] = await db.batch([
    db.select().from(memorizationStatus),
    db.select().from(sessionsLog).where(eq(sessionsLog.date, date)),
    db.select({ key: settingsTable.key, value: settingsTable.value }).from(settingsTable),
  ]);

  const settings = parseSettings(settingRows);
  return { plan: buildDailyPlan({ statuses, logs, settings }, date), settings };
}
```

- [ ] **Step 5: Jalankan test (harus lulus)**

Run: `pnpm test tests/tracker-daily-loader.test.ts`
Expected: PASS (6 test).

- [ ] **Step 6: Pastikan cache yang diperluas tidak merusak halaman lain**

Run: `pnpm test tests/tracker-progress.test.ts tests/progress-api.test.ts`
Expected: PASS.
Run: `pnpm exec tsc --noEmit`
Expected: tanpa error (baris status yang lebih lebar tetap lolos `summarizeProgress`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/tracker/daily.ts src/lib/tracker/progress-cache.ts tests/tracker-daily-loader.test.ts
git commit -m "feat(murajaah): add daily task loader with single round-trip"
```

---

### Task 7: Validasi input Fase 3

**Objective:** Skema Zod untuk endpoint baru, memakai rentang dari `SETTINGS_LIMITS` agar form dan API tidak bisa berbeda.

**Files:**
- Modify: `src/lib/tracker/validation.ts`
- Test: `tests/murajaah-validation.test.ts`

**Interfaces:**
- Consumes: `SETTINGS_LIMITS` (Task 1).
- Produces:
  - `murajaahCompleteInput` — `{ date, items: [{ pageNumber, quality }] }`, 1–50 item
  - `settingsPatchInput` — semua field opsional, `.strict()`

- [ ] **Step 1: Tulis failing test**

`tests/murajaah-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { murajaahCompleteInput, settingsPatchInput } from "@/lib/tracker/validation";

describe("murajaahCompleteInput", () => {
  it("menerima payload minimal", () => {
    const parsed = murajaahCompleteInput.safeParse({
      date: "2026-10-21",
      items: [{ pageNumber: 3, quality: "lancar" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("menolak items kosong", () => {
    expect(murajaahCompleteInput.safeParse({ date: "2026-10-21", items: [] }).success).toBe(false);
  });

  it("menolak lebih dari 50 item", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ pageNumber: i + 1, quality: "lancar" }));
    expect(murajaahCompleteInput.safeParse({ date: "2026-10-21", items }).success).toBe(false);
  });

  it("menolak halaman di luar 1-604 dan kualitas tak dikenal", () => {
    expect(murajaahCompleteInput.safeParse({ date: "2026-10-21", items: [{ pageNumber: 605, quality: "lancar" }] }).success).toBe(false);
    expect(murajaahCompleteInput.safeParse({ date: "2026-10-21", items: [{ pageNumber: 1, quality: "sempurna" }] }).success).toBe(false);
  });

  it("menolak tanggal kalender tidak valid", () => {
    expect(murajaahCompleteInput.safeParse({ date: "2026-02-30", items: [{ pageNumber: 1, quality: "lancar" }] }).success).toBe(false);
  });
});

describe("settingsPatchInput", () => {
  it("menerima subset field", () => {
    expect(settingsPatchInput.safeParse({ dailyLoadLimit: 3 }).success).toBe(true);
    expect(settingsPatchInput.safeParse({ labels: { sabaq: "Ziyadah", sabqi: "Sabqi", manzil: "Manzil" } }).success).toBe(true);
  });

  it("menolak nilai di luar rentang", () => {
    expect(settingsPatchInput.safeParse({ dailyLoadLimit: 0 }).success).toBe(false);
    expect(settingsPatchInput.safeParse({ intervalCapDays: 1 }).success).toBe(false);
    expect(settingsPatchInput.safeParse({ manzilCycleDays: 999 }).success).toBe(false);
  });

  it("menolak key tak dikenal", () => {
    expect(settingsPatchInput.safeParse({ unknownKey: 1 }).success).toBe(false);
  });

  it("menolak label kosong", () => {
    expect(settingsPatchInput.safeParse({ labels: { sabaq: "  ", sabqi: "Sabqi", manzil: "Manzil" } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test (harus gagal)**

Run: `pnpm test tests/murajaah-validation.test.ts`
Expected: FAIL — skema belum ada.

- [ ] **Step 3: Implementasi**

Di `src/lib/tracker/validation.ts`, ubah import pertama dan tambahkan skema di akhir file:

```ts
import { SETTINGS_LIMITS } from "@/lib/settings";
```

```ts
export const murajaahItemInput = z.object({
  pageNumber: z.number().int().min(1).max(604),
  quality: z.enum(QUALITY_LEVELS),
});

export const murajaahCompleteInput = z.object({
  date: isoDate,
  items: z.array(murajaahItemInput).min(1).max(50),
});

export const settingsPatchInput = z
  .object({
    sabqiWindowDays: z.number().int().min(SETTINGS_LIMITS.sabqiWindowDays.min).max(SETTINGS_LIMITS.sabqiWindowDays.max).optional(),
    manzilCycleDays: z.number().int().min(SETTINGS_LIMITS.manzilCycleDays.min).max(SETTINGS_LIMITS.manzilCycleDays.max).optional(),
    dailyLoadLimit: z.number().int().min(SETTINGS_LIMITS.dailyLoadLimit.min).max(SETTINGS_LIMITS.dailyLoadLimit.max).optional(),
    intervalCapDays: z.number().int().min(SETTINGS_LIMITS.intervalCapDays.min).max(SETTINGS_LIMITS.intervalCapDays.max).optional(),
    labels: z
      .object({
        sabaq: z.string().trim().min(1).max(24),
        sabqi: z.string().trim().min(1).max(24),
        manzil: z.string().trim().min(1).max(24),
      })
      .optional(),
  })
  .strict();
```

- [ ] **Step 4: Jalankan test (harus lulus)**

Run: `pnpm test tests/murajaah-validation.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Pastikan validasi lama tetap lulus**

Run: `pnpm test tests/sessions-api.test.ts tests/goals-api.test.ts tests/rest-days-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tracker/validation.ts tests/murajaah-validation.test.ts
git commit -m "feat: skema validasi murajaah dan pengaturan"
```

---

### Task 8: API `POST /api/murajaah/complete`

**Objective:** Mencatat 1–50 murajaah dalam satu request, dengan jenis log ditentukan server dan satu kali recompute.

**Files:**
- Create: `src/app/api/murajaah/complete/handler.ts`
- Create: `src/app/api/murajaah/complete/route.ts`
- Test: `tests/murajaah-api.test.ts`

**Interfaces:**
- Consumes: `murajaahCompleteInput` (Task 7), `loadSettings` (Task 1), `recomputeMemorizationStatus` (Task 5).
- Produces: `completeMurajaahHandler(req: Request): Promise<Response>`.

- [ ] **Step 1: Tulis failing test**

`tests/murajaah-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { memorizationStatus, pages, sessionsLog, users } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { addDays, todayISO } from "@/lib/tracker/date";

function forceGc(): void {
  v8.setFlagsFromString("--expose_gc");
  const gc = vm.runInNewContext("gc") as () => void;
  v8.setFlagsFromString("--no-expose_gc");
  gc();
}

function safeRm(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    forceGc();
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      console.warn(`[murajaah-api.test] cleanup dilewati: ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-murajaahapi-"));
  ctx = createDb(`file:${join(dir, "m.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  await ctx.db.insert(pages).values([
    { pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 },
    { pageNumber: 2, juz: 1, surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 },
  ]);
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "m.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});

afterAll(() => {
  ctx.client.close();
  safeRm(dir);
});

beforeEach(async () => {
  await ctx.db.delete(sessionsLog);
  await ctx.db.delete(memorizationStatus);
});

async function post(body: unknown, withCookie = true) {
  const { completeMurajaahHandler } = await import("@/app/api/murajaah/complete/handler");
  return completeMurajaahHandler(
    new Request("http://localhost/api/murajaah/complete", {
      method: "POST",
      headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/murajaah/complete", () => {
  const TODAY = todayISO();
  const YESTERDAY = addDays(TODAY, -1);

  it("401 tanpa sesi", async () => {
    const res = await post({ date: TODAY, items: [{ pageNumber: 1, quality: "lancar" }] }, false);
    expect(res.status).toBe(401);
  });

  it("400 saat payload tidak valid", async () => {
    expect((await post({ date: TODAY, items: [] })).status).toBe(400);
    expect((await post({ date: TODAY, items: [{ pageNumber: 999, quality: "lancar" }] })).status).toBe(400);
  });

  it("400 saat tanggal di masa depan", async () => {
    const res = await post({ date: "2099-01-01", items: [{ pageNumber: 1, quality: "lancar" }] });
    expect(res.status).toBe(400);
  });

  it("400 dan tidak menulis log saat halaman belum dihafal", async () => {
    const res = await post({ date: TODAY, items: [{ pageNumber: 1, quality: "lancar" }] });
    expect(res.status).toBe(400);
    expect((await ctx.db.select().from(sessionsLog)).length).toBe(0);
  });

  it("201, mencatat jenis sabqi untuk hafalan baru, dan memperbarui interval", async () => {
    await ctx.db.insert(sessionsLog).values({ date: YESTERDAY, pageNumber: 1, type: "sabaq", quality: "lancar" });
    await recomputeMemorizationStatus(ctx.db);

    const res = await post({ date: TODAY, items: [{ pageNumber: 1, quality: "mutqin" }] });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.items[0]).toMatchObject({ pageNumber: 1, type: "sabqi" });

    const logs = await ctx.db.select().from(sessionsLog);
    expect(logs).toHaveLength(2);
    expect(logs.find((l) => l.date === TODAY)?.type).toBe("sabqi");

    const [status] = await ctx.db.select().from(memorizationStatus);
    expect(status.intervalDays).toBe(2);
    expect(status.nextReviewDate).toBe(addDays(TODAY, 2));
  });

  it("201 dengan jenis manzil untuk hafalan lama", async () => {
    await ctx.db.insert(sessionsLog).values({ date: "2026-01-05", pageNumber: 2, type: "sabaq", quality: "mutqin" });
    await recomputeMemorizationStatus(ctx.db);

    const res = await post({ date: TODAY, items: [{ pageNumber: 2, quality: "lancar" }] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.items[0].type).toBe("manzil");
  });

  it("mendedupe item duplikat dalam satu request", async () => {
    await ctx.db.insert(sessionsLog).values({ date: YESTERDAY, pageNumber: 1, type: "sabaq", quality: "lancar" });
    await recomputeMemorizationStatus(ctx.db);

    const res = await post({
      date: TODAY,
      items: [
        { pageNumber: 1, quality: "lemah" },
        { pageNumber: 1, quality: "mutqin" },
      ],
    });
    expect(res.status).toBe(201);
    const logs = await ctx.db.select().from(sessionsLog);
    const today = logs.filter((l) => l.date === TODAY);
    expect(today).toHaveLength(1);
    expect(today[0].quality).toBe("mutqin");
  });
});
```

- [ ] **Step 2: Jalankan test (harus gagal)**

Run: `pnpm test tests/murajaah-api.test.ts`
Expected: FAIL — handler belum ada.

- [ ] **Step 3: Implementasi handler**

`src/app/api/murajaah/complete/handler.ts`:

Perhatikan: settings dan status halaman diambil dalam **satu `db.batch()`** (bukan `Promise.all` dari dua query terpisah), dan halaman divalidasi lewat katalog statis `findPage()` — bukan query ke tabel `pages`. Route-nya wajib `revalidateTag` (Step 4), karena tes mengimpor handler langsung dan `revalidateTag` melempar di luar request scope.

```ts
import { inArray } from "drizzle-orm";
import { memorizationStatus, sessionsLog, settings as settingsTable } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { findPage } from "@/lib/mushaf/pages";
import { parseSettings } from "@/lib/settings";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { daysBetween, todayISO } from "@/lib/tracker/date";
import type { Quality, SessionType } from "@/lib/tracker/quality";
import { murajaahCompleteInput } from "@/lib/tracker/validation";

export async function completeMurajaahHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = murajaahCompleteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const { date } = parsed.data;

  if (date > todayISO()) {
    return Response.json({ error: "Tanggal tidak boleh di masa depan" }, { status: 400 });
  }

  // Dedupe: satu halaman hanya dicatat sekali per request, kualitas terakhir menang.
  const qualities = new Map<number, Quality>();
  for (const item of parsed.data.items) qualities.set(item.pageNumber, item.quality);
  const pageNumbers = [...qualities.keys()];

  // Halaman di luar 1-604 ditolak tanpa menyentuh DB sama sekali.
  const invalid = pageNumbers.filter((p) => !findPage(p));
  if (invalid.length > 0) {
    return Response.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const db = getDb();
  // Satu round-trip: settings + status halaman yang diminta.
  const [settingRows, statuses] = await db.batch([
    db.select({ key: settingsTable.key, value: settingsTable.value }).from(settingsTable),
    db
      .select()
      .from(memorizationStatus)
      .where(inArray(memorizationStatus.pageNumber, pageNumbers)),
  ]);

  const settings = parseSettings(settingRows);
  const known = new Set(statuses.map((s) => s.pageNumber));
  const unknown = pageNumbers.filter((p) => !known.has(p));
  if (unknown.length > 0) {
    return Response.json(
      { error: `Halaman ${unknown.join(", ")} belum dihafal` },
      { status: 400 },
    );
  }

  const rows = statuses.map((status) => {
    const memorizedAt = status.memorizedAt ? todayISO(status.memorizedAt) : date;
    const type: SessionType =
      daysBetween(memorizedAt, date) < settings.sabqiWindowDays ? "sabqi" : "manzil";
    return {
      date,
      pageNumber: status.pageNumber,
      type,
      quality: qualities.get(status.pageNumber)!,
    };
  });

  await db.insert(sessionsLog).values(rows);
  await recomputeMemorizationStatus(db);

  return Response.json(
    {
      created: rows.length,
      items: rows.map((row) => ({ pageNumber: row.pageNumber, type: row.type })),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 4: Implementasi route**

`src/app/api/murajaah/complete/route.ts` — `revalidateTag` **wajib** di sini (pola yang sama dengan `src/app/api/sessions/route.ts`), karena murajaah menulis `sessions_log` dan mengubah `memorization_status`:

```ts
import { revalidateTag } from "next/cache";
import { PROGRESS_TAG } from "@/lib/tracker/progress-cache";
import { completeMurajaahHandler } from "./handler";

export async function POST(req: Request) {
  const res = await completeMurajaahHandler(req);
  // Murajaah mengubah status hafalan + jadwal, jadi cache turunan harus dibuang.
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}
```

- [ ] **Step 5: Jalankan test (harus lulus)**

Run: `pnpm test tests/murajaah-api.test.ts`
Expected: PASS (7 test).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/murajaah" tests/murajaah-api.test.ts
git commit -m "feat: API catat murajaah massal dengan jenis ditentukan server"
```

---

### Task 9: API `/api/settings`

**Objective:** Membaca dan mengubah parameter algoritma dari UI.

**Files:**
- Create: `src/app/api/settings/handler.ts`
- Create: `src/app/api/settings/route.ts`
- Test: `tests/settings-api.test.ts`

**Interfaces:**
- Consumes: `loadSettings`, `parseSettings`, `NUMERIC_KEYS`, `LABEL_KEYS` (Task 1), `settingsPatchInput` (Task 7).
- Produces: `getSettingsHandler`, `updateSettingsHandler`.

- [ ] **Step 1: Tulis failing test**

`tests/settings-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { settings, users } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

function forceGc(): void {
  v8.setFlagsFromString("--expose_gc");
  const gc = vm.runInNewContext("gc") as () => void;
  v8.setFlagsFromString("--no-expose_gc");
  gc();
}

function safeRm(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    forceGc();
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      console.warn(`[settings-api.test] cleanup dilewati: ${target}`);
    }
  }
}

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-settingsapi-"));
  ctx = createDb(`file:${join(dir, "s.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "s.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});

afterAll(() => {
  ctx.client.close();
  safeRm(dir);
});

beforeEach(async () => {
  await ctx.db.delete(settings);
});

async function get(withCookie = true) {
  const { getSettingsHandler } = await import("@/app/api/settings/handler");
  return getSettingsHandler(
    new Request("http://localhost/api/settings", { headers: withCookie ? { cookie } : {} }),
  );
}

async function patch(body: unknown, withCookie = true) {
  const { updateSettingsHandler } = await import("@/app/api/settings/handler");
  return updateSettingsHandler(
    new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/settings", () => {
  it("401 tanpa sesi", async () => {
    expect((await get(false)).status).toBe(401);
    expect((await patch({ dailyLoadLimit: 3 }, false)).status).toBe(401);
  });

  it("GET mengembalikan default saat tabel kosong", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toMatchObject({
      sabqiWindowDays: 14,
      manzilCycleDays: 7,
      dailyLoadLimit: 2,
      intervalCapDays: 30,
    });
  });

  it("PATCH menyimpan nilai dan GET membacanya kembali", async () => {
    const res = await patch({ dailyLoadLimit: 4, sabqiWindowDays: 21 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.dailyLoadLimit).toBe(4);
    expect(body.settings.sabqiWindowDays).toBe(21);

    const again = await (await get()).json();
    expect(again.settings.dailyLoadLimit).toBe(4);
    expect((await ctx.db.select().from(settings)).length).toBe(2);
  });

  it("PATCH bersifat parsial dan idempotent", async () => {
    await patch({ dailyLoadLimit: 3 });
    await patch({ dailyLoadLimit: 3 });
    expect((await ctx.db.select().from(settings)).length).toBe(1);
  });

  it("PATCH label tersimpan", async () => {
    const res = await patch({ labels: { sabaq: "Ziyadah", sabqi: "Sabqi", manzil: "Manzil" } });
    expect(res.status).toBe(200);
    expect((await res.json()).settings.labels.sabaq).toBe("Ziyadah");
  });

  it("400 untuk key tak dikenal dan nilai di luar rentang", async () => {
    expect((await patch({ unknownKey: 1 })).status).toBe(400);
    expect((await patch({ dailyLoadLimit: 0 })).status).toBe(400);
    expect((await patch({ intervalCapDays: 1 })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Jalankan test (harus gagal)**

Run: `pnpm test tests/settings-api.test.ts`
Expected: FAIL — handler belum ada.

- [ ] **Step 3: Implementasi handler**

`src/app/api/settings/handler.ts`:

```ts
import { settings as settingsTable } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import {
  LABEL_KEYS,
  NUMERIC_KEYS,
  loadSettings,
  type AppSettings,
} from "@/lib/settings";
import { settingsPatchInput } from "@/lib/tracker/validation";

export async function getSettingsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  return Response.json({ settings: await loadSettings(getDb()) });
}

export async function updateSettingsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = settingsPatchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const entries: { key: string; value: string }[] = [];
  const numericKeys = Object.keys(NUMERIC_KEYS) as (keyof typeof NUMERIC_KEYS)[];
  for (const key of numericKeys) {
    const value = parsed.data[key];
    if (value !== undefined) entries.push({ key: NUMERIC_KEYS[key], value: String(value) });
  }

  if (parsed.data.labels) {
    const labelKeys = Object.keys(LABEL_KEYS) as (keyof typeof LABEL_KEYS)[];
    for (const key of labelKeys) {
      entries.push({ key: LABEL_KEYS[key], value: parsed.data.labels[key] });
    }
  }

  const db = getDb();
  for (const entry of entries) {
    await db
      .insert(settingsTable)
      .values(entry)
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: entry.value } });
  }

  const settings: AppSettings = await loadSettings(db);
  return Response.json({ settings });
}
```

- [ ] **Step 4: Implementasi route**

`src/app/api/settings/route.ts` — `PATCH` wajib `revalidateTag`, karena `sabqi_window_days`/`manzil_cycle_days` mengubah jalur dan jadwal halaman sehingga kartu murajaah di dashboard menjadi basi:

```ts
import { revalidateTag } from "next/cache";
import { PROGRESS_TAG } from "@/lib/tracker/progress-cache";
import { getSettingsHandler, updateSettingsHandler } from "./handler";

export const GET = getSettingsHandler;

export async function PATCH(req: Request) {
  const res = await updateSettingsHandler(req);
  // Parameter murajaah mengubah jalur/jadwal halaman, jadi cache turunan dibuang.
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}
```

- [ ] **Step 5: Jalankan test (harus lulus)**

Run: `pnpm test tests/settings-api.test.ts`
Expected: PASS (7 test).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/settings" tests/settings-api.test.ts
git commit -m "feat: API baca dan ubah pengaturan murajaah"
```

---

### Task 10: Skrip `db:recompute`

**Objective:** Mengisi jadwal untuk data lama tanpa harus mengedit log.

**Files:**
- Create: `scripts/recompute.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `pnpm db:recompute` yang menjalankan `recomputeMemorizationStatus` terhadap `DATABASE_URL`.

- [ ] **Step 1: Buat skrip**

`scripts/recompute.ts`:

```ts
import { createDb } from "../src/db/client";
import { loadEnv } from "../src/lib/env";
import { recomputeMemorizationStatus } from "../src/lib/tracker/derive-status";

const env = loadEnv();
const { client, db } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);

await recomputeMemorizationStatus(db);

client.close();
console.log("Jadwal murajaah dihitung ulang.");
```

- [ ] **Step 2: Tambahkan script pnpm**

Di `package.json`, tambahkan setelah `"db:seed"`:

```json
    "db:recompute": "tsx --env-file-if-exists=.env scripts/recompute.ts"
```

- [ ] **Step 3: Jalankan pada database lokal**

Run: `pnpm db:recompute`
Expected: log `Jadwal murajaah dihitung ulang.` dan exit 0.

- [ ] **Step 4: Verifikasi kolom terisi**

Run: `pnpm exec tsx -e "import {createDb} from './src/db/client'; import {loadEnv} from './src/lib/env'; import {memorizationStatus} from './src/db/schema'; const e=loadEnv(); const {db,client}=createDb(e.DATABASE_URL,e.DATABASE_AUTH_TOKEN); const rows=await db.select().from(memorizationStatus); console.log(rows.length, rows.slice(0,3).map(r=>[r.pageNumber,r.intervalDays,r.nextReviewDate])); client.close();"`
Expected: jumlah baris ≥ 0, setiap baris punya `intervalDays >= 1` dan `nextReviewDate` berupa tanggal.

- [ ] **Step 5: Commit**

```bash
git add scripts/recompute.ts package.json
git commit -m "feat: skrip db:recompute untuk mengisi jadwal murajaah data lama"
```

---

### Task 11: Halaman `/murajaah`

**Objective:** Daftar tugas hari ini dengan pencatatan satu ketukan.

**Files:**
- Create: `src/components/MurajaahBoard.tsx`
- Create: `src/app/(app)/murajaah/page.tsx`

**Interfaces:**
- Consumes: `loadDailyTasks` (Task 6), `POST /api/murajaah/complete` (Task 8), `SURAHS` & `pages` untuk nama surah.
- Produces: halaman `/murajaah` beserta komponen client `MurajaahBoard`.

- [ ] **Step 1: Buat komponen papan murajaah**

`src/components/MurajaahBoard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwise,
  CheckCircle,
  Info,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  QUALITY_COLORS,
  QUALITY_LABELS,
  QUALITY_TEXT,
} from "@/lib/tracker/quality";
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
          {QUALITY_LABELS[task.status] ?? task.status} · interval {task.intervalDays} hari · jatuh tempo{" "}
          {formatDateShortID(task.nextReviewDate)}
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
      return false;
    }
    router.refresh();
    return true;
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
              {plan.sabqi.length + plan.manzil.length === 0
                ? "Tidak ada halaman yang jatuh tempo. Alhamdulillah."
                : `${plan.sabqi.length} ${labels.sabqi.toLowerCase()} dan ${plan.manzil.length} ${labels.manzil.toLowerCase()} menunggu.`}
            </p>
          </div>

          <button
            type="button"
            onClick={markAll}
            disabled={bulk || plan.scheduled === 0}
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
            <dd className={`tnum text-[17px] font-bold ${plan.deferred > 0 ? "text-[#8a5a12]" : "text-ink"}`}>
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
                <span className="ml-auto chip bg-sunken text-ink-soft">
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
```

- [ ] **Step 2: Buat halaman server**

`src/app/(app)/murajaah/page.tsx` — metadata halaman dari katalog statis `findPage()` (**jangan** query tabel `pages`), dan datanya lewat `loadDailyTasks` (satu `db.batch()`):

```tsx
import { getDb } from "@/lib/auth/db";
import { loadDailyTasks } from "@/lib/tracker/daily";
import { todayISO } from "@/lib/tracker/date";
import { findPage } from "@/lib/mushaf/pages";
import { SURAHS } from "@/lib/mushaf/surahs";
import MurajaahBoard, { type PageMeta } from "@/components/MurajaahBoard";

export default async function MurajaahPage() {
  const today = todayISO();
  const { plan, settings } = await loadDailyTasks(getDb(), today);

  const pageNumbers = [
    ...new Set([...plan.sabqi, ...plan.manzil, ...plan.done].map((t) => t.pageNumber)),
  ];

  const pageMeta: Record<number, PageMeta> = {};
  for (const pageNumber of pageNumbers) {
    const page = findPage(pageNumber);
    if (!page) continue;
    pageMeta[pageNumber] = {
      surah: SURAHS[page.surahStart - 1]?.latin ?? `Surah ${page.surahStart}`,
      juz: page.juz,
    };
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
          Murajaah
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Halaman yang perlu diulang hari ini, diurutkan dari yang paling rapuh.
        </p>
      </div>

      <MurajaahBoard today={today} plan={plan} labels={settings.labels} pageMeta={pageMeta} />
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi tipe & build**

Run: `pnpm exec tsc --noEmit`
Expected: tanpa error.
Run: `pnpm build`
Expected: build sukses, route `/murajaah` muncul di daftar.

- [ ] **Step 4: Commit**

```bash
git add src/components/MurajaahBoard.tsx "src/app/(app)/murajaah"
git commit -m "feat: halaman murajaah harian dengan pencatatan satu ketukan"
```

---

### Task 12: Halaman `/pengaturan`

**Objective:** Mengubah parameter algoritma dan label tanpa deploy.

**Files:**
- Create: `src/components/SettingsForm.tsx`
- Create: `src/app/(app)/pengaturan/page.tsx`

**Interfaces:**
- Consumes: `loadSettings` + `loadDailyTasks` (Task 1 & 6), `PATCH /api/settings` (Task 9).
- Produces: halaman `/pengaturan` + `SettingsForm`.

- [ ] **Step 1: Buat form pengaturan**

`src/components/SettingsForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, SlidersHorizontal, WarningCircle } from "@phosphor-icons/react";
import { SETTINGS_LIMITS, type AppSettings } from "@/lib/settings";

interface Props {
  settings: AppSettings;
  manzilTotal: number;
  memorizedPages: number;
}

const NUMERIC_FIELDS = [
  {
    key: "sabqiWindowDays" as const,
    label: "Jendela sabqi",
    unit: "hari",
    hint: "Hafalan yang lebih muda dari ini diulang lewat jalur sabqi (interval).",
  },
  {
    key: "manzilCycleDays" as const,
    label: "Siklus manzil",
    unit: "hari",
    hint: "Target seluruh hafalan lama tersentuh dalam rentang ini.",
  },
  {
    key: "dailyLoadLimit" as const,
    label: "Batas harian",
    unit: "halaman",
    hint: "Jumlah halaman murajaah yang ditampilkan per hari. Sabqi didahulukan.",
  },
  {
    key: "intervalCapDays" as const,
    label: "Batas interval",
    unit: "hari",
    hint: "Interval tidak tumbuh melebihi ini agar manzil tetap berputar.",
  },
];

export default function SettingsForm({ settings, manzilTotal, memorizedPages }: Props) {
  const router = useRouter();
  const [values, setValues] = useState({
    sabqiWindowDays: settings.sabqiWindowDays,
    manzilCycleDays: settings.manzilCycleDays,
    dailyLoadLimit: settings.dailyLoadLimit,
    intervalCapDays: settings.intervalCapDays,
  });
  const [labels, setLabels] = useState(settings.labels);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const coverage =
    manzilTotal === 0 ? 0 : Math.ceil(manzilTotal / Math.max(1, values.dailyLoadLimit));
  const warning = manzilTotal > 0 && coverage > values.manzilCycleDays;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, labels }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Gagal menyimpan" }));
      setError(err.error ?? "Gagal menyimpan");
      return;
    }

    setMessage("Pengaturan tersimpan. Daftar murajaah langsung memakai nilai baru.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={17} className="text-ink-faint" />
          <h2 className="text-[15px] font-bold text-ink">Parameter murajaah</h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NUMERIC_FIELDS.map((field) => {
            const limits = SETTINGS_LIMITS[field.key];
            return (
              <div key={field.key} className="field">
                <label htmlFor={field.key} className="field-label">
                  {field.label} <span className="font-normal text-ink-faint">({field.unit})</span>
                </label>
                <input
                  id={field.key}
                  type="number"
                  min={limits.min}
                  max={limits.max}
                  required
                  value={values[field.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                  }
                  className="input tnum"
                />
                <p className="field-hint">{field.hint}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-[10px] border border-line bg-sunken px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
          <p>
            <span className="tnum font-bold text-ink">{memorizedPages}</span> halaman dihafal,{" "}
            <span className="tnum font-bold text-ink">{manzilTotal}</span> di antaranya sudah masuk
            jalur manzil.
          </p>
          <p className={warning ? "mt-1 font-medium text-[#8a5a12]" : "mt-1"}>
            {manzilTotal === 0
              ? "Belum ada hafalan lama. Siklus manzil mulai bekerja setelah hafalan melewati jendela sabqi."
              : warning
                ? `Dengan ${values.dailyLoadLimit} halaman/hari, seluruh manzil butuh ${coverage} hari — melebihi siklus ${values.manzilCycleDays} hari.`
                : `Dengan ${values.dailyLoadLimit} halaman/hari, seluruh manzil tersentuh tiap ${coverage} hari, di dalam siklus ${values.manzilCycleDays} hari.`}
          </p>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-[15px] font-bold text-ink">Nama jenis setoran</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Istilah bisa berbeda antar lembaga. Ubah bila halaqahmu memakai nama lain.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["sabaq", "sabqi", "manzil"] as const).map((key) => (
            <div key={key} className="field">
              <label htmlFor={`label-${key}`} className="field-label">
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </label>
              <input
                id={`label-${key}`}
                value={labels[key]}
                maxLength={24}
                required
                onChange={(e) => setLabels((prev) => ({ ...prev, [key]: e.target.value }))}
                className="input"
              />
            </div>
          ))}
        </div>
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

      {message && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[10px] bg-brand-50 px-3.5 py-3 text-[13px] font-medium text-brand-800"
        >
          <CheckCircle size={16} weight="fill" className="mt-px shrink-0" />
          {message}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary w-full sm:w-auto">
        {loading ? "Menyimpan..." : "Simpan pengaturan"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Buat halaman pengaturan**

`src/app/(app)/pengaturan/page.tsx`:

```tsx
import { getDb } from "@/lib/auth/db";
import { loadSettings } from "@/lib/settings";
import { loadDailyTasks } from "@/lib/tracker/daily";
import { computeProgress } from "@/lib/tracker/progress";
import { todayISO } from "@/lib/tracker/date";
import SettingsForm from "@/components/SettingsForm";

export default async function PengaturanPage() {
  const db = getDb();
  const [settings, daily, progress] = await Promise.all([
    loadSettings(db),
    loadDailyTasks(db, todayISO()),
    computeProgress(db),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
          Pengaturan
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ritme murajaah menyesuaikan kondisi. Ubah angkanya kapan saja.
        </p>
      </div>

      <SettingsForm
        settings={settings}
        manzilTotal={daily.plan.manzilTotal}
        memorizedPages={progress.memorizedPages}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi tipe & build**

Run: `pnpm exec tsc --noEmit`
Expected: tanpa error.
Run: `pnpm build`
Expected: build sukses, route `/pengaturan` muncul.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsForm.tsx "src/app/(app)/pengaturan"
git commit -m "feat: halaman pengaturan parameter murajaah"
```

---

### Task 13: Navigasi + kartu dashboard

**Objective:** Murajaah terlihat dari mana saja, dan dashboard menjawab "hari ini apa yang perlu aku lakukan?".

**Files:**
- Modify: `src/components/Nav.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `buildDailyPlan` (Task 6), `getCachedStatuses()` & `PROGRESS_TAG` (existing).
- Produces: tab "Murajaah" (desktop + mobile) dan tombol pengaturan di header; kartu murajaah di dashboard.

- [ ] **Step 1: Tambah tautan di Nav**

Di `src/components/Nav.tsx`, ubah import ikon dan `LINKS`:

```tsx
import {
  ArrowsClockwise,
  BookOpenText,
  ClockCounterClockwise,
  GearSix,
  MapTrifold,
  SquaresFour,
  Target,
  SignOut,
} from "@phosphor-icons/react";

const LINKS = [
  { href: "/", label: "Ringkasan", short: "Ringkasan", Icon: SquaresFour },
  { href: "/catat", label: "Catat", short: "Catat", Icon: BookOpenText },
  { href: "/murajaah", label: "Murajaah", short: "Murajaah", Icon: ArrowsClockwise },
  { href: "/riwayat", label: "Riwayat", short: "Riwayat", Icon: ClockCounterClockwise },
  { href: "/peta", label: "Peta", short: "Peta", Icon: MapTrifold },
  { href: "/target", label: "Target", short: "Target", Icon: Target },
];
```

Lalu ganti blok `<form action="/api/auth/logout" ...>` menjadi (tombol pengaturan + keluar):

```tsx
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/pengaturan"
              aria-label="Pengaturan"
              aria-current={isActive(pathname, "/pengaturan") ? "page" : undefined}
              className="btn btn-ghost h-9 w-9 p-0"
            >
              <GearSix size={17} />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="btn btn-ghost h-9 px-2.5 text-[13px]"
                aria-label="Keluar dari akun"
              >
                <SignOut size={16} />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </form>
          </div>
```

- [ ] **Step 2: Tambah kartu murajaah di dashboard**

Di `src/app/(app)/page.tsx`, tambahkan import:

```tsx
import { loadDailyTasks } from "@/lib/tracker/daily";
```

**Jangan** menambahkan `loadDailyTasks(db, today)` ke `Promise.all` — itu menambah satu round-trip Turso (~180ms di Netlify lintas region) ke halaman yang baru saja dioptimasi. Dashboard sudah memegang dua dari tiga bahannya:

- baris status lengkap → `getCachedStatuses()` (sudah ada di baris pertama `Promise.all`)
- log hari ini → tambahkan sebagai statement keempat di `db.batch()` yang sudah ada
- settings → tambahkan sebagai statement kelima di `db.batch()` yang sama

Lalu susun plan dengan fungsi murni `buildDailyPlan` (Task 6), tanpa I/O. Ganti blok `Promise.all` + `db.batch` milik dashboard menjadi:

```tsx
  const [progressRows, [khatam, rest, recent, allDates, todayLogs, settingRows]] = await Promise.all([
    getCachedStatuses(),
    db.batch([
      db.select().from(goals).where(and(eq(goals.type, "khatam"), eq(goals.active, true))),
      db.select().from(restDays),
      db.select().from(sessionsLog).orderBy(desc(sessionsLog.date), desc(sessionsLog.id)).limit(5),
      db.selectDistinct({ date: sessionsLog.date }).from(sessionsLog),
      db.select().from(sessionsLog).where(eq(sessionsLog.date, today)),
      db.select({ key: settingsTable.key, value: settingsTable.value }).from(settingsTable),
    ]),
  ]);

  const progress = summarizeProgress(PAGE_LITES, progressRows);
  const daily = {
    plan: buildDailyPlan(
      { statuses: progressRows, logs: todayLogs, settings: parseSettings(settingRows) },
      today,
    ),
    settings: parseSettings(settingRows),
  };
```

Tambahkan import berikut (dan hapus `summarizeProgress` yang lama bila sudah ada duplikat):

```tsx
import { settings as settingsTable } from "@/db/schema";
import { parseSettings } from "@/lib/settings";
import { buildDailyPlan } from "@/lib/tracker/daily";
```

Lalu sisipkan section berikut **setelah** `</div>` penutup grid "Today + recent" dan sebelum blok `{projection && (`:

```tsx
      {/* Murajaah hari ini ---------------------------------------------- */}
      <section
        className="card rise p-5 sm:p-6"
        style={{ "--rise-delay": "240ms" } as React.CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="eyebrow">Murajaah hari ini</h2>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className="tnum text-[24px] font-extrabold leading-none tracking-tight text-ink">
                {daily.plan.done.length}
              </span>
              <span className="text-sm font-semibold text-ink-faint">
                / {daily.plan.scheduled + daily.plan.done.length} halaman
              </span>
            </p>
          </div>
          <Link
            href="/murajaah"
            className="btn btn-secondary h-9 px-3 text-[13px]"
          >
            Buka murajaah
            <ArrowRight size={13} weight="bold" />
          </Link>
        </div>

        {daily.plan.scheduled === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            {daily.plan.manzilTotal === 0
              ? "Belum ada hafalan lama yang masuk jalur murajaah."
              : "Semua yang jatuh tempo hari ini sudah diulang. Alhamdulillah."}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {[...daily.plan.sabqi, ...daily.plan.manzil].slice(0, 10).map((task) => (
              <span
                key={task.pageNumber}
                className={`chip ${QUALITY_COLORS[task.status] ?? QUALITY_COLORS.belum} ${
                  QUALITY_TEXT[task.status] ?? QUALITY_TEXT.belum
                }`}
              >
                {task.pageNumber}
              </span>
            ))}
            {daily.plan.scheduled > 10 && (
              <span className="text-[12px] font-medium text-ink-faint">
                +{daily.plan.scheduled - 10} lagi
              </span>
            )}
            <span className="ml-auto text-[12px] font-medium text-ink-faint">
              {daily.plan.sabqi.length} {daily.settings.labels.sabqi.toLowerCase()} ·{" "}
              {daily.plan.manzil.length} {daily.settings.labels.manzil.toLowerCase()}
            </span>
          </div>
        )}
      </section>
```

- [ ] **Step 3: Verifikasi tipe & build**

Run: `pnpm exec tsc --noEmit`
Expected: tanpa error.
Run: `pnpm build`
Expected: build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/components/Nav.tsx "src/app/(app)/page.tsx"
git commit -m "feat: navigasi murajaah dan kartu tugas di dashboard"
```

---

### Task 14: Verifikasi akhir fase

**Objective:** Membuktikan seluruh fase lulus otomatis dan manual.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Jalankan seluruh test**

Run: `pnpm test`
Expected: semua test PASS, termasuk 7 file test baru Fase 3 (`settings`, `tracker-schedule`, `tracker-daily-tasks`, `tracker-daily-loader`, `murajaah-validation`, `murajaah-api`, `settings-api`) dan `tracker-derive-status` yang diperluas.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: tanpa error.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build sukses. Bila `.next` terkunci, hentikan `pnpm dev` dulu.

- [ ] **Step 4: Verifikasi manual end-to-end**

Run: `pnpm db:recompute` lalu `pnpm dev`, buka `http://127.0.0.1:3000`.

1. `/catat` → catat `sabaq` halaman 1 kualitas `lancar` dengan tanggal kemarin (atau hari ini).
2. `/murajaah` → halaman 1 muncul di seksi Sabqi (hafalan baru).
3. Tekan `Lancar` pada baris itu → halaman hilang dari daftar tugas dan muncul di "Selesai hari ini".
4. `/peta` → status halaman 1 tetap sesuai kualitas sabaq (bukan berubah karena review).
5. `/pengaturan` → ubah Batas harian ke `1` dan Siklus manzil ke `5`, simpan → pesan sukses, pratinjau cakupan berubah.
6. `/murajaah` → header menampilkan `giliran X dari 5`.
7. `/riwayat` → hapus log review tadi → `/murajaah` menampilkan halaman itu lagi sebagai tugas (replay benar).
8. Dashboard `/` → kartu "Murajaah hari ini" menampilkan angka yang sama dengan `/murajaah`.

- [ ] **Step 5: Perbarui README**

Tambahkan bagian berikut ke `README.md`, setelah bagian **Batasan**:

```markdown
## Murajaah Otomatis (Fase 3)

Jadwal murajaah diturunkan ulang dari riwayat setiap kali ada log baru, diedit, atau dihapus.

- **Sabqi** — hafalan lebih muda dari `sabqi_window_days`, diulang lewat interval (mutqin ×2, lancar +50%, lemah/baru → 1 hari).
- **Manzil** — hafalan lama, dirotasi sehingga seluruh hafalan tersentuh dalam `manzil_cycle_days`.
- **Batas harian** (`daily_load_limit`) membatasi jumlah halaman yang ditampilkan; sabqi didahulukan, sisanya dilaporkan sebagai tertunda.

Parameter diubah di `/pengaturan`. Setelah menarik kode Fase 3 pada database yang sudah berisi data, jalankan sekali:

```powershell
pnpm db:recompute
```
```

- [ ] **Step 6: Commit akhir**

```bash
git add README.md
git commit -m "docs: catatan Fase 3 (murajaah otomatis)"
```

---

## Self-Review

**Spec coverage:**

| Bagian spec | Task |
| --- | --- |
| 3.1 Dua jalur (sabqi/manzil) | Task 4 |
| 3.2 Kapan jatuh tempo | Task 4 |
| 3.3 Perkembangan interval | Task 2 |
| 3.4 Rotasi manzil | Task 2, 4 |
| 3.5 Kapasitas harian | Task 4, 11 |
| 3.6 Urutan prioritas | Task 4 |
| 4 Keputusan (tanpa migrasi, replay, tanpa tabel tugas) | Task 5 |
| 5 Perubahan data (`interval_cap_days`, isi kolom) | Task 1, 5, 10 |
| 6.1 Modul murni | Task 1–4, 6 |
| 6.2 API | Task 8, 9 |
| 6.3 Halaman & UI | Task 11, 12, 13 |
| 7 Alur data | Task 8, 11 |
| 8 Penanganan error | Task 7, 8, 9 |
| 9 Pengujian | Semua task + Task 14 |
| 10 Definisi selesai | Task 14 |

**Placeholder scan:** Tidak ada TBD/TODO. Setiap step berisi kode atau perintah konkret.

**Type consistency:**
- `PageSchedule` diproduksi Task 3, dikonsumsi Task 4, 5, 6 — field sama (`pageNumber`, `status`, `memorizedAt`, `lastReviewedAt`, `intervalDays`, `nextReviewDate`).
- `DailyTask`/`DailyPlan` diproduksi Task 4, dikonsumsi Task 6 (`buildDailyPlan`), 11 (props), 13 (dashboard).
- `AppSettings` diproduksi Task 1, dikonsumsi Task 4, 6, 8, 12.
- `DailySource` (`statuses` + `logs` + `settings`) diproduksi Task 6, dikonsumsi Task 13 (dashboard) — memungkinkan dashboard memakai baris cache tanpa query tambahan.
- `loadDailyTasks(db, date)` dipakai Task 11; `buildDailyPlan(source, date)` dipakai Task 13.
- `recomputeMemorizationStatus(db)` signature tidak berubah → semua pemanggil Fase 2 tetap valid.
- `murajaahCompleteInput` dipakai Task 8; `settingsPatchInput` dipakai Task 9.
- `CachedStatusRow` (Task 6) adalah superset `StatusRow`, jadi `summarizeProgress` tetap kompatibel.

**Review Focus terpetakan:** (1) → Task 3 test "urutan log diacak" + Task 5 test "menghapus log memundurkan jadwal"; (2) → Task 2 & Task 4 test prioritas; (3) → Task 4 test kapasitas + Task 11 banner `deferred`; (4) → Task 4 test "sudah diulang hari ini" + Task 6 `buildDailyPlan` test; (5) → Task 8 test "belum dihafal → 400 tanpa log"; (6) → Task 5 `db.batch()` dipertahankan + Task 6 `buildDailyPlan` murni + Task 13 dashboard tetap satu round-trip.

---

## Plan Review Log (2026-10-21, setelah `bf64436`)

Plan awal ditulis sebelum commit `bf64436` (perf: pangkas round-trip Turso). Review ulang terhadap kode aktual menemukan 6 masalah yang sudah diperbaiki di atas:

| # | Masalah pada plan awal | Dampak bila dieksekusi apa adanya | Perbaikan |
| --- | --- | --- | --- |
| 1 | Task 5 menulis ulang `derive-status.ts` dengan `await insert` per halaman | Mengembalikan N+1 yang baru dibereskan `bf64436` — 604 round-trip (~60s di prod) setiap simpan setoran | Ditulis ulang memakai `db.batch()` + pola `writes[0], ...slice(1), prune` |
| 2 | Task 6 `loadDailyTasks` melakukan 3 query paralel sendiri | Dashboard jadi 2 round-trip (~+180ms) padahal sudah 1 | Dipecah: `buildDailyPlan` murni + `loadDailyTasks` satu `db.batch()` |
| 3 | `getCachedStatuses()` hanya `pageNumber`+`status` | Tidak cukup untuk menghitung jadwal (`interval_days`, `next_review_date` hilang) | Cache diperluas ke seluruh kolom `memorization_status` |
| 4 | Task 13 memanggil `loadDailyTasks` di dashboard | Menambah round-trip ke halaman yang baru dioptimasi | Dashboard mengoper `statuses` dari cache + `todayLogs`/`settingRows` dari `db.batch()` yang sudah ada |
| 5 | Route `/api/murajaah/complete` & `PATCH /api/settings` tanpa `revalidateTag` | Dashboard/peta menyajikan angka basi setelah mencatat murajaah atau mengubah parameter | Kedua route memanggil `revalidateTag(PROGRESS_TAG)` |
| 6 | Task 11 query tabel `pages` untuk nama surah/juz | Query termahal (~300ms) untuk data statis yang sudah dibundel | Memakai `findPage()` dari `@/lib/mushaf/pages` |

Verifikasi: seluruh logika murni (interval, replay, prioritas, rotasi, kapasitas, `parseSettings`, `buildDailyPlan`, fallback jadwal kosong) dijalankan di harness scratch di luar repo — **27 assertion lulus, 0 gagal**. Baseline repo sebelum implementasi: `pnpm run test` 89 test / 21 file lulus, `pnpm run lint` bersih, `pnpm run build` sukses.
