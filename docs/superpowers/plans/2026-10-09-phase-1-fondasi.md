# Fase 1 (Fondasi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi Next.js online dengan login satu akun, skema database lengkap, data 604 halaman mushaf Madinah ter-seed, dan siap deploy ke Vercel + Turso.

**Architecture:** Next.js App Router (TypeScript) + Tailwind; Drizzle ORM di atas `@libsql/client` (file lokal untuk dev, Turso untuk produksi); auth sesi cookie httpOnly dengan hash Argon2; data mushaf dari Tanzil (CC-BY 3.0) di-fetch sekali, di-commit sebagai JSON statis, lalu di-seed ke tabel `pages`.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS v4, Drizzle ORM + drizzle-kit, `@libsql/client`, `@node-rs/argon2`, Zod, Vitest, pnpm.

**Spec:** `rencana_pengembangan.md` (bagian 6, 7, 10, 11, 12, 13, 15).

## Global Constraints

- Bahasa aplikasi: **Indonesia** saja.
- Pengguna: **satu akun**, tanpa registrasi. Akun dibuat via script seed + env.
- Mushaf: **Madinah 15 baris, 604 halaman**. Unit utama = halaman.
- Sumber data: **Tanzil** `quran-data.js` (CC-BY 3.0). Wajib cantumkan atribusi. **Dilarang** menambah/mengubah teks ayat.
- Fase 1 hanya menyimpan **pemetaan halaman** (page→juz/surah/ayah). Teks ayat/terjemahan ditunda.
- Password: **hash Argon2** (`@node-rs/argon2`), tidak pernah disimpan mentah.
- Cookie sesi: `httpOnly`, `Secure`, `SameSite=Lax`, ada masa berlaku.
- Semua route API & halaman kecuali `/login` wajib terautentikasi.
- `noindex` (tidak diindeks mesin pencari).
- Rahasia (URL/token DB, secret sesi) hanya dari env; jangan pernah di-log.
- Versi: Node ≥ 22, pnpm.
- Package manager: **pnpm**.

## Review Focus

1. **Batas halaman pada peralihan surah** — halaman tempat satu surah berakhir dan surah berikutnya mulai; `surah_end/ayah_end` harus ayat terakhir surah lama, bukan ayat 0.
2. **Halaman terakhir (604)** — harus `surah_end=114, ayah_end=6` (An-Nas); tidak boleh out-of-range saat `page+1` tidak ada.
3. **Juz per halaman** — halaman yang jatuh tepat di batas juz harus diberi juz yang benar berdasarkan ayat pertama halaman.
4. **Login salah/kosong** — percobaan password salah harus gagal dengan pesan seragam, tidak membocorkan apakah username ada, dan kena rate limit.
5. **Sesi kedaluwarsa** — cookie dengan sesi kedaluwarsa/dihapus harus ditolak dan diarahkan ke `/login`, bukan error 500.

---

## File Structure

```
quran-tracker/
  .gitignore
  .env.example
  package.json
  tsconfig.json
  next.config.ts
  postcss.config.mjs
  vitest.config.ts
  drizzle.config.ts
  drizzle/                      # file migrasi SQL (generated)
  src/
    app/
      layout.tsx
      globals.css
      page.tsx                  # dashboard placeholder (protected)
      login/page.tsx
      api/auth/login/route.ts
      api/auth/logout/route.ts
    db/
      schema.ts                 # semua tabel (spec 10.1)
      client.ts                 # koneksi drizzle + libsql
    lib/
      auth/password.ts
      auth/session.ts
      auth/rate-limit.ts
      mushaf/parse-tanzil.ts
      env.ts
    middleware.ts
    data/
      pages.json                # hasil fetch, di-commit
      ATTRIBUTION.md
  scripts/
    fetch-mushaf.ts
    seed-db.ts
  tests/                        # unit test (vitest)
```

---

### Task 1: Scaffold proyek & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.eslintrc.json`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `vitest.config.ts`, `.gitignore`
- Note: `.env.example` dibuat di Task 9, bukan di sini.

**Interfaces:**
- Produces: proyek yang bisa `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`.

- [ ] **Step 1: Inisialisasi git & .gitignore**

```powershell
git init
```

`.gitignore`:
```
node_modules/
.next/
out/
*.local.db
*.local.db-*
.env
.env*.local
coverage/
.vercel/
```

- [ ] **Step 2: Tulis `package.json`**

```json
{
  "name": "quran-tracker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "mushaf:fetch": "tsx scripts/fetch-mushaf.ts",
    "db:seed": "tsx scripts/seed-db.ts"
  }
}
```

- [ ] **Step 3: Install dependencies**

```powershell
pnpm add next react react-dom drizzle-orm @libsql/client @node-rs/argon2 zod
pnpm add -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss eslint eslint-config-next drizzle-kit tsx vitest
```

