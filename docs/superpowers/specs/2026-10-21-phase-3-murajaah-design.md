# Desain Fase 3: Murajaah Otomatis

Dokumen desain untuk Fase 3 (Murajaah otomatis) dari `rencana_pengembangan.md` bagian 5.4, 9, dan 15. Menjadi acuan sebelum menyusun plan implementasi.

## 1. Tujuan

Setelah Fase 2 pengguna bisa mencatat dan melihat progres, tetapi masih harus memutuskan sendiri **apa yang diulang hari ini**. Fase 3 menjawab satu pertanyaan itu secara otomatis: aplikasi menyusun daftar murajaah harian dari data yang sudah ada, membatasinya sesuai kapasitas, dan memperbarui jadwal setiap kali halaman diulang.

**Kriteria sukses:**

- Membuka `/murajaah` langsung memberi daftar halaman yang perlu diulang hari ini, terbagi sabqi dan manzil.
- Satu ketukan pada halaman mencatat murajaah dengan kualitas yang dipilih, lalu halaman itu hilang dari daftar dan jadwalnya bergeser.
- Seluruh hafalan tersentuh dalam `manzil_cycle_days` hari (selama kapasitas harian mencukupi), dan aplikasi jujur memberi tahu bila kapasitas tidak cukup.
- Halaman `lemah` selalu didahulukan.
- Parameter algoritma bisa diubah di `/pengaturan` tanpa deploy.

## 2. Ruang Lingkup

### 2.1 Termasuk

- Perhitungan jadwal per halaman: `interval_days` + `next_review_date`, diturunkan ulang dari `sessions_log` (replay), bukan di-increment.
- Dua jalur murajaah: **sabqi** (hafalan dalam jendela `sabqi_window_days`) dan **manzil** (sisanya, dirotasi).
- Daftar tugas harian dengan prioritas, batas kapasitas, dan hitungan yang ditunda.
- Halaman `/murajaah`: tugas hari ini, catat cepat per halaman, tandai semua.
- Halaman `/pengaturan`: jendela sabqi, siklus manzil, batas harian, batas interval, label jenis setoran.
- API `POST /api/murajaah/complete` (catat massal) dan `GET/PATCH /api/settings`.
- Skrip `pnpm db:recompute` untuk mengisi `next_review_date` pada data lama.
- Integrasi dashboard: ringkasan tugas murajaah hari ini.

### 2.2 Tidak termasuk (fase lain)

- Perencana AI, check-in, rencana mingguan → Fase 4.
- PWA, pengingat/notifikasi, ringkasan mingguan, streak ramah → Fase 5.
- Ekspor/backup, offline, audio murottal → Fase 6.
- Teks ayat, penilaian tajwid → tidak pernah (di luar lingkup produk).

## 3. Model Domain

### 3.1 Dua jalur, bukan satu

Praktik halaqah memisahkan dua pekerjaan yang berbeda sifat:

| Jalur | Isi | Sifat | Mekanisme di aplikasi |
| --- | --- | --- | --- |
| **Sabqi** | hafalan berumur < `sabqi_window_days` (default 14) | masih rapuh, diulang sering | jalur **interval** (spaced repetition) |
| **Manzil** | hafalan yang lebih tua | sudah stabil, butuh giliran | jalur **rotasi** (semua tersentuh dalam `manzil_cycle_days`) |

Halaman hanya berada di satu jalur pada satu waktu; jalur diturunkan dari `memorized_at`, bukan disimpan. Ketika halaman melewati jendela sabqi, ia otomatis pindah ke rotasi manzil.

**Alasan tidak memakai satu jalur interval saja:** interval murni tidak bisa menjamin seluruh hafalan tersentuh dalam periode tertentu — halaman dengan interval panjang bisa tidak pernah kebagian. Sebaliknya, rotasi saja tidak cukup responsif untuk hafalan baru yang masih rapuh. Dua jalur menutup kedua kelemahan itu.

### 3.2 Kapan halaman dianggap jatuh tempo

```
sabqi  : next_review_date == null  ATAU  next_review_date <= hari ini
manzil : (slot rotasi hari ini)    ATAU  next_review_date <= hari ini
```

Bagian kedua pada manzil penting: halaman yang baru di-review dengan kualitas `lemah` mendapat interval 1, sehingga otomatis muncul lagi besok tanpa menunggu giliran rotasi.

### 3.3 Perkembangan interval

Interval awal setiap halaman = 1 hari saat `sabaq` pertama. Setiap kejadian review (sabqi, manzil, atau `sabaq` ulang pada halaman yang sama) memperbarui interval:

| Kualitas | Interval baru | Contoh |
| --- | --- | --- |
| `mutqin` | `min(cap, interval × 2)` | 4 → 8 |
| `lancar` | `min(cap, interval + ceil(interval / 2))` | 4 → 6 |
| `baru` | `1` | 8 → 1 |
| `lemah` | `1` | 8 → 1 |

