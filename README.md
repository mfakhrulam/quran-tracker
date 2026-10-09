# Tracker Hafalan Al-Qur'an

Aplikasi pelacak hafalan Al-Qur'an berbasis 604 halaman mushaf Madinah. Fase 1 mencakup fondasi: login satu akun (tanpa registrasi), dashboard terproteksi, skema database, dan data mushaf statis.

## Prasyarat

- **Node.js 22** (disarankan versi LTS terbaru dari seri 22)
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

   Minimal isi `SESSION_SECRET` dengan string acak 32+ karakter (`openssl rand -base64 32`). Untuk lokal, `DATABASE_URL` biarkan `file:./local.db` dan `DATABASE_AUTH_TOKEN` kosong. Atur `OWNER_USERNAME` dan `OWNER_PASSWORD` untuk akun pemilik.

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

1. **Buat database Turso** dan dapatkan kredensialnya:

   ```powershell
   turso db create quran-tracker
   turso db show quran-tracker --url        # -> libsql://<db>.turso.io
   turso db tokens create quran-tracker     # -> token autentikasi
   ```

2. **Isi environment di Vercel** (Project Settings → Environment Variables):

   - `DATABASE_URL` = `libsql://<db>.turso.io`
   - `DATABASE_AUTH_TOKEN` = token dari langkah sebelumnya
   - `SESSION_SECRET` = string acak 32+ karakter
   - `OWNER_USERNAME` dan `OWNER_PASSWORD` = akun pemilik (hanya dipakai saat seed)

3. **Jalankan migrasi dan seed terhadap Turso** dengan env produksi. Setel `DATABASE_URL` dan `DATABASE_AUTH_TOKEN` ke nilai Turso, lalu:

   ```powershell
   pnpm db:migrate
   pnpm db:seed
   ```

   Setelah seed selesai, `OWNER_USERNAME`/`OWNER_PASSWORD` tidak lagi diperlukan di produksi.

4. Deploy proyek ke Vercel seperti biasa.

## Atribusi Data

Pemetaan halaman (Madinah, 604 halaman), juz, dan surah diambil dari **Tanzil Quran Metadata** (https://tanzil.net), Copyright (C) 2008-2009 Tanzil.info, dilisensikan **Creative Commons Attribution 3.0** (CC-BY 3.0). File sumber: https://tanzil.net/res/text/metadata/quran-data.js. Teks ayat tidak disimpan pada fase ini. Rincian ada di `src/data/ATTRIBUTION.md`.

## Catatan noindex

Aplikasi ini bersifat privat (satu akun, tanpa registrasi). Seluruh halaman ditandai `noindex, nofollow` melalui metadata root (`src/app/layout.tsx`) agar tidak diindeks mesin pencari.
