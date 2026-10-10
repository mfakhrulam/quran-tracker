# Fase 2 (Tracker Inti) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah tracker inti — pencatatan setoran/murajaah per halaman, peta progres berwarna, target khatam/harian, dan proyeksi on-track — di atas fondasi Fase 1.

**Architecture:** Next.js App Router (TypeScript) + Tailwind. Logika domain murni di `src/lib/tracker/*` (diuji Vitest), diakses route handler pola `handler.ts` + `route.ts` (seperti Fase 1) dan server component. `memorization_status` diturunkan ulang dari `sessions_log` setiap create/update/delete. UI memakai server component untuk baca data dan client component untuk form/aksi.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Drizzle ORM + drizzle-kit, `@libsql/client`, Zod, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-phase-2-tracker-design.md` dan `rencana_pengembangan.md` (bagian 4, 5.1–5.3, 10).

## Global Constraints

- Bahasa aplikasi: **Indonesia** saja.
- Pengguna: **satu akun**, tanpa registrasi. Semua route/halaman kecuali `/login` wajib terautentikasi.
- Unit utama: **halaman** mushaf (1–604). Level ayat opsional (`ayah_start`/`ayah_end` nullable).
- **"Hafalan" = halaman yang pernah disetor `sabaq`.** Sabqi/manzil adalah review; tidak menambah jumlah hafalan.
- `type` disimpan **per entri log** (satu halaman bisa `sabaq` hari ini, `manzil` kemudian).
- Tanggal disimpan sebagai teks `YYYY-MM-DD`, zona waktu lokal tunggal.
- Teks ayat **tidak** ditampilkan. Hanya nomor halaman + nama surah + juz.
- Semua input divalidasi server dengan Zod. Rahasia hanya dari env; jangan pernah di-log.
- Package manager: **pnpm**. Node ≥ 22.
- Patuhi pola Fase 1: `handler.ts` (logika, mudah diuji) + `route.ts` (re-export). Test memakai DB temp (`mkdtempSync`) + `migrate`.

## Review Focus

1. **Halaman tanpa `sabaq`** — menghapus satu-satunya log `sabaq` sebuah halaman harus mengeluarkannya dari hitungan hafalan (status `belum`), meski masih ada log `sabqi`/`manzil`.
2. **Hari libur (rest days)** — hari libur harus mengurangi hari efektif sehingga pace naik; tidak boleh dihitung sebagai hari gagal.
3. **Goal khatam ganda** — hanya boleh satu goal `khatam` aktif; membuat yang baru menonaktifkan yang lama.
4. **Rentang ayat terbalik** — `ayahEnd < ayahStart` harus ditolak 400.
5. **Halaman di luar 1–604** — `pageNumber` di luar rentang harus ditolak 400 (bukan error 500).

---

## File Structure

```
quran-tracker/
  drizzle/                              # migrasi baru (generated)
  scripts/
    fetch-mushaf.ts                     # + tulis surahs.json
    seed-db.ts                          # + seed settings default
  src/
    app/
      (app)/
        layout.tsx                      # layout terproteksi + nav
        page.tsx                        # dashboard
        catat/page.tsx
        riwayat/page.tsx
        peta/page.tsx
        target/page.tsx
      api/
        progress/route.ts
        sessions/
          handler.ts
          route.ts
          [id]/handler.ts
          [id]/route.ts
        goals/
          handler.ts
          route.ts
          [id]/handler.ts
          [id]/route.ts
        rest-days/
          handler.ts
          route.ts
      page.tsx                          # DIHAPUS (dipindah ke (app)/page.tsx)
    components/
      Nav.tsx
      SessionForm.tsx
      SessionList.tsx
      ProgressMap.tsx
      GoalForm.tsx
      RestDayManager.tsx
    lib/
      auth/guard.ts                     # getSessionUserId, readCookie
      tracker/
        date.ts
        quality.ts
        validation.ts
        derive-status.ts
        progress.ts
        projection.ts
      mushaf/
        parse-tanzil.ts                 # + parseTanzilSurahs
        surahs.ts                       # loader nama surah
    data/
      surahs.json                       # hasil fetch, di-commit
  tests/
    tracker-date.test.ts
    tracker-quality.test.ts
    tracker-derive-status.test.ts
    tracker-progress.test.ts
    tracker-projection.test.ts
    parse-tanzil-surahs.test.ts
    sessions-api.test.ts
    sessions-id-api.test.ts
    goals-api.test.ts
    rest-days-api.test.ts
    progress-api.test.ts
```

---

### Task 1: Skema — kolom ayat + indeks `sessions_log`

**Files:**
- Modify: `src/db/schema.ts`
- Generate: `drizzle/0001_*.sql` (via `drizzle-kit generate`)
- Test: `tests/db.test.ts` (tambahkan kasus)

**Interfaces:**
- Produces: tabel `sessionsLog` dengan kolom tambahan `ayahStart`, `ayahEnd` (integer, nullable) dan indeks `sessions_log_date_idx`, `sessions_log_page_idx`.

- [ ] **Step 1: Tambah kolom & indeks pada skema**

Di `src/db/schema.ts`, ubah import baris pertama dan definisi `sessionsLog`:

```ts
import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
```

```ts
export const sessionsLog = sqliteTable("sessions_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  pageNumber: integer("page_number").notNull(),
  type: text("type").notNull(),
  quality: text("quality").notNull(),
  ayahStart: integer("ayah_start"),
  ayahEnd: integer("ayah_end"),
  mistakesNote: text("mistakes_note"),
  durationMin: integer("duration_min"),
}, (t) => [
  index("sessions_log_date_idx").on(t.date),
  index("sessions_log_page_idx").on(t.pageNumber),
]);
```

- [ ] **Step 2: Tambah test kolom baru**

Di `tests/db.test.ts`, tambahkan import `sessionsLog` dan kasus berikut di dalam `describe("schema", ...)`:

```ts
import { pages, users, sessionsLog } from "@/db/schema";
```

```ts
  it("menyimpan log dengan rentang ayat opsional", async () => {
    await ctx.db.insert(sessionsLog).values({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "lancar" });
    await ctx.db.insert(sessionsLog).values({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "mutqin", ayahStart: 1, ayahEnd: 3 });
    const rows = await ctx.db.select().from(sessionsLog);
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.ayahStart === 1)?.ayahEnd).toBe(3);
  });
```

- [ ] **Step 3: Jalankan test (harus gagal dulu karena migrasi belum ada)**

Run: `pnpm test tests/db.test.ts`
Expected: FAIL — kolom `ayah_start` belum ada di DB temp (migrasi lama).

- [ ] **Step 4: Generate migrasi**

Run: `pnpm db:generate`
Expected: file baru `drizzle/0001_*.sql` berisi `ALTER TABLE sessions_log ADD ...` dan `CREATE INDEX`.

- [ ] **Step 5: Terapkan ke DB lokal (dev)**

Run: `pnpm db:migrate`
Expected: log "Migrasi selesai."

- [ ] **Step 6: Jalankan test (harus lulus)**

Run: `pnpm test tests/db.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts drizzle tests/db.test.ts
git commit -m "feat: kolom rentang ayat + indeks pada sessions_log"
```

---

### Task 2: Parser surah + `surahs.json`

**Files:**
- Modify: `src/lib/mushaf/parse-tanzil.ts` (tambah `parseTanzilSurahs`)
- Modify: `scripts/fetch-mushaf.ts` (tulis `surahs.json`)
- Create: `src/data/surahs.json` (generated & di-commit)
- Test: `tests/parse-tanzil-surahs.test.ts`

**Interfaces:**
- Produces: `parseTanzilSurahs(source: string): SurahRow[]` dengan `SurahRow = { number: number; arabic: string; latin: string; ayahCount: number }`, mengembalikan 114 baris terurut.

- [ ] **Step 1: Tulis failing test**

`tests/parse-tanzil-surahs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTanzilSurahs } from "@/lib/mushaf/parse-tanzil";

const FIXTURE = `
QuranData.Sura = [
	// [start, ayas, order, rukus, name, tname, ename, type]
	[],
	[0, 7, 5, 1, 'الفاتحة', "Al-Faatiha", 'The Opening', 'Meccan'],
	[7, 286, 87, 40, 'البقرة', "Al-Baqara", 'The Cow', 'Medinan'],
	[293, 200, 89, 20, 'آل عمران', "Aal-i-Imraan", 'Family', 'Medinan'],
	[6236, 1]
];
`;

