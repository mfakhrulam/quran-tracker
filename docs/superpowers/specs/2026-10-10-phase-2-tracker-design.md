# Desain Fase 2: Tracker Inti

Dokumen desain untuk Fase 2 (Tracker inti) dari `rencana_pengembangan.md`. Menjadi acuan sebelum menyusun plan implementasi.

## 1. Tujuan

Memberi pemilik aplikasi alat harian untuk **mencatat setoran (sabaq) dan murajaah (sabqi/manzil)**, melihat **peta progres hafalan** yang berwarna sesuai kualitas, serta mengelola **target dan proyeksi** agar tahu apakah masih on track. Setelah fase ini, aplikasi bisa menggantikan catatan hafalan manual.

**Kriteria sukses:**
- Mencatat satu setoran selesai dalam dua ketukan (form cepat, default terisi).
- Peta 604 halaman menampilkan status setiap halaman.
- Dashboard menjawab "hari ini apa yang perlu aku lakukan?" dan status on-track terhadap target khatam.
- Riwayat bisa diedit/dihapus, dan `memorization_status` selalu konsisten dengan riwayat.

## 2. Ruang Lingkup

### 2.1 Termasuk
- Pencatatan setoran/murajaah per halaman (level ayat opsional), dengan kualitas dan catatan kesalahan.
- Riwayat: daftar, edit, hapus.
- Peta progres 604 halaman berwarna per level, dikelompokkan per juz.
- Target khatam (total halaman + tenggat) dan target harian (otomatis/manual).
- Hari libur hafalan (rest days) yang tidak dihitung sebagai kegagalan.
- Proyeksi: pace nyata, estimasi tanggal selesai, status on-track.
- Tampilan responsif (nyaman di HP).

### 2.2 Tidak termasuk (fase lain)
- Penjadwalan murajaah otomatis (`next_review_date`, interval) → Fase 3.
- Perencana AI (check-in, pembuatan rencana, validasi JSON) → Fase 4.
- PWA, pengingat, ringkasan mingguan, streak ramah → Fase 5.
- Teks ayat/terjemahan → tidak ditampilkan di fase ini (hanya nomor halaman + surah/juz).
- Audio murottal, ekspor, offline → Fase 6.

## 3. Latar Belakang Domain (Sabaq / Sabqi / Manzil)

Sistem tiga lapis dari tradisi madrasah Asia Selatan, pada dasarnya spaced repetition:

- **Sabaq (ziyadah):** hafalan baru hari ini. Satu-satunya lapis yang **menambah hafalan**.
- **Sabqi:** mengulang hafalan baru-baru ini (jendela ±7–30 hari), masih rapuh, diulang hampir tiap hari.
- **Manzil:** murajaah seluruh hafalan lama secara bergilir (mis. siklus 7 hari; hafiz penuh ±1 juz/hari).

Implikasi desain:
1. `type` disimpan **per entri log**, bukan per halaman. Satu halaman bisa dicatat `sabaq` hari ini dan `manzil` kemudian.
2. **"Hafalan" dihitung dari halaman yang pernah disetor `sabaq`.** Sabqi/manzil adalah review dan tidak menambah jumlah hafalan. Progres khatam dan pace proyeksi memakai definisi ini.
3. Jendela sabqi dan siklus manzil adalah parameter (disiapkan di `settings`), meski algoritmanya baru dipakai Fase 3.
4. Istilah dapat berbeda antar lembaga → label dapat dikonfigurasi.

## 4. Keputusan yang Diambil

| Topik | Keputusan |
| --- | --- |
| Batas lingkup | Ketat sesuai roadmap Fase 2 |
| Unit pencatatan | Halaman; level ayat opsional (`ayah_start`/`ayah_end` nullable) |
| Teks ayat | Tidak ditampilkan; cukup nomor halaman + nama surah + juz |
| Pace proyeksi | Dari halaman **sabaq unik** dalam rentang goal; `rest_days` mengurangi hari efektif |
| "Hafalan" | Halaman dengan status ≠ `belum`; `lemah` tetap dihitung hafal (perlu diulang) |
| Zona waktu | Lokal tunggal (mis. Asia/Jakarta); tanggal disimpan sebagai teks `YYYY-MM-DD` |
| Target harian | Goal `harian` opsional; bila kosong dihitung otomatis dari goal khatam |
| Sumber `memorization_status` | Diturunkan ulang dari `sessions_log` setiap ada create/update/delete |

## 5. Perubahan Data & Skema

### 5.1 Perubahan `sessions_log`
Tambah kolom nullable `ayah_start` (integer), `ayah_end` (integer). Tambah indeks pada `date` dan `page_number` untuk query riwayat/agregat.

### 5.2 Data referensi surah (baru)
`src/data/surahs.json` — 114 entri `{ number, arabic, latin, ayahCount }` dari metadata Tanzil (CC-BY 3.0, sudah tercakup atribusi yang ada). Diperlukan untuk menampilkan nama surah. Ditambah fungsi parser `parseTanzilSurahs` dan perluasan `scripts/fetch-mushaf.ts` (tetap kompatibel; tidak mengubah `parseTanzilMetadata`).

### 5.3 Seed pengaturan default
Task skema menambahkan seed default `settings` (idempotent):
- `sabqi_window_days` = `14`
- `manzil_cycle_days` = `7`
- `daily_load_limit` = `2` (batas beban harian)
- `label_sabaq` = `Sabaq`, `label_sabqi` = `Sabqi`, `label_manzil` = `Manzil`

Dipakai Fase 3; disiapkan sekarang agar tidak perlu migrasi ulang.