- [ ] **Step 4: Tulis konfigurasi**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { reactStrictMode: true };
export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src") } },
});
```

`.eslintrc.json` (agar `next lint` tidak interaktif):
```json
{
  "extends": "next/core-web-vitals"
}
```

- [ ] **Step 5: Tulis app shell**

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracker Hafalan Al-Qur'an",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (sementara, akan diganti Task 8):
```tsx
export default function Home() {
  return <main className="p-6">Tracker Hafalan Al-Qur&apos;an</main>;
}
```

- [ ] **Step 6: Smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => { it("runs", () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 7: Verifikasi**

```powershell
pnpm test
pnpm lint
pnpm build
```
Expected: test PASS, lint tanpa error, build sukses.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + Drizzle + Vitest"
```

---

### Task 2: Koneksi database & skema lengkap

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/lib/env.ts`, `drizzle.config.ts`, `scripts/migrate.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces:
  - `db` (drizzle instance) dari `@/db/client`
  - tabel: `users`, `sessions`, `pages`, `memorizationStatus`, `sessionsLog`, `goals`, `restDays`, `checkins`, `plans`, `settings`
  - `createDb(url: string, authToken?: string)` untuk test
  - `env` object dari `@/lib/env`

- [ ] **Step 1: Tulis env loader**

`src/lib/env.ts`:
```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  OWNER_USERNAME: z.string().min(1).optional(),
  OWNER_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Env tidak valid: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  return parsed.data;
}
```

- [ ] **Step 2: Tulis skema**

`src/db/schema.ts`:
```ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const pages = sqliteTable("pages", {
  pageNumber: integer("page_number").primaryKey(),
  juz: integer("juz").notNull(),
  surahStart: integer("surah_start").notNull(),
  ayahStart: integer("ayah_start").notNull(),
  surahEnd: integer("surah_end").notNull(),
  ayahEnd: integer("ayah_end").notNull(),
});

export const memorizationStatus = sqliteTable("memorization_status", {
  pageNumber: integer("page_number").primaryKey().references(() => pages.pageNumber),
  status: text("status").notNull().default("belum"),
  memorizedAt: integer("memorized_at", { mode: "timestamp" }),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp" }),
  nextReviewDate: text("next_review_date"),
  intervalDays: integer("interval_days").notNull().default(0),
});

export const sessionsLog = sqliteTable("sessions_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  pageNumber: integer("page_number").notNull(),
  type: text("type").notNull(),
  quality: text("quality").notNull(),
  mistakesNote: text("mistakes_note"),
  durationMin: integer("duration_min"),
});

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  targetPages: integer("target_pages").notNull(),
  deadline: text("deadline"),
  startDate: text("start_date").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const restDays = sqliteTable("rest_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  reason: text("reason"),
});

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  freeMinutes: integer("free_minutes"),
  focusTime: text("focus_time"),
  constraintsNote: text("constraints_note"),
});

export const plans = sqliteTable("plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  goalId: integer("goal_id").references(() => goals.id),
  inputSnapshot: text("input_snapshot").notNull(),
  planJson: text("plan_json").notNull(),
  explanation: text("explanation"),
  status: text("status").notNull().default("draft"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
```

- [ ] **Step 3: Tulis client**

`src/db/client.ts`:
```ts
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function createDb(url: string, authToken?: string): { client: Client; db: LibSQLDatabase<typeof schema> } {
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
  return { client, db };
}
```

- [ ] **Step 4: Tulis drizzle config**

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
```

> Catatan: `drizzle.config.ts` sengaja tidak memakai `loadEnv()` karena `drizzle-kit generate` dijalankan sebelum `.env` ada (Task 2), dan generate tidak butuh kredensial DB nyata. `scripts/migrate.ts` tetap memakai `loadEnv()` karena hanya dijalankan saat `.env` sudah terisi.

`scripts/migrate.ts`:
```ts
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "../src/db/client";
import { loadEnv } from "../src/lib/env";

const { DATABASE_URL, DATABASE_AUTH_TOKEN } = loadEnv();
const { client, db } = createDb(DATABASE_URL, DATABASE_AUTH_TOKEN);
await migrate(db, { migrationsFolder: "./drizzle" });
client.close();
console.log("Migrasi selesai.");
```

- [ ] **Step 5: Tulis failing test**

`tests/db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { pages, users } from "@/db/schema";