describe("parseTanzilSurahs", () => {
  const rows = parseTanzilSurahs(FIXTURE);
  it("menghasilkan 114 baris pada data asli; fixture menghasilkan 3", () => {
    expect(rows).toHaveLength(3);
  });
  it("nomor surah berurutan dari 1 dan melewati entri kosong/total", () => {
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3]);
  });
  it("mengambil nama arab, latin, dan jumlah ayat", () => {
    expect(rows[0]).toMatchObject({ number: 1, arabic: "الفاتحة", latin: "Al-Faatiha", ayahCount: 7 });
    expect(rows[1]).toMatchObject({ number: 2, arabic: "البقرة", latin: "Al-Baqara", ayahCount: 286 });
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

Run: `pnpm test tests/parse-tanzil-surahs.test.ts`
Expected: FAIL — `parseTanzilSurahs` belum ada.

- [ ] **Step 3: Implementasi parser**

Tambahkan ke `src/lib/mushaf/parse-tanzil.ts` (jangan ubah `parseTanzilMetadata`):

```ts
export interface SurahRow {
  number: number;
  arabic: string;
  latin: string;
  ayahCount: number;
}

function stripQuotes(value: string): string {
  const t = value.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseTanzilSurahs(source: string): SurahRow[] {
  const re = /QuranData\.Sura\s*=\s*\[([\s\S]*?)\];/;
  const m = source.match(re);
  if (!m) throw new Error("QuranData.Sura tidak ditemukan");
  const entries = m[1].match(/\[[^\]]*\]/g) ?? [];
  const rows: SurahRow[] = [];
  let number = 0;
  for (const entry of entries) {
    const parts = entry.slice(1, -1).split(",").map((t) => t.trim());
    if (parts.length < 8) continue;
    number += 1;
    rows.push({
      number,
      arabic: stripQuotes(parts[4]),
      latin: stripQuotes(parts[5]),
      ayahCount: Number(parts[1]),
    });
  }
  if (rows.length === 0) throw new Error("Data surah kosong");
  return rows;
}
```

- [ ] **Step 4: Jalankan test (lulus)**

Run: `pnpm test tests/parse-tanzil-surahs.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Perluas script fetch untuk menulis `surahs.json`**

Ubah `scripts/fetch-mushaf.ts` menjadi:

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { parseTanzilMetadata, parseTanzilSurahs } from "../src/lib/mushaf/parse-tanzil";

const SOURCE_URL = "https://tanzil.net/res/text/metadata/quran-data.js";

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Gagal fetch: HTTP ${res.status}`);
  const source = await res.text();
  const rows = parseTanzilMetadata(source);
  const surahs = parseTanzilSurahs(source);

  if (rows.length !== 604) throw new Error(`Harus 604 halaman, dapat ${rows.length}`);
  if (surahs.length !== 114) throw new Error(`Harus 114 surah, dapat ${surahs.length}`);
  if (rows[0].surahStart !== 1 || rows[0].ayahStart !== 1) throw new Error("Halaman 1 tidak valid");
  const last = rows[603];
  if (last.surahEnd !== 114 || last.ayahEnd !== 6) throw new Error("Halaman 604 tidak valid");

  mkdirSync("src/data", { recursive: true });
  writeFileSync("src/data/pages.json", JSON.stringify(rows, null, 2) + "\n");
  writeFileSync("src/data/surahs.json", JSON.stringify(surahs, null, 2) + "\n");
  console.log(`Menulis 604 halaman + 114 surah ke src/data/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Jalankan fetch**

Run: `pnpm mushaf:fetch`
Expected: log "Menulis 604 halaman + 114 surah..." dan `src/data/surahs.json` muncul.

- [ ] **Step 7: Verifikasi isi JSON**

Run: `node -e "const s=require('./src/data/surahs.json'); console.log(s.length, JSON.stringify(s[0]), JSON.stringify(s[113]));"`
Expected: `114` lalu surah 1 `Al-Faatiha`/7 dan surah 114 `An-Naas`/6.

- [ ] **Step 8: Commit**

```bash
git add src/lib/mushaf/parse-tanzil.ts scripts/fetch-mushaf.ts src/data/surahs.json tests/parse-tanzil-surahs.test.ts
git commit -m "feat: parser + data 114 surah (Tanzil CC-BY)"
```

---

### Task 3: Loader nama surah + seed settings default

**Files:**
- Create: `src/lib/mushaf/surahs.ts`
- Modify: `scripts/seed-db.ts` (seed settings)
- Modify: `tests/seed.test.ts` (tambahkan asersi settings)

**Interfaces:**
- Consumes: `src/data/surahs.json` (Task 2), `settings` table (Fase 1).
- Produces:
  - `SURAHS: SurahInfo[]`, `surahName(number: number): string`, `SurahInfo = { number; arabic; latin; ayahCount }`.
  - `seed()` kini juga mengisi 6 baris `settings` default secara idempotent.

- [ ] **Step 1: Tulis loader surah**

`src/lib/mushaf/surahs.ts`:

```ts
import surahsData from "@/data/surahs.json";

export interface SurahInfo {
  number: number;
  arabic: string;
  latin: string;
  ayahCount: number;
}

export const SURAHS = surahsData as SurahInfo[];

export function surahName(number: number): string {
  return SURAHS.find((s) => s.number === number)?.latin ?? `Surah ${number}`;
}
```

- [ ] **Step 2: Tulis failing test settings seed**

Di `tests/seed.test.ts`, tambahkan import `settings` dan kasus berikut:

```ts
import { pages, users, settings } from "@/db/schema";
```

```ts
  it("mengisi settings default secara idempotent", async () => {
    const rows = await ctx.db.select().from(settings);
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("sabqi_window_days");
    expect(keys).toContain("manzil_cycle_days");
    expect(keys).toContain("daily_load_limit");
    expect(keys).toContain("label_sabaq");
    const before = rows.length;
    await seed(ctx.db, {});
    expect((await ctx.db.select().from(settings)).length).toBe(before);
  });
```

- [ ] **Step 3: Jalankan test (gagal)**

Run: `pnpm test tests/seed.test.ts`
Expected: FAIL — settings belum di-seed.

- [ ] **Step 4: Implementasi seed settings**

Di `scripts/seed-db.ts`, tambah import `settings` dan konstanta, lalu sisipkan blok seed di dalam `seed()` (setelah blok pages, sebelum blok owner):

```ts
import { pages, users, settings } from "../src/db/schema";
```

```ts
export const DEFAULT_SETTINGS: Record<string, string> = {
  sabqi_window_days: "14",
  manzil_cycle_days: "7",
  daily_load_limit: "2",
  label_sabaq: "Sabaq",
  label_sabqi: "Sabqi",
  label_manzil: "Manzil",
};
```

```ts
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }
```

- [ ] **Step 5: Jalankan test (lulus)**

Run: `pnpm test tests/seed.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mushaf/surahs.ts scripts/seed-db.ts tests/seed.test.ts
git commit -m "feat: loader nama surah + seed settings default"
```

---

### Task 4: Modul `date.ts` (tanggal & hari efektif)

**Files:**
- Create: `src/lib/tracker/date.ts`
- Test: `tests/tracker-date.test.ts`

**Interfaces:**
- Produces:
  - `todayISO(now?: Date): string`
  - `isValidISODate(s: string): boolean`
  - `addDays(iso: string, n: number): string`
  - `daysBetween(a: string, b: string): number`
  - `countRestDaysInRange(restDays: string[], startISO: string, endISO: string): number`
  - `effectiveDaysElapsed(startISO: string, todayISO: string, restDays: string[]): number` (min 1)

- [ ] **Step 1: Tulis failing test**

`tests/tracker-date.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { todayISO, isValidISODate, addDays, daysBetween, countRestDaysInRange, effectiveDaysElapsed } from "@/lib/tracker/date";

describe("tracker/date", () => {
  it("todayISO memformat lokal sebagai YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 9, 10))).toBe("2026-10-10");
  });
  it("isValidISODate menolak format salah", () => {
    expect(isValidISODate("2026-10-10")).toBe(true);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("10/10/2026")).toBe(false);
  });
  it("addDays melewati batas bulan", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("daysBetween mengembalikan selisih hari", () => {
    expect(daysBetween("2026-10-01", "2026-10-10")).toBe(9);
  });
  it("countRestDaysInRange menghitung hari libur dalam rentang inklusif", () => {
    expect(countRestDaysInRange(["2026-10-03", "2026-10-05", "2026-11-01"], "2026-10-01", "2026-10-10")).toBe(2);
  });
  it("effectiveDaysElapsed mengurangi hari libur, minimal 1", () => {
    expect(effectiveDaysElapsed("2026-10-01", "2026-10-10", [])).toBe(10);
    expect(effectiveDaysElapsed("2026-10-01", "2026-10-10", ["2026-10-03", "2026-10-04"])).toBe(8);
    expect(effectiveDaysElapsed("2026-10-10", "2026-10-10", ["2026-10-10"])).toBe(1);
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

Run: `pnpm test tests/tracker-date.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/tracker/date.ts`:

```ts
const MS_PER_DAY = 86_400_000;

function parseISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatUTC(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(iso: string, n: number): string {
  return formatUTC(parseISO(iso) + n * MS_PER_DAY);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b) - parseISO(a)) / MS_PER_DAY);
}

export function countRestDaysInRange(restDays: string[], startISO: string, endISO: string): number {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  return restDays.filter((r) => {
    const t = parseISO(r);
    return t >= start && t <= end;
  }).length;
}

export function effectiveDaysElapsed(startISO: string, todayISOStr: string, restDays: string[]): number {
  const total = daysBetween(startISO, todayISOStr) + 1;
  const rest = countRestDaysInRange(restDays, startISO, todayISOStr);
  return Math.max(1, total - rest);
}
```

- [ ] **Step 4: Jalankan test (lulus)**

Run: `pnpm test tests/tracker-date.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker/date.ts tests/tracker-date.test.ts
git commit -m "feat: modul tanggal tracker (hari efektif, rest days)"
```

---

### Task 5: Modul `quality.ts` + `validation.ts`

**Files:**
- Create: `src/lib/tracker/quality.ts`
- Create: `src/lib/tracker/validation.ts`
- Test: `tests/tracker-quality.test.ts`

**Interfaces:**
- Produces:
  - `SESSION_TYPES`, `QUALITY_LEVELS`, `MEMO_STATUSES` (const arrays)
  - `isSessionType(v): boolean`, `isQuality(v): boolean`
  - `QUALITY_COLORS: Record<string, string>` (kelas Tailwind)
  - Zod: `sessionLogInput`, `goalInput`, `restDayInput`, `idParam`

- [ ] **Step 1: Tulis failing test**

`tests/tracker-quality.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SESSION_TYPES, QUALITY_LEVELS, isSessionType, isQuality, QUALITY_COLORS } from "@/lib/tracker/quality";
import { sessionLogInput, goalInput, restDayInput } from "@/lib/tracker/validation";

describe("tracker/quality", () => {
  it("mendefinisikan tipe & kualitas", () => {
    expect(SESSION_TYPES).toEqual(["sabaq", "sabqi", "manzil"]);
    expect(QUALITY_LEVELS).toContain("mutqin");
  });
  it("validator boolean", () => {
    expect(isSessionType("sabaq")).toBe(true);
    expect(isSessionType("xyz")).toBe(false);
    expect(isQuality("lancar")).toBe(true);
    expect(isQuality("bagus")).toBe(false);
  });
  it("punya warna untuk tiap kualitas", () => {
    for (const q of QUALITY_LEVELS) expect(typeof QUALITY_COLORS[q]).toBe("string");
  });
});

describe("tracker/validation", () => {
  it("menerima log valid tanpa ayat", () => {
    expect(sessionLogInput.safeParse({ date: "2026-10-10", pageNumber: 5, type: "sabaq", quality: "lancar" }).success).toBe(true);
  });
  it("menolak pageNumber di luar 1-604", () => {
    expect(sessionLogInput.safeParse({ date: "2026-10-10", pageNumber: 605, type: "sabaq", quality: "lancar" }).success).toBe(false);
  });
  it("menolak ayahEnd < ayahStart", () => {
    expect(sessionLogInput.safeParse({ date: "2026-10-10", pageNumber: 5, type: "sabaq", quality: "lancar", ayahStart: 5, ayahEnd: 2 }).success).toBe(false);
  });
  it("goal valid & rest day valid", () => {
    expect(goalInput.safeParse({ type: "khatam", targetPages: 604, startDate: "2026-10-10" }).success).toBe(true);
    expect(restDayInput.safeParse({ date: "2026-10-10" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

Run: `pnpm test tests/tracker-quality.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `quality.ts`**

`src/lib/tracker/quality.ts`:

```ts
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
```

- [ ] **Step 4: Implementasi `validation.ts`**

`src/lib/tracker/validation.ts`:

```ts
import { z } from "zod";
import { SESSION_TYPES, QUALITY_LEVELS } from "./quality";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD");

export const sessionLogInput = z
  .object({
    date: isoDate,
    pageNumber: z.number().int().min(1).max(604),
    type: z.enum(SESSION_TYPES),
    quality: z.enum(QUALITY_LEVELS),
    ayahStart: z.number().int().min(1).optional(),
    ayahEnd: z.number().int().min(1).optional(),
    mistakesNote: z.string().max(2000).optional(),
    durationMin: z.number().int().min(0).optional(),
  })
  .refine((d) => d.ayahStart === undefined || d.ayahEnd === undefined || d.ayahEnd >= d.ayahStart, {
    message: "ayahEnd harus >= ayahStart",
    path: ["ayahEnd"],
  });

export const goalInput = z.object({
  type: z.enum(["khatam", "harian"]),
  targetPages: z.number().int().min(1).max(604),
  startDate: isoDate,
  deadline: isoDate.nullable().optional(),
});

export const restDayInput = z.object({
  date: isoDate,
  reason: z.string().max(500).optional(),
});

export const idParam = z.coerce.number().int().positive();
```

- [ ] **Step 5: Jalankan test (lulus)**

Run: `pnpm test tests/tracker-quality.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tracker/quality.ts src/lib/tracker/validation.ts tests/tracker-quality.test.ts
git commit -m "feat: konstanta kualitas + skema validasi tracker"
```

---

### Task 6: Modul `derive-status.ts` (recompute dari log)

**Files:**
- Create: `src/lib/tracker/derive-status.ts`
- Test: `tests/tracker-derive-status.test.ts`

**Interfaces:**
- Consumes: `sessionsLog`, `memorizationStatus` (Fase 1), `createDb`/`migrate`.
- Produces: `recomputeMemorizationStatus(db: LibSQLDatabase<typeof schema>): Promise<void>`.
  - `status` = kualitas log `sabaq` terbaru untuk halaman itu.
  - `memorizedAt` = tanggal log `sabaq` pertama.
  - `lastReviewedAt` = tanggal log terbaru (tipe apa pun).
  - Halaman tanpa log `sabaq` → barisnya dihapus dari `memorization_status`.

- [ ] **Step 1: Tulis failing test**

`tests/tracker-derive-status.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, sessionsLog, memorizationStatus } from "@/db/schema";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";

let dir: string;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-derive-"));
  ctx = createDb(`file:${join(dir, "d.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  await ctx.db.insert(pages).values([
    { pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 },
    { pageNumber: 2, juz: 1, surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 },
  ]);
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });
beforeEach(async () => { await ctx.db.delete(sessionsLog); await ctx.db.delete(memorizationStatus); });

describe("recomputeMemorizationStatus", () => {
  it("status dari sabaq terbaru, memorizedAt dari sabaq pertama", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "baru" },
      { date: "2026-10-05", pageNumber: 1, type: "sabaq", quality: "mutqin" },
      { date: "2026-10-06", pageNumber: 1, type: "manzil", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    const rows = await ctx.db.select().from(memorizationStatus);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("mutqin");
    expect(rows[0].memorizedAt?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(rows[0].lastReviewedAt?.toISOString().slice(0, 10)).toBe("2026-10-06");
  });

  it("halaman tanpa sabaq tidak dihitung meski ada sabqi/manzil", async () => {
    await ctx.db.insert(sessionsLog).values([
      { date: "2026-10-06", pageNumber: 2, type: "manzil", quality: "lancar" },
    ]);
    await recomputeMemorizationStatus(ctx.db);
    expect(await ctx.db.select().from(memorizationStatus)).toHaveLength(0);
  });

  it("menghapus status saat sabaq satu-satunya dihapus", async () => {
    await ctx.db.insert(sessionsLog).values({ date: "2026-10-01", pageNumber: 1, type: "sabaq", quality: "lancar" });
    await recomputeMemorizationStatus(ctx.db);
    expect(await ctx.db.select().from(memorizationStatus)).toHaveLength(1);
    await ctx.db.delete(sessionsLog);
    await recomputeMemorizationStatus(ctx.db);
    expect(await ctx.db.select().from(memorizationStatus)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

Run: `pnpm test tests/tracker-derive-status.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/tracker/derive-status.ts`:

```ts
import { notInArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessionsLog, memorizationStatus } from "@/db/schema";
import type * as schema from "@/db/schema";

export async function recomputeMemorizationStatus(db: LibSQLDatabase<typeof schema>): Promise<void> {
  const logs = await db.select().from(sessionsLog).orderBy(sessionsLog.date, sessionsLog.id);

  const sabaqFirst = new Map<number, string>();
  const sabaqLast = new Map<number, string>();
  const lastReview = new Map<number, string>();

  for (const log of logs) {
    lastReview.set(log.pageNumber, log.date);
    if (log.type === "sabaq") {
      if (!sabaqFirst.has(log.pageNumber)) sabaqFirst.set(log.pageNumber, log.date);
      sabaqLast.set(log.pageNumber, log.quality);
    }
  }

  for (const [pageNumber, quality] of sabaqLast) {
    const memorizedAt = new Date(sabaqFirst.get(pageNumber)!);
    const lastReviewedAt = new Date(lastReview.get(pageNumber)!);
    await db
      .insert(memorizationStatus)
      .values({ pageNumber, status: quality, memorizedAt, lastReviewedAt })
      .onConflictDoUpdate({
        target: memorizationStatus.pageNumber,
        set: { status: quality, memorizedAt, lastReviewedAt },
      });
  }

  const memorizedPageNumbers = [...sabaqLast.keys()];
  if (memorizedPageNumbers.length === 0) {
    await db.delete(memorizationStatus);
  } else {
    await db.delete(memorizationStatus).where(notInArray(memorizationStatus.pageNumber, memorizedPageNumbers));
  }
}
```

- [ ] **Step 4: Jalankan test (lulus)**

Run: `pnpm test tests/tracker-derive-status.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker/derive-status.ts tests/tracker-derive-status.test.ts
git commit -m "feat: recompute memorization_status dari riwayat log"
```

---

### Task 7: Modul `progress.ts`

**Files:**
- Create: `src/lib/tracker/progress.ts`
- Test: `tests/tracker-progress.test.ts`

**Interfaces:**
- Consumes: `pages`, `memorizationStatus`.
- Produces: `computeProgress(db): Promise<ProgressSummary>` dengan
  `ProgressSummary = { totalPages; memorizedPages; percent; byStatus: Record<string, number>; byJuz: { juz; total; memorized }[] }`.

- [ ] **Step 1: Tulis failing test**

`tests/tracker-progress.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, memorizationStatus } from "@/db/schema";
import { computeProgress } from "@/lib/tracker/progress";

let dir: string;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-prog-"));
  ctx = createDb(`file:${join(dir, "p.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  await ctx.db.insert(pages).values([
    { pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 },
    { pageNumber: 2, juz: 1, surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 },
    { pageNumber: 3, juz: 1, surahStart: 2, ayahStart: 6, surahEnd: 2, ayahEnd: 10 },
    { pageNumber: 22, juz: 2, surahStart: 2, ayahStart: 142, surahEnd: 2, ayahEnd: 150 },
  ]);
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("computeProgress", () => {
  it("menghitung hafalan & persen dari status != belum", async () => {
    await ctx.db.insert(memorizationStatus).values([
      { pageNumber: 1, status: "mutqin" },
      { pageNumber: 2, status: "lemah" },
    ]);
    const p = await computeProgress(ctx.db);
    expect(p.totalPages).toBe(4);
    expect(p.memorizedPages).toBe(2);
    expect(p.percent).toBeCloseTo(0.5);
    expect(p.byStatus.belum).toBe(2);
    expect(p.byStatus.mutqin).toBe(1);
    expect(p.byStatus.lemah).toBe(1);
  });
  it("mengelompokkan per juz", async () => {
    const p = await computeProgress(ctx.db);
    const juz1 = p.byJuz.find((j) => j.juz === 1);
    const juz2 = p.byJuz.find((j) => j.juz === 2);
    expect(juz1).toMatchObject({ total: 3, memorized: 2 });
    expect(juz2).toMatchObject({ total: 1, memorized: 0 });
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

Run: `pnpm test tests/tracker-progress.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/tracker/progress.ts`:

```ts
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { pages, memorizationStatus } from "@/db/schema";
import type * as schema from "@/db/schema";
import { QUALITY_LEVELS } from "./quality";

export interface JuzProgress {
  juz: number;
  total: number;
  memorized: number;
}

export interface ProgressSummary {
  totalPages: number;
  memorizedPages: number;
  percent: number;
  byStatus: Record<string, number>;
  byJuz: JuzProgress[];
}

export async function computeProgress(db: LibSQLDatabase<typeof schema>): Promise<ProgressSummary> {
  const allPages = await db.select({ pageNumber: pages.pageNumber, juz: pages.juz }).from(pages);
  const statuses = await db.select().from(memorizationStatus);
  const statusByPage = new Map(statuses.map((s) => [s.pageNumber, s.status]));

  const byStatus: Record<string, number> = { belum: 0 };
  for (const q of QUALITY_LEVELS) byStatus[q] = 0;

  let memorizedPages = 0;
  const juzMap = new Map<number, JuzProgress>();

  for (const page of allPages) {
    const status = statusByPage.get(page.pageNumber) ?? "belum";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const isMemorized = status !== "belum";
    if (isMemorized) memorizedPages += 1;

    const entry = juzMap.get(page.juz) ?? { juz: page.juz, total: 0, memorized: 0 };
    entry.total += 1;
    if (isMemorized) entry.memorized += 1;
    juzMap.set(page.juz, entry);
  }

  const byJuz = [...juzMap.values()].sort((a, b) => a.juz - b.juz);
  return {
    totalPages: allPages.length,
    memorizedPages,
    percent: allPages.length > 0 ? memorizedPages / allPages.length : 0,
    byStatus,
    byJuz,
  };
}
```

- [ ] **Step 4: Jalankan test (lulus)**

Run: `pnpm test tests/tracker-progress.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker/progress.ts tests/tracker-progress.test.ts
git commit -m "feat: agregat progres hafalan per status & juz"
```

---

### Task 8: Modul `projection.ts`

**Files:**
- Create: `src/lib/tracker/projection.ts`
- Test: `tests/tracker-projection.test.ts`

**Interfaces:**
- Consumes: `date.ts` (Task 4).
- Produces:
  - `ProjectionInput = { targetPages; startDate; deadline: string | null; memorizedPages; restDays: string[]; today: string }`
  - `Projection = { remainingPages; effectiveDaysElapsed; pace; projectedFinishDate: string | null; daysRemainingToDeadline: number | null; requiredPace: number | null; onTrack: boolean | null; status: "belum-mulai" | "on-track" | "terlambat" | "tanpa-tenggat" }`
  - `computeProjection(input): Projection`

- [ ] **Step 1: Tulis failing test**

`tests/tracker-projection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeProjection } from "@/lib/tracker/projection";

describe("computeProjection", () => {
  it("tanpa tenggat: status tanpa-tenggat, onTrack null", () => {
    const p = computeProjection({ targetPages: 604, startDate: "2026-10-01", deadline: null, memorizedPages: 60, restDays: [], today: "2026-10-10" });
    expect(p.status).toBe("tanpa-tenggat");
    expect(p.onTrack).toBeNull();
    expect(p.remainingPages).toBe(544);
    expect(p.pace).toBeCloseTo(6);
  });

  it("rest days menaikkan pace (hari efektif lebih sedikit)", () => {
    const noRest = computeProjection({ targetPages: 604, startDate: "2026-10-01", deadline: null, memorizedPages: 60, restDays: [], today: "2026-10-10" });
    const withRest = computeProjection({ targetPages: 604, startDate: "2026-10-01", deadline: null, memorizedPages: 60, restDays: ["2026-10-03", "2026-10-04"], today: "2026-10-10" });
    expect(withRest.effectiveDaysElapsed).toBe(8);
    expect(withRest.pace).toBeGreaterThan(noRest.pace);
  });

  it("on-track bila pace >= requiredPace", () => {
    const p = computeProjection({ targetPages: 604, startDate: "2026-09-01", deadline: "2026-12-31", memorizedPages: 300, restDays: [], today: "2026-10-10" });
    expect(p.pace).toBeCloseTo(7.5);
    expect(p.onTrack).toBe(true);
    expect(p.status).toBe("on-track");
    expect(p.requiredPace).not.toBeNull();
  });

  it("terlambat bila pace < requiredPace", () => {
    const p = computeProjection({ targetPages: 604, startDate: "2026-10-01", deadline: "2026-10-20", memorizedPages: 5, restDays: [], today: "2026-10-10" });
    expect(p.onTrack).toBe(false);
    expect(p.status).toBe("terlambat");
  });

  it("belum-mulai bila belum ada hafalan", () => {
    const p = computeProjection({ targetPages: 604, startDate: "2026-10-10", deadline: "2026-12-31", memorizedPages: 0, restDays: [], today: "2026-10-10" });
    expect(p.status).toBe("belum-mulai");
    expect(p.pace).toBe(0);
    expect(p.projectedFinishDate).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

Run: `pnpm test tests/tracker-projection.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/tracker/projection.ts`:

```ts
import { addDays, daysBetween, countRestDaysInRange, effectiveDaysElapsed } from "./date";

export interface ProjectionInput {
  targetPages: number;
  startDate: string;
  deadline: string | null;
  memorizedPages: number;
  restDays: string[];
  today: string;
}

export type ProjectionStatus = "belum-mulai" | "on-track" | "terlambat" | "tanpa-tenggat";

export interface Projection {
  remainingPages: number;
  effectiveDaysElapsed: number;
  pace: number;
  projectedFinishDate: string | null;
  daysRemainingToDeadline: number | null;
  requiredPace: number | null;
  onTrack: boolean | null;
  status: ProjectionStatus;
}

export function computeProjection(input: ProjectionInput): Projection {
  const { targetPages, startDate, deadline, memorizedPages, restDays, today } = input;
  const remainingPages = Math.max(targetPages - memorizedPages, 0);
  const elapsed = effectiveDaysElapsed(startDate, today, restDays);
  const pace = elapsed > 0 ? memorizedPages / elapsed : 0;

  let projectedFinishDate: string | null = null;
  if (remainingPages === 0) {
    projectedFinishDate = today;
  } else if (pace > 0) {
    projectedFinishDate = addDays(today, Math.ceil(remainingPages / pace));
  }

  let daysRemainingToDeadline: number | null = null;
  let requiredPace: number | null = null;
  let onTrack: boolean | null = null;
  let status: ProjectionStatus = "tanpa-tenggat";

  if (deadline) {
    const daysLeft = daysBetween(today, deadline) + 1 - countRestDaysInRange(restDays, today, deadline);
    daysRemainingToDeadline = daysLeft;
    if (remainingPages === 0) {
      requiredPace = 0;
      onTrack = true;
    } else if (daysLeft <= 0) {
      requiredPace = null;
      onTrack = false;
    } else {
      requiredPace = remainingPages / daysLeft;
      onTrack = pace >= requiredPace;
    }
    status = onTrack ? "on-track" : "terlambat";
  }

  if (memorizedPages === 0) {
    status = deadline ? "belum-mulai" : "tanpa-tenggat";
  }

  return {
    remainingPages,
    effectiveDaysElapsed: elapsed,
    pace,
    projectedFinishDate,
    daysRemainingToDeadline,
    requiredPace,
    onTrack,
    status,
  };
}
```

- [ ] **Step 4: Jalankan test (lulus)**

Run: `pnpm test tests/tracker-projection.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker/projection.ts tests/tracker-projection.test.ts
git commit -m "feat: proyeksi khatam (pace, estimasi, on-track)"
```

---

### Task 9: Guard sesi + API `sessions` (GET/POST)

**Files:**
- Create: `src/lib/auth/guard.ts`
- Create: `src/app/api/sessions/handler.ts`
- Create: `src/app/api/sessions/route.ts`
- Test: `tests/sessions-api.test.ts`

**Interfaces:**
- Consumes: `getDb`, `verifySession`, `createSession` (Fase 1); `sessionLogInput` (Task 5); `recomputeMemorizationStatus` (Task 6); `pages`.
- Produces:
  - `readCookie(header, name): string | undefined`
  - `getSessionUserId(req: Request): Promise<number | null>`
  - `listSessionsHandler(req): Promise<Response>` → 200 `{ sessions }`, 401 tanpa sesi
  - `createSessionLogHandler(req): Promise<Response>` → 201 `{ session }`, 400 invalid, 401 tanpa sesi

- [ ] **Step 1: Implementasi guard**

`src/lib/auth/guard.ts`:

```ts
import { getDb } from "@/lib/auth/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export async function getSessionUserId(req: Request): Promise<number | null> {
  const token = readCookie(req.headers.get("cookie") ?? "", SESSION_COOKIE);
  if (!token) return null;
  const session = await verifySession(getDb(), token);
  return session?.userId ?? null;
}
```

- [ ] **Step 2: Tulis failing test**

`tests/sessions-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, users } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-sessapi-"));
  ctx = createDb(`file:${join(dir, "s.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  await ctx.db.insert(pages).values({ pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 });
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "s.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

async function post(body: unknown, withCookie = true) {
  const { createSessionLogHandler } = await import("@/app/api/sessions/handler");
  return createSessionLogHandler(new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
}

describe("sessions API", () => {
  it("401 tanpa sesi", async () => {
    const res = await post({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "lancar" }, false);
    expect(res.status).toBe(401);
  });
  it("400 saat pageNumber di luar rentang", async () => {
    const res = await post({ date: "2026-10-10", pageNumber: 999, type: "sabaq", quality: "lancar" });
    expect(res.status).toBe(400);
  });
  it("201 saat sukses & memperbarui status hafalan", async () => {
    const res = await post({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "mutqin" });
    expect(res.status).toBe(201);
    const { listSessionsHandler } = await import("@/app/api/sessions/handler");
    const list = await listSessionsHandler(new Request("http://localhost/api/sessions", { headers: { cookie } }));
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.sessions.length).toBe(1);
  });
});
```

- [ ] **Step 3: Jalankan test (gagal)**

Run: `pnpm test tests/sessions-api.test.ts`
Expected: FAIL — handler belum ada.

- [ ] **Step 4: Implementasi handler**

`src/app/api/sessions/handler.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { pages, sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { sessionLogInput } from "@/lib/tracker/validation";

export async function listSessionsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const pageNumber = url.searchParams.get("pageNumber");

  const conditions = [];
  if (date) conditions.push(eq(sessionsLog.date, date));
  if (pageNumber) conditions.push(eq(sessionsLog.pageNumber, Number(pageNumber)));

  const db = getDb();
  const rows = await db
    .select()
    .from(sessionsLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sessionsLog.date, sessionsLog.id);
  return Response.json({ sessions: rows });
}

export async function createSessionLogHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = sessionLogInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const data = parsed.data;

  const db = getDb();
  const page = await db.select().from(pages).where(eq(pages.pageNumber, data.pageNumber));
  if (page.length === 0) return Response.json({ error: "Halaman tidak ditemukan" }, { status: 400 });

  const inserted = await db
    .insert(sessionsLog)
    .values({
      date: data.date,
      pageNumber: data.pageNumber,
      type: data.type,
      quality: data.quality,
      ayahStart: data.ayahStart ?? null,
      ayahEnd: data.ayahEnd ?? null,
      mistakesNote: data.mistakesNote ?? null,
      durationMin: data.durationMin ?? null,
    })
    .returning();

  await recomputeMemorizationStatus(db);
  return Response.json({ session: inserted[0] }, { status: 201 });
}
```

- [ ] **Step 5: Implementasi route**

`src/app/api/sessions/route.ts`:

```ts
import { listSessionsHandler, createSessionLogHandler } from "./handler";

export const GET = listSessionsHandler;
export const POST = createSessionLogHandler;
```

- [ ] **Step 6: Jalankan test (lulus)**

Run: `pnpm test tests/sessions-api.test.ts`
Expected: PASS (3 test).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/guard.ts src/app/api/sessions tests/sessions-api.test.ts
git commit -m "feat: API sessions (list, create) + guard sesi"
```

---

### Task 10: API `sessions/[id]` (PATCH/DELETE)

**Files:**
- Create: `src/app/api/sessions/[id]/handler.ts`
- Create: `src/app/api/sessions/[id]/route.ts`
- Test: `tests/sessions-id-api.test.ts`

**Interfaces:**
- Consumes: `sessionLogInput`, `idParam`, `recomputeMemorizationStatus`, `sessionsLog`.
- Produces:
  - `updateSessionLogHandler(req, id: number): Promise<Response>` → 200 `{ session }`, 400, 404, 401
  - `deleteSessionLogHandler(req, id: number): Promise<Response>` → 200 `{ ok: true }`, 404, 401

- [ ] **Step 1: Tulis failing test**

`tests/sessions-id-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, users, memorizationStatus } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-sessid-"));
  ctx = createDb(`file:${join(dir, "s.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  await ctx.db.insert(pages).values({ pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 });
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "s.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("sessions/[id] API", () => {
  it("PATCH mengubah kualitas dan recompute", async () => {
    const { createSessionLogHandler, updateSessionLogHandler } = await import("@/app/api/sessions/handler");
    const created = await createSessionLogHandler(new Request("http://localhost/api/sessions", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru" }),
    }));
    const { session } = await created.json();

    const res = await updateSessionLogHandler(new Request(`http://localhost/api/sessions/${session.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "mutqin" }),
    }), session.id);
    expect(res.status).toBe(200);
    const status = await ctx.db.select().from(memorizationStatus);
    expect(status[0].status).toBe("mutqin");
  });

  it("DELETE menghapus log dan mengosongkan status", async () => {
    const { listSessionsHandler, deleteSessionLogHandler } = await import("@/app/api/sessions/handler");
    const list = await listSessionsHandler(new Request("http://localhost/api/sessions", { headers: { cookie } }));
    const { sessions } = await list.json();
    const res = await deleteSessionLogHandler(new Request(`http://localhost/api/sessions/${sessions[0].id}`, {
      method: "DELETE", headers: { cookie },
    }), sessions[0].id);
    expect(res.status).toBe(200);
    expect(await ctx.db.select().from(memorizationStatus)).toHaveLength(0);
  });

  it("404 untuk id tidak ada", async () => {
    const { updateSessionLogHandler } = await import("@/app/api/sessions/handler");
    const res = await updateSessionLogHandler(new Request("http://localhost/api/sessions/9999", {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ date: "2026-10-10", pageNumber: 1, type: "sabaq", quality: "baru" }),
    }), 9999);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

Run: `pnpm test tests/sessions-id-api.test.ts`
Expected: FAIL — handler belum ada.

- [ ] **Step 3: Implementasi handler**

`src/app/api/sessions/[id]/handler.ts`:

```ts
import { eq } from "drizzle-orm";
import { sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { sessionLogInput } from "@/lib/tracker/validation";

export async function updateSessionLogHandler(req: Request, id: number): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "ID tidak valid" }, { status: 400 });

  const parsed = sessionLogInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const data = parsed.data;

  const db = getDb();
  const existing = await db.select().from(sessionsLog).where(eq(sessionsLog.id, id));
  if (existing.length === 0) return Response.json({ error: "Log tidak ditemukan" }, { status: 404 });

  const updated = await db
    .update(sessionsLog)
    .set({
      date: data.date,
      pageNumber: data.pageNumber,
      type: data.type,
      quality: data.quality,
      ayahStart: data.ayahStart ?? null,
      ayahEnd: data.ayahEnd ?? null,
      mistakesNote: data.mistakesNote ?? null,
      durationMin: data.durationMin ?? null,
    })
    .where(eq(sessionsLog.id, id))
    .returning();

  await recomputeMemorizationStatus(db);
  return Response.json({ session: updated[0] });
}

export async function deleteSessionLogHandler(req: Request, id: number): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "ID tidak valid" }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(sessionsLog).where(eq(sessionsLog.id, id));
  if (existing.length === 0) return Response.json({ error: "Log tidak ditemukan" }, { status: 404 });

  await db.delete(sessionsLog).where(eq(sessionsLog.id, id));
  await recomputeMemorizationStatus(db);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Implementasi route**

`src/app/api/sessions/[id]/route.ts`:

```ts
import { updateSessionLogHandler, deleteSessionLogHandler } from "./handler";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return updateSessionLogHandler(req, Number(id));
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return deleteSessionLogHandler(req, Number(id));
}
```

- [ ] **Step 5: Jalankan test (lulus)**

Run: `pnpm test tests/sessions-id-api.test.ts`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/sessions/[id]" tests/sessions-id-api.test.ts
git commit -m "feat: API sessions update/delete + recompute"
```

---

### Task 11: API `goals` & `rest-days`

**Files:**
- Create: `src/app/api/goals/handler.ts`, `src/app/api/goals/route.ts`
- Create: `src/app/api/goals/[id]/handler.ts`, `src/app/api/goals/[id]/route.ts`
- Create: `src/app/api/rest-days/handler.ts`, `src/app/api/rest-days/route.ts`
- Test: `tests/goals-api.test.ts`, `tests/rest-days-api.test.ts`

**Interfaces:**
- Consumes: `goalInput`, `restDayInput` (Task 5); `goals`, `restDays` tables.
- Produces:
  - `listGoalsHandler(req)`, `createGoalHandler(req)` (hanya satu goal `khatam` aktif — yang lama dinonaktifkan)
  - `updateGoalHandler(req, id)` (bisa set `active`)
  - `createRestDayHandler(req)`, `deleteRestDayHandler(req)` (hapus berdasarkan body `{ date }`)

- [ ] **Step 1: Tulis failing test goals**

`tests/goals-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users, goals } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-goals-"));
  ctx = createDb(`file:${join(dir, "g.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "g.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

async function create(body: unknown) {
  const { createGoalHandler } = await import("@/app/api/goals/handler");
  return createGoalHandler(new Request("http://localhost/api/goals", {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body),
  }));
}

describe("goals API", () => {
  it("membuat goal khatam", async () => {
    const res = await create({ type: "khatam", targetPages: 604, startDate: "2026-10-10", deadline: "2026-12-31" });
    expect(res.status).toBe(201);
  });
  it("hanya satu goal khatam aktif", async () => {
    await create({ type: "khatam", targetPages: 604, startDate: "2026-10-11", deadline: "2026-12-31" });
    const rows = await ctx.db.select().from(goals);
    const activeKhatam = rows.filter((g) => g.type === "khatam" && g.active);
    expect(activeKhatam).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Tulis failing test rest-days**

`tests/rest-days-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users, restDays } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-rest-"));
  ctx = createDb(`file:${join(dir, "r.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "r.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("rest-days API", () => {
  it("menambah lalu menghapus hari libur", async () => {
    const { createRestDayHandler, deleteRestDayHandler } = await import("@/app/api/rest-days/handler");
    const created = await createRestDayHandler(new Request("http://localhost/api/rest-days", {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ date: "2026-10-10", reason: "sakit" }),
    }));
    expect(created.status).toBe(201);
    expect(await ctx.db.select().from(restDays)).toHaveLength(1);

    const removed = await deleteRestDayHandler(new Request("http://localhost/api/rest-days", {
      method: "DELETE", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ date: "2026-10-10" }),
    }));
    expect(removed.status).toBe(200);
    expect(await ctx.db.select().from(restDays)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Jalankan test (gagal)**

Run: `pnpm test tests/goals-api.test.ts tests/rest-days-api.test.ts`
Expected: FAIL — handler belum ada.

- [ ] **Step 4: Implementasi handler goals**

`src/app/api/goals/handler.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { goals } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { goalInput } from "@/lib/tracker/validation";

export async function listGoalsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  const rows = await getDb().select().from(goals).orderBy(goals.id);
  return Response.json({ goals: rows });
}

export async function createGoalHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = goalInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const data = parsed.data;

  const db = getDb();
  if (data.type === "khatam") {
    await db.update(goals).set({ active: false }).where(and(eq(goals.type, "khatam"), eq(goals.active, true)));
  }

  const inserted = await db
    .insert(goals)
    .values({
      type: data.type,
      targetPages: data.targetPages,
      startDate: data.startDate,
      deadline: data.deadline ?? null,
      active: true,
    })
    .returning();
  return Response.json({ goal: inserted[0] }, { status: 201 });
}
```

`src/app/api/goals/route.ts`:

```ts
import { listGoalsHandler, createGoalHandler } from "./handler";

export const GET = listGoalsHandler;
export const POST = createGoalHandler;
```

`src/app/api/goals/[id]/handler.ts`:

```ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { goals } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";

const patchSchema = z.object({ active: z.boolean() });

export async function updateGoalHandler(req: Request, id: number): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "ID tidak valid" }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(goals).where(eq(goals.id, id));
  if (existing.length === 0) return Response.json({ error: "Goal tidak ditemukan" }, { status: 404 });

  const updated = await db.update(goals).set({ active: parsed.data.active }).where(eq(goals.id, id)).returning();
  return Response.json({ goal: updated[0] });
}
```

`src/app/api/goals/[id]/route.ts`:

```ts
import { updateGoalHandler } from "./handler";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return updateGoalHandler(req, Number(id));
}
```

- [ ] **Step 5: Implementasi handler rest-days**

`src/app/api/rest-days/handler.ts`:

```ts
import { eq } from "drizzle-orm";
import { restDays } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { restDayInput } from "@/lib/tracker/validation";

export async function createRestDayHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = restDayInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(restDays).where(eq(restDays.date, parsed.data.date));
  if (existing.length > 0) return Response.json({ restDay: existing[0] }, { status: 201 });

  const inserted = await db
    .insert(restDays)
    .values({ date: parsed.data.date, reason: parsed.data.reason ?? null })
    .returning();
  return Response.json({ restDay: inserted[0] }, { status: 201 });
}

export async function deleteRestDayHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = restDayInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  await getDb().delete(restDays).where(eq(restDays.date, parsed.data.date));
  return Response.json({ ok: true });
}
```

`src/app/api/rest-days/route.ts`:

```ts
import { createRestDayHandler, deleteRestDayHandler } from "./handler";

export const POST = createRestDayHandler;
export const DELETE = deleteRestDayHandler;
```

- [ ] **Step 6: Jalankan test (lulus)**

Run: `pnpm test tests/goals-api.test.ts tests/rest-days-api.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/goals src/app/api/rest-days tests/goals-api.test.ts tests/rest-days-api.test.ts
git commit -m "feat: API goals & rest-days"
```

---

### Task 12: API `progress` (agregat + proyeksi)

**Files:**
- Create: `src/app/api/progress/route.ts`
- Test: `tests/progress-api.test.ts`

**Interfaces:**
- Consumes: `computeProgress` (Task 7), `computeProjection` (Task 8), `goals`/`restDays` tables, `todayISO`.
- Produces: `GET /api/progress` → 200 `{ progress, projection }`; 401 tanpa sesi. `projection` bernilai `null` bila tidak ada goal `khatam` aktif.

- [ ] **Step 1: Tulis failing test**

`tests/progress-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users, pages, goals, memorizationStatus } from "@/db/schema";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

let dir: string;
let ctx: ReturnType<typeof createDb>;
let cookie: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-progressapi-"));
  ctx = createDb(`file:${join(dir, "p.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  await ctx.db.insert(pages).values([
    { pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 },
    { pageNumber: 2, juz: 1, surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 },
  ]);
  await ctx.db.insert(memorizationStatus).values({ pageNumber: 1, status: "lancar" });
  await ctx.db.insert(goals).values({ type: "khatam", targetPages: 604, startDate: "2026-01-01", deadline: "2026-12-31", active: true });
  const { token } = await createSession(ctx.db, inserted[0].id);
  cookie = `${SESSION_COOKIE}=${token}`;
  process.env.DATABASE_URL = `file:${join(dir, "p.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("progress API", () => {
  it("401 tanpa sesi", async () => {
    const { GET } = await import("@/app/api/progress/route");
    const res = await GET(new Request("http://localhost/api/progress"));
    expect(res.status).toBe(401);
  });
  it("200 dengan progress & projection", async () => {
    const { GET } = await import("@/app/api/progress/route");
    const res = await GET(new Request("http://localhost/api/progress", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress.memorizedPages).toBe(1);
    expect(body.projection).not.toBeNull();
    expect(body.projection.remainingPages).toBe(603);
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

Run: `pnpm test tests/progress-api.test.ts`
Expected: FAIL — route belum ada.

- [ ] **Step 3: Implementasi**

`src/app/api/progress/route.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { goals, restDays } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { computeProgress } from "@/lib/tracker/progress";
import { computeProjection } from "@/lib/tracker/projection";
import { todayISO } from "@/lib/tracker/date";

export async function GET(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const db = getDb();
  const progress = await computeProgress(db);

  const khatam = await db
    .select()
    .from(goals)
    .where(and(eq(goals.type, "khatam"), eq(goals.active, true)));
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

  return Response.json({ progress, projection });
}
```

- [ ] **Step 4: Jalankan test (lulus)**

Run: `pnpm test tests/progress-api.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/progress/route.ts tests/progress-api.test.ts
git commit -m "feat: API progress (agregat + proyeksi)"
```

---

### Task 13: Layout terproteksi + navigasi + Dashboard

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/page.tsx`
- Create: `src/components/Nav.tsx`
- Delete: `src/app/page.tsx`

**Interfaces:**
- Consumes: `computeProgress`, `computeProjection`, `getDb`, `verifySession`, `SURAHS`.
- Produces: halaman `/` (dashboard) di dalam layout terproteksi dengan nav.

- [ ] **Step 1: Buat Nav**

`src/components/Nav.tsx`:

```tsx
import Link from "next/link";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/catat", label: "Catat" },
  { href: "/riwayat", label: "Riwayat" },
  { href: "/peta", label: "Peta" },
  { href: "/target", label: "Target" },
];

export default function Nav() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm font-medium text-neutral-700 hover:text-emerald-700">
            {l.label}
          </Link>
        ))}
        <form action="/api/auth/logout" method="post" className="ml-auto">
          <button className="rounded border border-neutral-300 px-3 py-1 text-sm">Keluar</button>
        </form>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Buat layout terproteksi**

`src/app/(app)/layout.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/auth/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? "";
  const session = await verifySession(getDb(), token);
  if (!session) redirect("/login");

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </>
  );
}
```

- [ ] **Step 3: Buat dashboard**

`src/app/(app)/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Hapus halaman lama**

Run: `Remove-Item -LiteralPath "src/app/page.tsx"`
Expected: file terhapus (dashboard lama digantikan `(app)/page.tsx`).

- [ ] **Step 5: Verifikasi build**

Run: `pnpm build`
Expected: build sukses; route `/`, `/catat`, `/riwayat`, `/peta`, `/target` terdaftar (beberapa masih 404 sampai task berikut).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)" src/components/Nav.tsx
git rm src/app/page.tsx
git commit -m "feat: layout terproteksi, navigasi, dashboard"
```

---

### Task 14: Halaman Catat (form cepat)

**Files:**
- Create: `src/components/SessionForm.tsx`
- Create: `src/app/(app)/catat/page.tsx`

**Interfaces:**
- Consumes: `POST /api/sessions`, `SURAHS`.
- Produces: halaman `/catat` dengan form cepat (default tanggal hari ini, tipe `sabaq`, kualitas `lancar`).

- [ ] **Step 1: Buat komponen form**

`src/components/SessionForm.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = [
  { value: "sabaq", label: "Sabaq (baru)" },
  { value: "sabqi", label: "Sabqi (ulangan baru)" },
  { value: "manzil", label: "Manzil (murajaah lama)" },
];
const QUALITIES = [
  { value: "baru", label: "Baru" },
  { value: "lancar", label: "Lancar" },
  { value: "mutqin", label: "Mutqin" },
  { value: "lemah", label: "Lemah" },
];

export default function SessionForm({ today, surahs }: { today: string; surahs: { number: number; latin: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const body: Record<string, unknown> = {
      date: data.get("date"),
      pageNumber: Number(data.get("pageNumber")),
      type: data.get("type"),
      quality: data.get("quality"),
    };
    const ayahStart = data.get("ayahStart");
    const ayahEnd = data.get("ayahEnd");
    if (ayahStart) body.ayahStart = Number(ayahStart);
    if (ayahEnd) body.ayahEnd = Number(ayahEnd);
    const note = data.get("mistakesNote");
    if (note) body.mistakesNote = note;

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Gagal menyimpan" }));
      setError(err.error ?? "Gagal menyimpan");
      return;
    }
    setMessage("Tersimpan. Siap input berikutnya.");
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Tanggal
          <input name="date" type="date" defaultValue={today} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Halaman (1-604)
          <input name="pageNumber" type="number" min={1} max={604} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Jenis
          <select name="type" defaultValue="sabaq" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Kualitas
          <select name="quality" defaultValue="lancar" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
            {QUALITIES.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Ayat awal (opsional)
          <input name="ayahStart" type="number" min={1} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Ayat akhir (opsional)
          <input name="ayahEnd" type="number" min={1} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">
        Catatan kesalahan (opsional)
        <textarea name="mistakesNote" rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      <button disabled={loading} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
        {loading ? "Menyimpan..." : "Simpan setoran"}
      </button>
      <p className="text-xs text-neutral-500">
        Contoh surah: {surahs.slice(0, 3).map((s) => `${s.number}. ${s.latin}`).join(", ")} ...
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Buat halaman catat**

`src/app/(app)/catat/page.tsx`:

```tsx
import SessionForm from "@/components/SessionForm";
import { SURAHS } from "@/lib/mushaf/surahs";
import { todayISO } from "@/lib/tracker/date";

export default function CatatPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Catat setoran</h1>
      <SessionForm today={todayISO()} surahs={SURAHS.map((s) => ({ number: s.number, latin: s.latin }))} />
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi build**

Run: `pnpm build`
Expected: build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionForm.tsx "src/app/(app)/catat"
git commit -m "feat: halaman catat (form setoran cepat)"
```

---

### Task 15: Halaman Riwayat (edit/hapus)

**Files:**
- Create: `src/components/SessionList.tsx`
- Create: `src/app/(app)/riwayat/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions`, `PATCH /api/sessions/[id]`, `DELETE /api/sessions/[id]`.
- Produces: halaman `/riwayat` dengan daftar log, edit kualitas/jenis, dan hapus.

- [ ] **Step 1: Buat komponen daftar**

`src/components/SessionList.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SessionRow {
  id: number;
  date: string;
  pageNumber: number;
  type: string;
  quality: string;
  ayahStart: number | null;
  ayahEnd: number | null;
  mistakesNote: string | null;
}

const TYPES = ["sabaq", "sabqi", "manzil"];
const QUALITIES = ["baru", "lancar", "mutqin", "lemah"];

export default function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function update(row: SessionRow, patch: Partial<SessionRow>) {
    setError("");
    const res = await fetch(`/api/sessions/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: row.date,
        pageNumber: row.pageNumber,
        type: patch.type ?? row.type,
        quality: patch.quality ?? row.quality,
        ayahStart: row.ayahStart ?? undefined,
        ayahEnd: row.ayahEnd ?? undefined,
        mistakesNote: row.mistakesNote ?? undefined,
      }),
    });
    if (!res.ok) setError("Gagal menyimpan perubahan");
    else router.refresh();
  }

  async function remove(id: number) {
    setError("");
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) setError("Gagal menghapus");
    else router.refresh();
  }

  if (sessions.length === 0) return <p className="text-sm text-neutral-600">Belum ada riwayat.</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-neutral-200 rounded-xl bg-white shadow">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="w-24 text-neutral-600">{s.date}</span>
            <span className="w-16">Hal. {s.pageNumber}</span>
            <select defaultValue={s.type} onChange={(e) => update(s, { type: e.target.value })} className="rounded border border-neutral-300 px-2 py-1">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select defaultValue={s.quality} onChange={(e) => update(s, { quality: e.target.value })} className="rounded border border-neutral-300 px-2 py-1">
              {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
            {s.ayahStart && s.ayahEnd && <span className="text-neutral-500">ayat {s.ayahStart}-{s.ayahEnd}</span>}
            <button onClick={() => remove(s.id)} className="ml-auto rounded border border-red-300 px-2 py-1 text-red-600">Hapus</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Buat halaman riwayat**

`src/app/(app)/riwayat/page.tsx`:

```tsx
import { desc } from "drizzle-orm";
import { sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import SessionList from "@/components/SessionList";

export default async function RiwayatPage() {
  const rows = await getDb().select().from(sessionsLog).orderBy(desc(sessionsLog.date), desc(sessionsLog.id));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Riwayat</h1>
      <SessionList sessions={rows} />
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi build**

Run: `pnpm build`
Expected: build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionList.tsx "src/app/(app)/riwayat"
git commit -m "feat: halaman riwayat dengan edit/hapus"
```

---

### Task 16: Halaman Peta (grid 604 halaman per juz)

**Files:**
- Create: `src/components/ProgressMap.tsx`
- Create: `src/app/(app)/peta/page.tsx`

**Interfaces:**
- Consumes: `pages`, `memorizationStatus`, `QUALITY_COLORS`, `surahName`.
- Produces: halaman `/peta` dengan grid berwarna per level + legenda.

- [ ] **Step 1: Buat komponen peta**

`src/components/ProgressMap.tsx`:

```tsx
import { QUALITY_COLORS, MEMO_STATUSES } from "@/lib/tracker/quality";

export interface MapPage {
  pageNumber: number;
  juz: number;
  surahStart: number;
  status: string;
}

export default function ProgressMap({ pages }: { pages: MapPage[] }) {
  const juzNumbers = [...new Set(pages.map((p) => p.juz))].sort((a, b) => a - b);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-xs">
        {MEMO_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded ${QUALITY_COLORS[s]}`} /> {s}
          </span>
        ))}
      </div>
      {juzNumbers.map((juz) => (
        <section key={juz}>
          <h2 className="mb-2 text-sm font-medium text-neutral-600">Juz {juz}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(28px,1fr))] gap-1">
            {pages.filter((p) => p.juz === juz).map((p) => (
              <div
                key={p.pageNumber}
                title={`Hal. ${p.pageNumber} — ${p.status}`}
                className={`flex h-7 items-center justify-center rounded text-[10px] text-neutral-800 ${QUALITY_COLORS[p.status] ?? QUALITY_COLORS.belum}`}
              >
                {p.pageNumber}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Buat halaman peta**

`src/app/(app)/peta/page.tsx`:

```tsx
import { pages, memorizationStatus } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import ProgressMap from "@/components/ProgressMap";

export default async function PetaPage() {
  const db = getDb();
  const allPages = await db.select().from(pages).orderBy(pages.pageNumber);
  const statuses = await db.select().from(memorizationStatus);
  const statusByPage = new Map(statuses.map((s) => [s.pageNumber, s.status]));

  const data = allPages.map((p) => ({
    pageNumber: p.pageNumber,
    juz: p.juz,
    surahStart: p.surahStart,
    status: statusByPage.get(p.pageNumber) ?? "belum",
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Peta hafalan</h1>
      <ProgressMap pages={data} />
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi build**

Run: `pnpm build`
Expected: build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProgressMap.tsx "src/app/(app)/peta"
git commit -m "feat: halaman peta progres per juz"
```

---

### Task 17: Halaman Target (goal + hari libur)

**Files:**
- Create: `src/components/GoalForm.tsx`
- Create: `src/components/RestDayManager.tsx`
- Create: `src/app/(app)/target/page.tsx`

**Interfaces:**
- Consumes: `POST /api/goals`, `PATCH /api/goals/[id]`, `POST/DELETE /api/rest-days`, `goals`, `restDays`.
- Produces: halaman `/target` untuk mengelola goal khatam/harian dan hari libur.

- [ ] **Step 1: Buat komponen goal**

`src/components/GoalForm.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GoalForm({ today }: { today: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const deadline = data.get("deadline");
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: data.get("type"),
        targetPages: Number(data.get("targetPages")),
        startDate: data.get("startDate"),
        deadline: deadline ? String(deadline) : null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Gagal menyimpan" }));
      setError(err.error ?? "Gagal menyimpan");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 rounded-xl bg-white p-5 shadow sm:grid-cols-2">
      <label className="text-sm">
        Jenis target
        <select name="type" defaultValue="khatam" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
          <option value="khatam">Khatam</option>
          <option value="harian">Harian</option>
        </select>
      </label>
      <label className="text-sm">
        Target halaman
        <input name="targetPages" type="number" min={1} max={604} defaultValue={604} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>
      <label className="text-sm">
        Mulai
        <input name="startDate" type="date" defaultValue={today} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>
      <label className="text-sm">
        Tenggat (opsional)
        <input name="deadline" type="date" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button disabled={loading} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
          {loading ? "Menyimpan..." : "Simpan target"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Buat komponen hari libur**

`src/components/RestDayManager.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RestDayManager({ today, restDays }: { today: string; restDays: { id: number; date: string; reason: string | null }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const res = await fetch("/api/rest-days", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: data.get("date"), reason: data.get("reason") || undefined }),
    });
    if (!res.ok) setError("Gagal menambah hari libur");
    else { form.reset(); router.refresh(); }
  }

  async function remove(date: string) {
    setError("");
    const res = await fetch("/api/rest-days", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) setError("Gagal menghapus");
    else router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl bg-white p-5 shadow">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Tanggal libur
          <input name="date" type="date" defaultValue={today} required className="mt-1 rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Alasan (opsional)
          <input name="reason" className="mt-1 rounded border border-neutral-300 px-3 py-2" />
        </label>
        <button className="rounded bg-emerald-600 px-4 py-2 text-white">Tambah</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-neutral-200 text-sm">
        {restDays.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <span className="w-28">{r.date}</span>
            <span className="text-neutral-500">{r.reason ?? "-"}</span>
            <button onClick={() => remove(r.date)} className="ml-auto rounded border border-red-300 px-2 py-1 text-red-600">Hapus</button>
          </li>
        ))}
        {restDays.length === 0 && <li className="py-2 text-neutral-500">Belum ada hari libur.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Buat halaman target**

`src/app/(app)/target/page.tsx`:

```tsx
import { goals, restDays } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { todayISO } from "@/lib/tracker/date";
import GoalForm from "@/components/GoalForm";
import RestDayManager from "@/components/RestDayManager";

export default async function TargetPage() {
  const db = getDb();
  const goalRows = await db.select().from(goals).orderBy(goals.id);
  const restRows = await db.select().from(restDays).orderBy(restDays.date);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Target & hari libur</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-600">Target aktif</h2>
        <ul className="divide-y divide-neutral-200 rounded-xl bg-white text-sm shadow">
          {goalRows.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="font-medium">{g.type}</span>
              <span>{g.targetPages} halaman</span>
              <span className="text-neutral-500">mulai {g.startDate}</span>
              <span className="text-neutral-500">tenggat {g.deadline ?? "-"}</span>
              <span className={`ml-auto rounded px-2 py-0.5 text-xs ${g.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>
                {g.active ? "aktif" : "nonaktif"}
              </span>
            </li>
          ))}
          {goalRows.length === 0 && <li className="p-3 text-neutral-500">Belum ada target.</li>}
        </ul>
      </section>

      <GoalForm today={todayISO()} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-600">Hari libur</h2>
        <RestDayManager today={todayISO()} restDays={restRows} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Verifikasi build**

Run: `pnpm build`
Expected: build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/components/GoalForm.tsx src/components/RestDayManager.tsx "src/app/(app)/target"
git commit -m "feat: halaman target & hari libur"
```

---

### Task 18: Verifikasi akhir fase

**Files:**
- Modify: `README.md` (tambahkan alur Fase 2 bila perlu)

**Interfaces:**
- Produces: bukti seluruh test, lint, build lulus, dan alur manual berfungsi.

- [ ] **Step 1: Jalankan seluruh test**

Run: `pnpm test`
Expected: semua test PASS.

- [ ] **Step 2: Lint & build**

Run: `pnpm lint`
Expected: tanpa error.

Run: `pnpm build`
Expected: build sukses.

- [ ] **Step 3: Verifikasi manual end-to-end**

Run: `pnpm dev`
Lalu di browser: login → buka `/catat`, simpan setoran sabaq → `/` menampilkan progres & proyeksi → `/peta` mewarnai halaman → `/riwayat` edit/hapus memengaruhi peta → `/target` buat goal khatam + hari libur, proyeksi berubah.

- [ ] **Step 4: Commit (bila ada perubahan dokumen)**

```bash
git add -A
git commit -m "docs: catatan Fase 2 (tracker inti)"
```

---

## Self-Review

**Spec coverage:**
- Perubahan skema (kolom ayat + indeks) → Task 1 ✅
- Data surah + atribusi → Task 2 ✅
- Seed settings default (sabqi/manzil/dll) → Task 3 ✅
- Modul murni `date`/`quality`/`validation`/`derive-status`/`progress`/`projection` → Task 4–8 ✅
- API sessions/goals/rest-days/progress + guard sesi → Task 9–12 ✅
- Halaman Dashboard/Catat/Riwayat/Peta/Target + nav + layout terproteksi → Task 13–17 ✅
- Definisi selesai (test, lint, build, alur manual) → Task 18 ✅

**Placeholder scan:** Tidak ada TBD/TODO; setiap step berisi kode/perintah konkret.

**Type consistency:** `recomputeMemorizationStatus(db)` konsisten (Task 6 → 9, 10). `computeProgress`/`computeProjection` dipakai di Task 7/8 → 12/13. `getSessionUserId` konsisten (Task 9 → 10, 11, 12). `sessionLogInput`/`goalInput`/`restDayInput` konsisten (Task 5 → 9, 10, 11). `SURAHS`/`surahName` konsisten (Task 3 → 14, 16).

**Review Focus terpetakan:** (1) → test Task 6; (2) → test Task 4 & 8; (3) → test Task 11; (4) → test Task 5; (5) → test Task 5 & 9.