### 5.4 Tabel yang tidak berubah
`users`, `sessions`, `pages`, `goals`, `rest_days`, `checkins`, `plans`. `goals` sudah cukup: goal `khatam` aktif (target_pages, start_date, deadline) dan goal `harian` opsional.

## 6. Arsitektur & Modul

### 6.1 Modul logika murni (jantung, diuji TDD)
- `src/lib/tracker/date.ts` — tanggal lokal `YYYY-MM-DD`, hitung hari efektif (kurangi `rest_days`), selisih hari.
- `src/lib/tracker/quality.ts` — konstanta & validasi level (`belum`/`baru`/`lancar`/`mutqin`/`lemah`) dan jenis (`sabaq`/`sabqi`/`manzil`).
- `src/lib/tracker/derive-status.ts` — `recomputeMemorizationStatus(db)`: hitung ulang `memorization_status` dari `sessions_log`. Aturan: `status` hanya diturunkan dari log **`sabaq`** (kualitas sabaq terbaru); `memorizedAt` = log `sabaq` pertama; `lastReviewedAt` = log terbaru **dari tipe apa pun** (termasuk sabqi/manzil); halaman tanpa log `sabaq` dihapus/di-`belum`-kan. Ini menjaga agar "hafalan = pernah disetor sabaq" (bagian 3 & 4) konsisten dengan "hafalan = status ≠ belum".
- `src/lib/tracker/progress.ts` — agregat: jumlah per status, jumlah hafalan (≠ `belum`), rincian per juz, persen khatam.
- `src/lib/tracker/projection.ts` — `computeProjection({ goal, progress, restDays, today })`: pace (halaman sabaq unik / hari efektif), sisa halaman, estimasi tanggal selesai, `onTrack`, `requiredPace`.

### 6.2 API & auth
Helper baru `getSessionUserId()` (baca cookie → `verifySession`) dipakai semua route baru; balas 401 bila tak ada sesi. Semua route mengikuti pola Fase 1 (`handler.ts` + `route.ts`) agar mudah diuji tanpa Next runtime.

| Method | Route | Fungsi |
| --- | --- | --- |
| GET | `/api/sessions` | daftar log (filter tanggal/halaman/tipe) |
| POST | `/api/sessions` | buat log; panggil `recomputeMemorizationStatus` |
| PATCH | `/api/sessions/[id]` | ubah log; recompute |
| DELETE | `/api/sessions/[id]` | hapus log; recompute |
| GET | `/api/goals` | daftar goal |
| POST | `/api/goals` | buat goal (khatam/harian) |
| PATCH | `/api/goals/[id]` | ubah/nonaktifkan goal |
| GET | `/api/progress` | agregat + proyeksi untuk dashboard/peta |
| POST | `/api/rest-days` | tandai hari libur |
| DELETE | `/api/rest-days` | hapus hari libur |

Validasi input dengan Zod. Semua endpoint wajib sesi.

### 6.3 Halaman & UI
- Layout terproteksi dengan nav (Dashboard, Catat, Riwayat, Peta, Target) + tombol Keluar.
- **Dashboard `/`** — ringkasan hari ini (yang sudah dicatat + sisa target harian), progress bar khatam, status on-track + estimasi tanggal selesai, mini peta.
- **`/catat`** — form cepat: default tanggal hari ini, tipe `sabaq`, kualitas `lancar`; pemilih halaman menampilkan surah/juz; bisa lanjut input berikutnya tanpa pindah halaman.
- **`/riwayat`** — daftar log; edit/hapus inline.
- **`/peta`** — grid 604 halaman dikelompokkan per juz, diwarnai per level (legenda).
- **`/target`** — kelola goal khatam/harian + daftar hari libur.

## 7. Alur Data

1. Pengguna mengisi form cepat → `POST /api/sessions`.
2. Server memvalidasi (Zod), menulis `sessions_log`, lalu menjalankan `recomputeMemorizationStatus(db)`.
3. Dashboard & Peta membaca `GET /api/progress` (agregat + proyeksi) dan daftar status.
4. Edit/hapus log memicu recompute ulang sehingga `memorization_status` tetap konsisten.

## 8. Penanganan Error

- Tanpa sesi valid → 401 (semua endpoint tracker).
- Input tidak valid → 400 dengan pesan Indonesia.
- `pageNumber` di luar 1–604 → 400.
- Rentang ayat tidak konsisten (`ayah_start > ayah_end`) atau di luar jumlah ayat halaman → 400.
- Goal khatam ganda aktif → tolak atau nonaktifkan yang lama (satu goal khatam aktif).
- Tanggal di masa depan untuk log → tolak (kecuali kebijakan lain ditentukan).
- Kegagalan recompute tidak boleh menghilangkan data log; tulis log dulu, recompute sebagai langkah lanjutan.

## 9. Pengujian

- Vitest untuk semua modul murni (date, quality, derive-status, progress, projection) dan handler route, memakai DB temp seperti test Fase 1.
- Kasus penting: recompute setelah create/update/delete; hafalan dihitung hanya dari sabaq; `rest_days` memengaruhi pace; proyeksi on-track/terlambat; validasi ayat opsional; otorisasi 401.
- Verifikasi akhir fase: `pnpm test`, `pnpm lint`, `pnpm build`, dan alur manual end-to-end.

## 10. Definisi Selesai (Fase 2)

- Skema termigrasi (kolom ayat + indeks), `surahs.json` ter-seed, settings default ada.
- Semua modul murni & route punya test lulus.
- Halaman Dashboard, Catat, Riwayat, Peta, Target berfungsi dan responsif.
- Progres & proyeksi konsisten dengan aturan sabaq-unik dan rest days.
- `pnpm lint` & `pnpm build` bersih.