`next_review_date = tanggal log + interval baru`, dibatasi `interval_cap_days` (default 30) agar interval tidak tumbuh tanpa batas dan rotasi manzil tetap berperan.

### 3.4 Rotasi manzil

Halaman jalur manzil diurutkan berdasarkan `page_number`, lalu diberi slot `index % manzil_cycle_days`. Slot hari ini = `daysBetween(EPOCH, hari ini) % manzil_cycle_days` dengan `EPOCH = "2024-01-01"` (konstanta tetap, tanpa state). Setiap hari, halaman dengan slot = slot hari ini menjadi tugas.

Konsekuensi yang diterima: ketika jumlah halaman manzil berubah (hafalan baru masuk), slot sebagian halaman bergeser. Karena pemetaan dihitung ulang setiap hari dan tidak disimpan, tidak ada data yang perlu diperbaiki; paling banyak satu halaman terlewat/terulang dalam transisi. Ini jauh lebih murah daripada menyimpan dan memigrasikan slot.

### 3.5 Kapasitas harian

`daily_load_limit` (default 2) adalah batas jumlah halaman murajaah yang ditampilkan sebagai tugas hari ini.

- **Sabqi menang klaim kapasitas lebih dulu**, sisanya untuk manzil. Alasan: hafalan baru paling berisiko hilang; manzil bersifat bergilir dan bisa menunggu.
- Sisa yang tidak masuk kapasitas **tidak disembunyikan**, tetapi dilaporkan sebagai `deferred` ("N halaman lain juga jatuh tempo") dengan tautan ke Pengaturan. Tidak ada pesan menyalahkan.
- Bila `ceil(jumlah_halaman_manzil / kapasitas) > manzil_cycle_days`, aplikasi menampilkan estimasi cakupan (`coverageDays`) dan peringatan halus bahwa siklus tidak tercapai dengan batas tersebut.

### 3.6 Urutan prioritas

Dalam satu jalur, urutan tugas:

1. Status paling lemah lebih dulu (`lemah` → `baru` → `lancar` → `mutqin`).
2. Terlambat paling lama lebih dulu (`hari ini − next_review_date`).
3. `page_number` menaik, agar urutan stabil dan mudah diikuti.

## 4. Keputusan yang Diambil

| Topik | Keputusan |
| --- | --- |
| Sumber jadwal | Diturunkan ulang (replay) dari `sessions_log` setiap recompute — bukan increment, agar log backdate/edit/hapus tetap konsisten |
| Kolom baru | Tidak ada. `memorization_status.next_review_date` & `interval_days` sudah ada sejak Fase 1 |
| Jalur | Diturunkan dari `memorized_at` vs `sabqi_window_days`; tidak disimpan |
| Tabel tugas harian | Tidak dibuat. Daftar dihitung saat render, halaman yang sudah diulang hari ini dikeluarkan dari outstanding dan ditampilkan sebagai selesai |
| Rotasi | Slot deterministik dari urutan `page_number` + epoch tetap; tanpa state |
| Kapasitas | Global per hari; sabqi didahulukan, manzil mendapat sisa |
| Jenis log saat menyelesaikan tugas | Ditentukan server (`sabqi`/`manzil`) dari jalur halaman, bukan dari klien |
| Recompute | Satu kali per operasi; endpoint massal menulis banyak log lalu recompute sekali |
| Settings | Sumber kebenaran default ada di kode (`DEFAULT_SETTINGS`); baris DB menimpa. Tabel kosong tetap berfungsi |
| Label jenis setoran | Dapat diubah di Pengaturan (dipakai di `/murajaah` dan dashboard) |

## 5. Perubahan Data

Tidak ada migrasi skema. Yang berubah:

1. **Nilai baru di `settings`**: `interval_cap_days = "30"`. Karena `loadSettings` selalu menggabungkan default, database lama tetap berjalan tanpa seed ulang; `pnpm db:seed` bersifat opsional untuk menulis barisnya secara eksplisit.
2. **Isi `memorization_status`**: `next_review_date` dan `interval_days` kini terisi. Data lama perlu satu kali `pnpm db:recompute`.

## 6. Arsitektur & Modul

### 6.1 Modul murni (diuji TDD, tanpa DB)

- `src/lib/settings.ts` — `DEFAULT_SETTINGS`, `clampInt`, `parseSettings(rows)`, `loadSettings(db)`, tipe `AppSettings`.
- `src/lib/tracker/schedule.ts` — `advanceInterval`, `replayPageSchedule`, `todayRotationSlot`, `buildDailyTasks`, `ROTATION_EPOCH`.
- `src/lib/tracker/derive-status.ts` — `recomputeMemorizationStatus(db)` diperluas: kini juga menulis `interval_days`, `next_review_date` hasil replay.
- `src/lib/tracker/daily.ts` — `loadDailyTasks(db, date)`: pembungkus tipis yang membaca `memorization_status`, log hari itu, dan settings, lalu memanggil `buildDailyTasks`. Dipakai `/murajaah` dan dashboard (DRY).