let dir: string;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-"));
  ctx = createDb(`file:${join(dir, "test.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("schema", () => {
  it("insert & select page", async () => {
    await ctx.db.insert(pages).values({ pageNumber: 1, juz: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 });
    const rows = await ctx.db.select().from(pages).where(eq(pages.pageNumber, 1));
    expect(rows[0]?.surahEnd).toBe(1);
  });
  it("username unik", async () => {
    await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" });
    await expect(ctx.db.insert(users).values({ username: "owner", passwordHash: "y" })).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Generate migrasi & jalankan test**

```powershell
pnpm db:generate
pnpm test tests/db.test.ts
```
Expected: file `drizzle/0000_*.sql` dibuat; test PASS.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat: skema database lengkap + koneksi drizzle/libsql"
```

---

### Task 3: Parser metadata mushaf (murni)

**Files:**
- Create: `src/lib/mushaf/parse-tanzil.ts`
- Test: `tests/parse-tanzil.test.ts`

**Interfaces:**
- Produces: `parseTanzilMetadata(source: string): PageRow[]`, `PageRow` interface `{ pageNumber; juz; surahStart; ayahStart; surahEnd; ayahEnd }` (semua number). Mengembalikan tepat 604 baris terurut.

- [ ] **Step 1: Tulis failing test**

`tests/parse-tanzil.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseTanzilMetadata } from "@/lib/mushaf/parse-tanzil";

const FIXTURE = `
QuranData.Sura = [
	// [start, ayas, order, rukus, name, tname, ename, type]
	[],
	[0, 7, 5, 1, 'X', "Al-Faatiha", 'The Opening', 'Meccan'],
	[7, 5, 87, 40, 'X', "Al-Baqara", 'The Cow', 'Medinan'],
	[293, 5, 89, 20, 'X', "Aal-i-Imraan", 'Family', 'Medinan']
];
QuranData.Juz = [
	// [sura, aya]
	[],
	[1, 1], 	[2, 3]
];
QuranData.Page = [
	// [sura, aya]
	[],
	[1, 1], 	[1, 6], 	[2, 1], 	[2, 5], 	[3, 1]
];
`;

describe("parseTanzilMetadata", () => {
  const rows = parseTanzilMetadata(FIXTURE);
  it("menghasilkan satu baris per halaman (n-1 batas)", () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.pageNumber)).toEqual([1, 2, 3, 4]);
  });
  it("halaman 1 mulai Al-Fatihah 1 dan berakhir sebelum batas berikut", () => {
    expect(rows[0]).toMatchObject({ pageNumber: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 5 });
  });
  it("halaman pada batas surah berakhir di ayat terakhir surah lama", () => {
    expect(rows[1]).toMatchObject({ pageNumber: 2, surahStart: 1, ayahStart: 6, surahEnd: 1, ayahEnd: 7 });
    expect(rows[2]).toMatchObject({ pageNumber: 3, surahStart: 2, ayahStart: 1 });
  });
  it("halaman terakhir berakhir di ayat terakhir mushaf", () => {
    expect(rows[3]).toMatchObject({ pageNumber: 4, surahEnd: 2, ayahEnd: 5 });
  });
  it("juz dihitung dari ayat pertama halaman", () => {
    expect(rows[0].juz).toBe(1);
    expect(rows[3].juz).toBe(2);
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

```powershell
pnpm test tests/parse-tanzil.test.ts
```
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/mushaf/parse-tanzil.ts`:
```ts
export interface PageRow {
  pageNumber: number;
  juz: number;
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

function extractPairs(source: string, name: string, minParts = 2): number[][] {
  const re = new RegExp(`QuranData\\.${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const m = source.match(re);
  if (!m) throw new Error(`QuranData.${name} tidak ditemukan`);
  const entries = m[1].match(/\[[^\]]*\]/g) ?? [];
  return entries
    .map((e) => e.slice(1, -1).split(",").map((t) => t.trim()))
    .filter((parts) => parts.length >= minParts && parts[0] !== "")
    .map((parts) => [Number(parts[0]), Number(parts[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export function parseTanzilMetadata(source: string): PageRow[] {
  const sura = extractPairs(source, "Sura", 8);
  const juz = extractPairs(source, "Juz");
  const page = extractPairs(source, "Page");

  if (sura.length === 0) throw new Error("Data surah kosong");
  if (page.length < 2) throw new Error("Data halaman kosong");

  const surahCount = sura.length;
  const surahOffset: number[] = [0];
  for (let s = 1; s <= surahCount; s++) {
    surahOffset[s] = surahOffset[s - 1] + sura[s - 1][1];
  }
  const globalOf = (s: number, a: number) => surahOffset[s - 1] + a;
  const verseOf = (g: number): [number, number] => {
    for (let s = 1; s <= surahCount; s++) {
      if (g > surahOffset[s - 1] && g <= surahOffset[s]) return [s, g - surahOffset[s - 1]];
    }
    throw new Error(`Indeks ayat global di luar jangkauan: ${g}`);
  };
  const juzStartGlobal = juz.map(([s, a]) => globalOf(s, a));

  const pageStarts = page.map(([s, a]) => globalOf(s, a));
  const rows: PageRow[] = [];
  for (let i = 0; i < pageStarts.length - 1; i++) {
    const startGlobal = pageStarts[i];
    const endGlobal = pageStarts[i + 1] - 1;
    const [surahStart, ayahStart] = verseOf(startGlobal);
    const [surahEnd, ayahEnd] = verseOf(endGlobal);
    let juzNumber = 1;
    for (let j = 0; j < juzStartGlobal.length; j++) {
      if (juzStartGlobal[j] <= startGlobal) juzNumber = j + 1;
    }
    rows.push({ pageNumber: i + 1, juz: juzNumber, surahStart, ayahStart, surahEnd, ayahEnd });
  }
  return rows;
}
```

> Catatan penting (bug plan yang diperbaiki): file Tanzil asli punya `QuranData.Sura` dengan **115** entri (114 surah + penanda total `[6236,1]`) dan `QuranData.Page` dengan **605** entri (604 batas halaman + sentinel akhir `[115,1]`). Karena itu Sura difilter berdasarkan bentuk 8-field dan loop halaman memakai `page.length - 1`. Fixture memakai Al-Baqarah 5 ayat agar konsisten dengan asersi `2:5`.

- [ ] **Step 4: Jalankan test (lulus)**

```powershell
pnpm test tests/parse-tanzil.test.ts
```
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: parser metadata mushaf Tanzil (604 halaman)"
```

---

### Task 4: Fetch & commit data mushaf statis

**Files:**
- Create: `scripts/fetch-mushaf.ts`, `src/data/ATTRIBUTION.md`
- Generate & commit: `src/data/pages.json`

**Interfaces:**
- Consumes: `parseTanzilMetadata` dari Task 3.
- Produces: `src/data/pages.json` — array 604 `PageRow`.

- [ ] **Step 1: Tulis script fetch**

`scripts/fetch-mushaf.ts`:
```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { parseTanzilMetadata } from "../src/lib/mushaf/parse-tanzil";

const SOURCE_URL = "https://tanzil.net/res/text/metadata/quran-data.js";

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Gagal fetch: HTTP ${res.status}`);
  const source = await res.text();
  const rows = parseTanzilMetadata(source);

  if (rows.length !== 604) throw new Error(`Harus 604 halaman, dapat ${rows.length}`);
  if (rows[0].surahStart !== 1 || rows[0].ayahStart !== 1) throw new Error("Halaman 1 tidak valid");
  const last = rows[603];
  if (last.surahEnd !== 114 || last.ayahEnd !== 6) throw new Error("Halaman 604 tidak valid");

  mkdirSync("src/data", { recursive: true });
  writeFileSync("src/data/pages.json", JSON.stringify(rows, null, 2) + "\n");
  console.log(`Menulis 604 halaman ke src/data/pages.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

`src/data/ATTRIBUTION.md`:
```md
# Atribusi Data Mushaf

Pemetaan halaman (Madinah, 604 halaman), juz, dan surah diambil dari:

- **Tanzil Quran Metadata** — https://tanzil.net — Copyright (C) 2008-2009 Tanzil.info
- Lisensi: **Creative Commons Attribution 3.0** (CC-BY 3.0)
- File sumber: https://tanzil.net/res/text/metadata/quran-data.js

Teks ayat tidak disimpan pada fase ini. Data dipakai apa adanya tanpa modifikasi.
```

- [ ] **Step 2: Jalankan fetch**

```powershell
pnpm mushaf:fetch
```
Expected: log "Menulis 604 halaman..." dan `src/data/pages.json` muncul.

- [ ] **Step 3: Verifikasi isi JSON**

```powershell
node -e "const p=require('./src/data/pages.json'); console.log(p.length, JSON.stringify(p[0]), JSON.stringify(p[603]));"
```
Expected: `604` lalu halaman 1 `{pageNumber:1,juz:1,surahStart:1,ayahStart:1,surahEnd:1,ayahEnd:7}` dan halaman 604 `{...surahEnd:114,ayahEnd:6}`.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "data: commit pemetaan 604 halaman mushaf Madinah (Tanzil CC-BY)"
```

---

### Task 5: Seed script (pages + akun pemilik)

**Files:**
- Create: `scripts/seed-db.ts`
- Test: `tests/seed.test.ts`

**Interfaces:**
- Consumes: `createDb`, tabel `pages` & `users`, `hashPassword` (didefinisikan Task 6 — lihat catatan), `pages.json`.
- Produces: `seed(db, { ownerUsername?, ownerPassword? })` yang idempotent; setelah dijalankan: 604 baris `pages`, 0/1 baris `users`.

> Catatan urutan: `hashPassword` adalah fungsi murni kecil. Untuk menghindari dependensi Task 6, definisikan `src/lib/auth/password.ts` di **Step 1 Task ini** dan test-nya di Task 6 hanya menambah kasus verifikasi.

- [ ] **Step 1: Tulis modul password**

`src/lib/auth/password.ts`:
```ts
import { hash, verify } from "@node-rs/argon2";

export function hashPassword(password: string): Promise<string> {
  return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  return verify(hashStr, password);
}
```

- [ ] **Step 2: Tulis failing test**

`tests/seed.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { pages, users } from "@/db/schema";
import { seed } from "../scripts/seed-db";

let dir: string;
let ctx: ReturnType<typeof createDb>;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-seed-"));
  ctx = createDb(`file:${join(dir, "seed.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("seed", () => {
  it("mengisi 604 halaman dan 1 user", async () => {
    await seed(ctx.db, { ownerUsername: "owner", ownerPassword: "rahasia123" });
    expect((await ctx.db.select().from(pages)).length).toBe(604);
    expect((await ctx.db.select().from(users)).length).toBe(1);
  });
  it("idempotent saat dijalankan ulang", async () => {
    await seed(ctx.db, { ownerUsername: "owner", ownerPassword: "rahasia123" });
    expect((await ctx.db.select().from(pages)).length).toBe(604);
    expect((await ctx.db.select().from(users)).length).toBe(1);
  });
  it("tanpa kredensial owner, hanya seed halaman", async () => {
    const d2 = mkdtempSync(join(tmpdir(), "qt-seed2-"));
    const c2 = createDb(`file:${join(d2, "s.db")}`);
    await migrate(c2.db, { migrationsFolder: "./drizzle" });
    await seed(c2.db, {});
    expect((await c2.db.select().from(users)).length).toBe(0);
    c2.client.close();
    rmSync(d2, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Jalankan test (gagal)**

```powershell
pnpm test tests/seed.test.ts
```
Expected: FAIL — `seed` belum ada.

- [ ] **Step 4: Implementasi seed**

`scripts/seed-db.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createDb } from "../src/db/client";
import { pages, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { loadEnv } from "../src/lib/env";
import type * as schema from "../src/db/schema";
import type { PageRow } from "../src/lib/mushaf/parse-tanzil";

export interface SeedOptions { ownerUsername?: string; ownerPassword?: string; pagesPath?: string }

export async function seed(db: LibSQLDatabase<typeof schema>, opts: SeedOptions = {}): Promise<void> {
  const path = opts.pagesPath ?? "src/data/pages.json";
  const rows = JSON.parse(readFileSync(path, "utf8")) as PageRow[];
  if (rows.length !== 604) throw new Error(`pages.json harus 604 baris, dapat ${rows.length}`);

  for (const r of rows) {
    await db.insert(pages).values(r).onConflictDoUpdate({
      target: pages.pageNumber,
      set: { juz: r.juz, surahStart: r.surahStart, ayahStart: r.ayahStart, surahEnd: r.surahEnd, ayahEnd: r.ayahEnd },
    });
  }

  if (opts.ownerUsername && opts.ownerPassword) {
    const existing = await db.select().from(users).where(eq(users.username, opts.ownerUsername));
    if (existing.length === 0) {
      await db.insert(users).values({
        username: opts.ownerUsername,
        passwordHash: await hashPassword(opts.ownerPassword),
      });
    }
  }
}

async function main() {
  const env = loadEnv();
  const { client, db } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seed(db, { ownerUsername: env.OWNER_USERNAME, ownerPassword: env.OWNER_PASSWORD });
  client.close();
  console.log("Seed selesai.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 5: Jalankan test (lulus)**

```powershell
pnpm test tests/seed.test.ts
```
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: seed 604 halaman + akun pemilik (idempotent)"
```

---

### Task 6: Auth inti (password & sesi)

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `tests/session.test.ts`, `tests/password.test.ts`

**Interfaces:**
- Consumes: `createDb`, tabel `sessions` & `users`.
- Produces (dari `src/lib/auth/session.ts`):
  - `SESSION_COOKIE = "session"`
  - `SESSION_TTL_DAYS = 30`
  - `hashToken(token: string): string`
  - `createSession(db, userId: number): Promise<{ token: string; expiresAt: Date }>`
  - `verifySession(db, token: string): Promise<{ userId: number } | null>`
  - `deleteSession(db, token: string): Promise<void>`

- [ ] **Step 1: Tulis failing test**

`tests/session.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, verifySession, deleteSession, hashToken } from "@/lib/auth/session";

let dir: string;
let ctx: ReturnType<typeof createDb>;
let userId: number;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-sess-"));
  ctx = createDb(`file:${join(dir, "s.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  const inserted = await ctx.db.insert(users).values({ username: "owner", passwordHash: "x" }).returning();
  userId = inserted[0].id;
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("session", () => {
  it("membuat sesi dengan token acak & hash tersimpan", async () => {
    const { token } = await createSession(ctx.db, userId);
    expect(token.length).toBeGreaterThan(20);
    const found = await verifySession(ctx.db, token);
    expect(found?.userId).toBe(userId);
    expect(hashToken(token)).not.toBe(token);
  });
  it("menolak token tidak dikenal", async () => {
    expect(await verifySession(ctx.db, "tidak-ada")).toBeNull();
  });
  it("menolak sesi kedaluwarsa", async () => {
    const { token } = await createSession(ctx.db, userId);
    const { sessions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await ctx.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.tokenHash, hashToken(token)));
    expect(await verifySession(ctx.db, token)).toBeNull();
  });
  it("deleteSession menghapus", async () => {
    const { token } = await createSession(ctx.db, userId);
    await deleteSession(ctx.db, token);
    expect(await verifySession(ctx.db, token)).toBeNull();
  });
});
```

`tests/password.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  it("hash tidak sama dengan aslinya", async () => {
    const h = await hashPassword("rahasia123");
    expect(h).not.toContain("rahasia123");
  });
  it("verifikasi benar/salah", async () => {
    const h = await hashPassword("rahasia123");
    expect(await verifyPassword(h, "rahasia123")).toBe(true);
    expect(await verifyPassword(h, "salah")).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test (gagal)**

```powershell
pnpm test tests/session.test.ts tests/password.test.ts
```
Expected: FAIL — modul `session.ts` belum ada (password sudah ada dari Task 5).

- [ ] **Step 3: Implementasi session**

`src/lib/auth/session.ts`:
```ts
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessions } from "@/db/schema";
import type * as schema from "@/db/schema";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: LibSQLDatabase<typeof schema>, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: randomUUID(), userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export async function verifySession(db: LibSQLDatabase<typeof schema>, token: string) {
  if (!token) return null;
  const rows = await db.select().from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return rows[0] ? { userId: rows[0].userId } : null;
}

export async function deleteSession(db: LibSQLDatabase<typeof schema>, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
```

- [ ] **Step 4: Jalankan test (lulus)**

```powershell
pnpm test tests/session.test.ts tests/password.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: auth inti (hash password argon2, sesi berbasis token)"
```

---

### Task 7: Route login/logout + rate limiting

**Files:**
- Create: `src/lib/auth/rate-limit.ts`, `src/lib/auth/db.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`
- Test: `tests/login-route.test.ts`, `tests/rate-limit.test.ts`

**Interfaces:**
- Consumes: `createSession`, `deleteSession`, `verifyPassword`, `users`, `db` singleton.
- Produces:
  - `src/lib/auth/db.ts`: `getDb()` (singleton dari env)
  - `loginHandler(req: Request): Promise<Response>` — 200 + Set-Cookie saat sukses, 401 saat gagal, 429 saat rate limit
  - `logoutHandler(req: Request): Promise<Response>`
  - `checkRateLimit(key: string): { allowed: boolean }`, `recordFailure(key: string)`, `resetRateLimit(key: string)`

- [ ] **Step 1: Tulis failing test rate limit**

`tests/rate-limit.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/auth/rate-limit";

describe("rate limit", () => {
  beforeEach(() => resetRateLimit("1.2.3.4"));
  it("mengizinkan di bawah batas", () => {
    for (let i = 0; i < 5; i++) { expect(checkRateLimit("1.2.3.4").allowed).toBe(true); recordFailure("1.2.3.4"); }
  });
  it("memblokir setelah batas", () => {
    for (let i = 0; i < 5; i++) recordFailure("1.2.3.4");
    expect(checkRateLimit("1.2.3.4").allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan (gagal)**

```powershell
pnpm test tests/rate-limit.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementasi rate limit**

`src/lib/auth/rate-limit.ts`:
```ts
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): { allowed: boolean } {
  const entry = attempts.get(key);
  if (!entry) return { allowed: true };
  if (Date.now() > entry.resetAt) { attempts.delete(key); return { allowed: true }; }
  return { allowed: entry.count < MAX_ATTEMPTS };
}

export function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function resetRateLimit(key: string): void { attempts.delete(key); }
```

> Catatan: penyimpanan in-memory cocok untuk satu pengguna/satu instance. Untuk Vercel multi-instance, ganti dengan penyimpanan bersama (mis. tabel DB atau Upstash) di fase berikutnya.

- [ ] **Step 4: Implementasi singleton db & handler**

`src/lib/auth/db.ts`:
```ts
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createDb } from "@/db/client";
import { loadEnv } from "@/lib/env";
import type * as schema from "@/db/schema";

let cached: LibSQLDatabase<typeof schema> | null = null;

export function getDb(): LibSQLDatabase<typeof schema> {
  if (!cached) {
    const env = loadEnv();
    cached = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN).db;
  }
  return cached;
}
```

`src/app/api/auth/login/route.ts`:
```ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/auth/rate-limit";

const bodySchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function loginHandler(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!checkRateLimit(ip).allowed) {
    return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const db = getDb();
  const found = await db.select().from(users).where(eq(users.username, parsed.data.username));
  const user = found[0];
  const ok = user ? await verifyPassword(user.passwordHash, parsed.data.password) : false;
  if (!user || !ok) {
    recordFailure(ip);
    return Response.json({ error: "Username atau password salah" }, { status: 401 });
  }
  resetRateLimit(ip);
  const { token, expiresAt } = await createSession(db, user.id);
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/", "HttpOnly", "Secure", "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Set-Cookie": cookie, "Content-Type": "application/json" } });
}

export const POST = loginHandler;
```

`src/app/api/auth/logout/route.ts`:
```ts
import { cookies } from "next/headers";
import { getDb } from "@/lib/auth/db";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(): Promise<Response> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token);
  const cookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Set-Cookie": cookie, "Content-Type": "application/json" } });
}
```

- [ ] **Step 5: Tulis test login route**

`tests/login-route.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

let dir: string; let ctx: ReturnType<typeof createDb>;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qt-login-"));
  ctx = createDb(`file:${join(dir, "l.db")}`);
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  await ctx.db.insert(users).values({ username: "owner", passwordHash: await hashPassword("rahasia123") });
  process.env.DATABASE_URL = `file:${join(dir, "l.db")}`;
  process.env.SESSION_SECRET = "x".repeat(32);
});
afterAll(() => { ctx.client.close(); rmSync(dir, { recursive: true, force: true }); });

async function callLogin(body: unknown) {
  const { loginHandler } = await import("@/app/api/auth/login/route");
  return loginHandler(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(body),
  }));
}

describe("login handler", () => {
  it("berhasil dengan kredensial benar (200 + cookie)", async () => {
    const res = await callLogin({ username: "owner", password: "rahasia123" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("session=");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("gagal dengan password salah (401, tanpa cookie)", async () => {
    const res = await callLogin({ username: "owner", password: "salah" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("body tidak valid (400)", async () => {
    const res = await callLogin({ username: "" });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Jalankan test (lulus)**

```powershell
pnpm test tests/rate-limit.test.ts tests/login-route.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat: route login/logout dengan rate limiting"
```

---

### Task 8: Halaman login, dashboard terproteksi, middleware

**Files:**
- Create: `src/middleware.ts`, `src/app/login/page.tsx`, `src/components/LoginForm.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/middleware.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE`, `verifySession`, `getDb`.
- Produces: `src/middleware.ts` default export `middleware(req: NextRequest)`; redirect ke `/login` bila cookie sesi tidak ada untuk route selain `/login`, `/_next`, `/api/auth`.

- [ ] **Step 1: Tulis failing test middleware**

`tests/middleware.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shouldRedirectToLogin } from "@/middleware";

describe("middleware helper", () => {
  it("redirect untuk halaman tanpa cookie", () => {
    expect(shouldRedirectToLogin("/", false)).toBe(true);
  });
  it("tidak redirect untuk /login", () => {
    expect(shouldRedirectToLogin("/login", false)).toBe(false);
  });
  it("tidak redirect bila ada cookie", () => {
    expect(shouldRedirectToLogin("/", true)).toBe(false);
  });
  it("tidak redirect untuk aset & api auth", () => {
    expect(shouldRedirectToLogin("/_next/static/x.js", false)).toBe(false);
    expect(shouldRedirectToLogin("/api/auth/login", false)).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan (gagal)**

```powershell
pnpm test tests/middleware.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementasi middleware**

`src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "session";
const PUBLIC_PREFIXES = ["/login", "/_next", "/api/auth", "/favicon.ico"];

export function shouldRedirectToLogin(pathname: string, hasSession: boolean): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
  return !hasSession;
}

export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (shouldRedirectToLogin(req.nextUrl.pathname, hasSession)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

> Catatan: middleware hanya memeriksa keberadaan cookie (ringan, aman di edge). Verifikasi sesi terhadap DB dilakukan di server component/route handler lewat `verifySession`.

- [ ] **Step 4: Tulis halaman login & dashboard**

`src/components/LoginForm.tsx`:
```tsx
"use client";
import { useState } from "react";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    if (res.ok) { window.location.href = "/"; return; }
    const data = await res.json().catch(() => ({ error: "Gagal masuk" }));
    setError(data.error ?? "Gagal masuk");
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Masuk</h1>
      <input name="username" placeholder="Username" required autoComplete="username"
        className="w-full rounded border border-neutral-300 px-3 py-2" />
      <input name="password" type="password" placeholder="Password" required autoComplete="current-password"
        className="w-full rounded border border-neutral-300 px-3 py-2" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="w-full rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
        {loading ? "Memproses..." : "Masuk"}
      </button>
    </form>
  );
}
```

`src/app/login/page.tsx`:
```tsx
import LoginForm from "@/components/LoginForm";
export default function LoginPage() { return <LoginForm />; }
```

`src/app/page.tsx`:
```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/auth/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export default async function Home() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? "";
  const session = await verifySession(getDb(), token);
  if (!session) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Assalamu&apos;alaikum</h1>
      <p className="mt-2 text-neutral-600">Dashboard tracker hafalan akan tampil di sini (Fase 2).</p>
      <form action="/api/auth/logout" method="post" className="mt-6">
        <button className="rounded border border-neutral-300 px-4 py-2">Keluar</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Jalankan test & build**

```powershell
pnpm test tests/middleware.test.ts
pnpm build
```
Expected: PASS + build sukses.

- [ ] **Step 6: Verifikasi manual**

```powershell
pnpm dev
```
Buka `http://localhost:3000` → harus redirect ke `/login`. Login dengan akun hasil seed → masuk ke dashboard. Klik Keluar → kembali ke `/login`.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat: halaman login, dashboard terproteksi, middleware"
```

---

### Task 9: Konfigurasi deploy (Turso + Vercel) & dokumentasi

**Files:**
- Create: `.env.example`, `README.md`
- Modify: `package.json` (script `db:migrate` sudah ada; tambah `postinstall` bila perlu)

**Interfaces:**
- Produces: instruksi deploy yang bisa diikuti; env terdokumentasi.

- [ ] **Step 1: Tulis `.env.example`**

```
# Database libSQL. Lokal: file:./local.db  |  Produksi: libsql://<db>.turso.io
DATABASE_URL=file:./local.db
# Wajib diisi untuk Turso, kosongkan untuk file lokal
DATABASE_AUTH_TOKEN=

# Minimal 32 karakter acak (openssl rand -base64 32)
SESSION_SECRET=change-me-to-a-32-char-random-string

# Akun pemilik (hanya dipakai saat seed, tidak perlu di produksi setelah seed)
OWNER_USERNAME=owner
OWNER_PASSWORD=ubah-password-ini
```

- [ ] **Step 2: Tulis `README.md`**

Isi ringkas: prasyarat (Node 22, pnpm), langkah setup lokal (`pnpm install` → isi `.env` → `pnpm db:generate` → `pnpm db:migrate` → `pnpm mushaf:fetch` → `pnpm db:seed` → `pnpm dev`), langkah deploy (buat DB Turso, isi env Vercel, jalankan `pnpm db:migrate` + `pnpm db:seed` terhadap Turso via env produksi), catatan atribusi Tanzil, dan catatan `noindex`.

- [ ] **Step 3: Verifikasi alur lokal end-to-end**

```powershell
Copy-Item .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm mushaf:fetch
pnpm db:seed
pnpm test
pnpm build
```
Expected: migrasi jalan, 604 halaman ter-seed, semua test PASS, build sukses.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "docs: konfigurasi deploy Turso/Vercel + panduan setup"
```

---

## Self-Review

**Spec coverage:**
- Login satu akun tanpa registrasi → Task 5, 6, 7, 8 ✅
- Skema SQLite semua tabel (spec 10.1) → Task 2 ✅
- Data 604 halaman Madinah → Task 3, 4, 5 ✅
- Hash password + cookie aman + rate limit → Task 6, 7 ✅
- Semua route terproteksi + noindex → Task 1, 8 ✅
- Sumber data terverifikasi + atribusi (spec 11) → Task 4 ✅
- Deploy Vercel + Turso (spec 12) → Task 2, 9 ✅
- Migrasi sejak awal (spec 10.2) → Task 2 ✅

**Placeholder scan:** Tidak ada TBD/TODO; semua step berisi perintah/kode konkret.

**Type consistency:** `PageRow` dipakai konsisten (Task 3→4→5); `SESSION_COOKIE`/`verifySession` konsisten (Task 6→7→8); `hashPassword` didefinisikan Task 5 dan diuji Task 6.

**Review Focus terpetakan:** (1)(2)(3) → test Task 3 & verifikasi Task 4; (4) → test Task 7; (5) → test Task 6 (sesi kedaluwarsa) + verifikasi Task 8.

**Deferred (fase lain):** teks ayat/terjemahan, audio, tracker inti, murajaah, perencana AI, PWA, backup.
