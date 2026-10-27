# Tracker Hafalan Al-Qur'an

Aplikasi pelacak hafalan Al-Qur'an berbasis 604 halaman mushaf Madinah. Sudah mencakup login satu akun (tanpa registrasi), pencatatan setoran dan murajaah, peta progres berwarna, target khatam dengan proyeksi, serta penjadwalan murajaah otomatis (sabqi dan manzil).

## Prasyarat

- **Node.js >= 22.9** (disarankan 24 LTS)
- **pnpm** (manajer paket proyek ini)

## Setup Lokal

1. Pasang dependensi:

   ```powershell
   pnpm install
   ```

2. Salin berkas contoh environment dan sesuaikan isinya:

   ```powershell
   Copy-Item .env.example .env
   ```

   Minimal yang perlu diisi adalah `DATABASE_URL`. Untuk lokal, biarkan `file:./local.db` dan `DATABASE_AUTH_TOKEN` kosong. Atur `OWNER_USERNAME` dan `OWNER_PASSWORD` untuk akun pemilik. Tidak ada secret yang perlu dibuat: sesi memakai token acak yang disimpan sebagai hash di tabel `sessions`.

3. Buat migrasi (bila skema berubah) dan jalankan migrasi ke database lokal:

   ```powershell
   pnpm db:generate
   pnpm db:migrate
   ```

4. Unduh data pemetaan 604 halaman mushaf (menulis ulang `src/data/pages.json`):

   ```powershell
   pnpm mushaf:fetch
   ```

5. Isi database dengan 604 halaman dan akun pemilik dari `.env`:

   ```powershell
   pnpm db:seed
   ```

6. Jalankan server pengembangan:

   ```powershell
   pnpm dev
   ```

   Buka http://localhost:3000 dan masuk memakai kredensial pemilik.

## Deploy (Turso + Vercel)

0. **Prasyarat CLI Turso**: pasang Turso CLI lalu autentikasi sebelum langkah di bawah:

   ```powershell
   # Windows (Scoop)
   scoop install turso
   turso auth login
   ```

1. **Buat database Turso** dan dapatkan kredensialnya:

   ```powershell
   turso db create quran-tracker
   turso db show quran-tracker --url        # -> libsql://<db>.turso.io
   turso db tokens create quran-tracker     # -> token autentikasi
   ```

2. **Isi environment di Vercel** (Project Settings → Environment Variables):

   - `DATABASE_URL` = `libsql://<db>.turso.io`
   - `DATABASE_AUTH_TOKEN` = token dari langkah sebelumnya
   - `OWNER_USERNAME` dan `OWNER_PASSWORD` = akun pemilik (hanya dipakai saat seed)

3. **Jalankan migrasi dan seed terhadap Turso** dengan env produksi. Setel `DATABASE_URL` dan `DATABASE_AUTH_TOKEN` ke nilai Turso, lalu:

   ```powershell
   pnpm db:migrate
   pnpm db:seed
   ```

   Setelah seed selesai, `OWNER_USERNAME`/`OWNER_PASSWORD` tidak lagi diperlukan di produksi.

4. Deploy proyek ke Vercel seperti biasa.

## Murajaah Otomatis (Fase 3)

Jadwal murajaah diturunkan ulang dari riwayat setiap kali ada log baru, diedit, atau dihapus — bukan di-increment. Dengan begitu mengedit tanggal atau menghapus log selalu menghasilkan jadwal yang benar.

Dua jalur:

- **Sabqi** — hafalan lebih muda dari `sabqi_window_days`, diulang lewat interval. Mutqin menggandakan interval, lancar menambah setengah, lemah/baru mereset ke 1 hari. Dibatasi `interval_cap_days`.
- **Manzil** — hafalan lama, dirotasi berdasarkan nomor halaman sehingga seluruh hafalan tersentuh dalam `manzil_cycle_days`.

`daily_load_limit` membatasi jumlah halaman yang ditampilkan per hari. Sabqi menang klaim kapasitas; manzil mendapat sisa; sisanya dilaporkan sebagai "ditunda", tidak disembunyikan.

Parameter diubah di `/pengaturan`. Setelah menarik kode Fase 3 pada database yang sudah berisi data, jalankan sekali:

```powershell
pnpm db:recompute
```

Perintah ini mengisi `interval_days` dan `next_review_date` untuk halaman yang sudah ada. Tanpa itu aplikasi tetap berjalan (jadwal kosong dianggap jatuh tempo), tetapi daftar murajaah jadi kurang presisi sampai dijalankan.

## Batasan

- **Rate limiter in-memory per-instance.** Pembatasan percobaan login disimpan di memori proses, sehingga pada serverless (banyak instance) hanya bersifat best-effort. Kunci limiter memakai header IP dari platform (`x-nf-client-connection-ip`) sehingga tidak dapat dipalsukan klien; batas 10.000 bucket mencegah memori tumbuh tanpa batas. Store bersama (DB/Upstash) direncanakan pada fase berikutnya.

## Catatan keamanan

Hasil security audit ada di `docs/security/2026-10-26-audit.md`. Ringkasnya: endpoint mutasi menolak body di atas 64 KB, wajib `Content-Type: application/json`, dan menolak `Origin` lintas situs; header keamanan dipasang global dari `next.config.ts`; sesi kedaluwarsa dipangkas dan dibatasi 5 sesi aktif per pengguna.

## Atribusi Data

Pemetaan halaman (Madinah, 604 halaman), juz, dan surah diambil dari **Tanzil Quran Metadata** (https://tanzil.net), Copyright (C) 2008-2009 Tanzil.info, dilisensikan **Creative Commons Attribution 3.0** (CC-BY 3.0). File sumber: https://tanzil.net/res/text/metadata/quran-data.js. Teks ayat tidak disimpan pada fase ini. Rincian ada di `src/data/ATTRIBUTION.md`.

## Catatan noindex

Aplikasi ini bersifat privat (satu akun, tanpa registrasi). Seluruh halaman ditandai `noindex, nofollow` melalui metadata root (`src/app/layout.tsx`) agar tidak diindeks mesin pencari.