### 6.2 API

| Method | Route | Fungsi |
| --- | --- | --- |
| POST | `/api/murajaah/complete` | catat 1–50 halaman murajaah sekaligus; jenis log ditentukan server; recompute sekali |
| GET | `/api/settings` | settings terparse + baris mentah |
| PATCH | `/api/settings` | ubah subset key yang diizinkan (validasi Zod, `.strict()`) |

Tidak ada `GET /api/murajaah`: halaman `/murajaah` adalah server component yang membaca DB langsung (pola Fase 2), dan setelah mencatat ia memakai `router.refresh()`.

### 6.3 Halaman & UI

- **`/murajaah`** — progres hari ini, tombol "Tandai semua lancar", seksi Sabqi dan Manzil, daftar selesai, peringatan kapasitas. Setiap baris punya 4 tombol kualitas (Lancar/Mutqin/Lemah/Baru) — satu ketukan = tercatat.
- **`/pengaturan`** — form parameter algoritma + label jenis setoran, dengan pratinjau cakupan siklus.
- **Dashboard `/`** — kartu "Murajaah hari ini": jumlah selesai/total, chip halaman yang tersisa, tautan ke `/murajaah`.
- **Nav** — tambah "Murajaah" di antara Catat dan Riwayat; ikon roda gigi di header menuju `/pengaturan` (tidak menambah tab bar bawah).

## 7. Alur Data

1. Pengguna membuka `/murajaah` → server memanggil `loadDailyTasks` → `buildDailyTasks` (murni) → daftar tugas.
2. Pengguna menekan kualitas pada satu halaman → `POST /api/murajaah/complete`.
3. Handler memuat settings + status halaman, menolak halaman yang belum dihafal, menentukan jenis (`sabqi`/`manzil`) dari umur hafalan, menulis `sessions_log` dalam satu transaksi, lalu `recomputeMemorizationStatus` sekali.
4. Recompute me-replay semua log per halaman → `status`, `memorized_at`, `last_reviewed_at`, `interval_days`, `next_review_date` diperbarui.
5. `router.refresh()` merender ulang `/murajaah`; halaman yang baru diulang hilang dari outstanding dan muncul di daftar selesai.

## 8. Penanganan Error

- Tanpa sesi → 401.
- Payload tidak valid (tanggal salah, kualitas tidak dikenal, `items` kosong/>50) → 400.
- Tanggal di masa depan → 400.
- Halaman yang belum pernah `sabaq` → 400 `Halaman N belum dihafal` (tidak membuat log yatim).
- Item duplikat dalam satu request → didedupe (kualitas terakhir menang), bukan error.
- PATCH settings dengan key tak dikenal atau nilai di luar rentang → 400.
- Kegagalan recompute tidak membatalkan log yang sudah ditulis (log dulu, recompute sesudah).

## 9. Pengujian

- Vitest, pola DB temp yang sama dengan Fase 2 (`mkdtempSync` + `migrate`).
- Kasus inti:
  - `advanceInterval`: mutqin ×2, lancar +50%, lemah/baru → 1, batas atas dihormati.
  - `replayPageSchedule`: sabaq pertama mulai interval 1; review memajukan; `sabaq` ulang juga memajukan; halaman tanpa sabaq → `belum`; log backdate menghasilkan jadwal yang sama seperti urutan aslinya.
  - `buildDailyTasks`: pemisahan jalur berdasar umur; rotasi menyentuh semua halaman manzil dalam satu siklus; sabqi menang kapasitas; halaman yang sudah diulang tidak muncul lagi; `lemah` paling awal; `coverageDays` + `capacityWarning`.
  - `recomputeMemorizationStatus`: kolom jadwal terisi dan konsisten setelah create/update/hapus log.
  - API: 401/400/201, jenis log ditentukan server, interval bertambah setelah complete, settings clamp.
- Verifikasi akhir: `pnpm test`, `pnpm lint`, `pnpm build`, alur manual end-to-end.

## 10. Definisi Selesai (Fase 3)

- `next_review_date` & `interval_days` terisi otomatis untuk semua halaman hafal, dan berubah sesuai kualitas review.
- `/murajaah` menampilkan tugas hari ini dengan urutan prioritas yang benar, batas kapasitas, dan laporan halaman tertunda.
- Satu ketukan pada tugas mencatat murajaah dengan jenis yang benar dan memperbarui jadwal.
- `/pengaturan` dapat mengubah 4 parameter + 3 label, dan perubahan langsung memengaruhi daftar tugas.
- `pnpm db:recompute` tersedia untuk data lama.
- Dashboard menampilkan ringkasan murajaah hari ini.
- `pnpm test`, `pnpm lint`, `pnpm build` lulus; alur manual terbukti di browser.
