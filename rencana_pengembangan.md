# Rencana Pengembangan: Tracker Hafalan Al-Qur'an dengan Perencana AI

Dokumen perencanaan untuk aplikasi web pribadi yang melacak hafalan, menetapkan target, dan memakai AI untuk menyusun rencana hafalan sesuai kondisi harian.

## 1. Ringkasan

Aplikasi web untuk **satu pengguna (pemilik)** yang membantu menjaga konsistensi menghafal Al-Qur'an. Tiga hal inti:

1. **Tracker**: mencatat setoran baru (ziyadah) dan murajaah per halaman/ayat beserta kualitasnya.
2. **Target**: target harian dan target khatam dengan tenggat, plus proyeksi apakah masih on track.
3. **Perencana AI**: menyusun dan menyesuaikan rencana berdasarkan kondisi terkini (waktu luang, kesibukan, ketertinggalan), lalu menjelaskan alasannya.

**Prinsip desain:** logika kode menghitung angka, AI menyusun dan menjelaskan. AI tidak pernah menghasilkan teks ayat.

## 2. Keputusan yang Sudah Diambil

| Topik | Keputusan |
| --- | --- |
| Pengguna | Pribadi, satu pengguna |
| Akses | Online di internet, butuh login |
| Registrasi | Tidak ada. Akun dibuat langsung oleh pemilik (seed/env) |
| Database | SQLite, diakses lewat Turso (libSQL) karena hosting di Vercel (lihat bagian 12) |
| AI | API Claude, dipanggil dari backend |
| Mushaf | Madinah 15 baris, 604 halaman |
| Sistem setoran | Sabaq / sabqi / manzil |
| Hosting | Vercel (tier gratis) |
| Audio | Murottal, opsional, setelah MVP |
| Bahasa | Indonesia saja |
| 2FA | Ditunda dulu |

## 3. Ruang Lingkup

### 3.1 MVP (Fase 1 sampai 3)

- Login satu akun
- Peta progres hafalan per juz/surah/halaman
- Catat setoran dan murajaah harian
- Target harian dan target khatam
- Jadwal murajaah otomatis (spaced repetition sederhana)
- Rencana AI: buat dan sesuaikan
- Tampilan responsif (nyaman di HP)

### 3.2 Setelah MVP

- PWA (install di HP) dan pengingat
- Ringkasan mingguan oleh AI dan audio murottal
- Mode offline dengan sinkronisasi
- Ekspor data (backup JSON/CSV)

### 3.3 Di luar lingkup (untuk sekarang)

- Registrasi dan multi-user
- Leaderboard atau fitur sosial
- Penilaian bacaan/tajwid otomatis
- Pembuatan teks ayat oleh AI (tidak akan pernah dilakukan)

## 4. Konsep Hafalan yang Dipakai

Aplikasi mengikuti pola umum halaqah supaya cocok dengan alur setoran ke guru:

- **Sabaq (ziyadah):** hafalan baru hari ini.
- **Sabqi:** pengulangan hafalan baru beberapa hari terakhir.
- **Manzil:** murajaah hafalan lama secara bergilir.

**Unit pelacakan:** halaman mushaf (Madinah, 15 baris, 604 halaman) sebagai unit utama, dengan opsi mencatat sampai level ayat. Halaman dipilih karena paling natural bagi penghafal dan mudah dihitung untuk proyeksi.

**Level kualitas per unit:**

| Level | Arti |
| --- | --- |
| Baru | Baru disetor, belum stabil |
| Lancar | Bisa dibaca tanpa melihat, kadang ragu |
| Mutqin | Kuat dan stabil |
| Lemah | Perlu diulang, banyak salah |

Penyesuaian sistem (misal ganti istilah atau rasio sabaq:sabqi:manzil) sebaiknya bisa diatur di pengaturan.

## 5. Fitur Detail

### 5.1 Dashboard

- Ringkasan hari ini: tugas sabaq, sabqi, manzil
- Progres khatam (persentase, sisa halaman, estimasi tanggal selesai)
- Status on track / tertinggal terhadap target
- Peta hafalan berwarna sesuai level kualitas

### 5.2 Pencatatan

- Form cepat: pilih halaman (atau surah dan ayat), jenis (sabaq/sabqi/manzil), kualitas, catatan kesalahan
- Riwayat dan bisa diedit/dihapus
- Desain untuk dua ketukan: pencatatan harus secepat mungkin karena dipakai tiap hari

### 5.3 Target

- Target khatam: jumlah halaman total, tanggal tenggat
- Target harian: halaman baru per hari, dihitung otomatis atau diatur manual
- Hari libur hafalan (misal pekan tertentu, Ramadan, sakit) yang tidak dihitung sebagai kegagalan

### 5.4 Murajaah Otomatis

Penjadwalan memakai algoritma sederhana, bukan AI (lihat bagian 9).

### 5.5 Perencana AI

Lihat bagian 8.

### 5.6 Streak yang Ramah

- Streak boleh dipulihkan dengan "hari istirahat" yang dijatah per bulan
- Tidak ada pesan yang menyalahkan saat bolong
- Tampilan fokus pada konsistensi jangka panjang (misal "21 dari 30 hari bulan ini")

## 6. Arsitektur dan Stack

### 6.1 Rekomendasi stack

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Framework | Next.js (App Router) + TypeScript | Frontend dan backend dalam satu proyek, mudah deploy |
| UI | Tailwind CSS | Cepat dan responsif |
| Database | SQLite via Turso (libSQL) + @libsql/client | SQLite yang bisa diakses dari Vercel serverless, cukup untuk satu pengguna |
| ORM | Drizzle ORM (atau Prisma) | Skema bertipe dan migrasi rapi |
| Auth | Sesi dengan cookie httpOnly | Sederhana untuk satu akun |
| AI | Anthropic SDK (server-side) | API key aman di backend |
| Validasi | Zod | Memvalidasi output JSON dari AI |

### 6.2 Alur umum

1. Browser memanggil API route di server.
2. Server membaca/menulis SQLite.
3. Untuk fitur AI: server menyusun data terstruktur, memanggil API Claude, memvalidasi JSON hasilnya, lalu menyimpan rencana.
4. Browser hanya menerima hasil akhir.

## 7. Autentikasi (Satu Akun, Tanpa Registrasi)

- Tidak ada halaman register. Akun dibuat lewat skrip seed atau variabel lingkungan saat pertama deploy.
- Simpan **hash password** (Argon2 atau bcrypt), bukan password asli.
- Sesi memakai cookie `httpOnly`, `Secure`, `SameSite=Lax`, dengan masa berlaku yang wajar.
- **Rate limiting** dan penundaan pada login untuk menahan brute force.
- Semua route API dan halaman (kecuali login) wajib terautentikasi.
- 2FA (TOTP) ditunda dulu dan bisa ditambahkan nanti.
- Pertimbangkan tambahan lapisan di depan (misal Cloudflare Access atau basic auth di reverse proxy) jika ingin ekstra aman.

## 8. Integrasi AI

### 8.1 Pembagian tugas

| Dikerjakan kode | Dikerjakan AI |
| --- | --- |
| Hitung sisa halaman, hari tersisa, kecepatan rata-rata | Susun rencana yang realistis sesuai kondisi |
| Jadwal murajaah dasar | Atur ulang rencana saat tertinggal |
| Validasi total halaman dan tanggal | Jelaskan alasan rencana dengan bahasa manusiawi |
| Simpan dan tampilkan data | Ringkasan dan refleksi mingguan |

### 8.2 Kondisi pengguna yang dikumpulkan

- Hafalan saat ini (otomatis dari database)
- Waktu luang per hari dan waktu paling fokus
- Target dan tenggat
- Kecepatan rata-rata nyata (dihitung dari riwayat)
- Kendala atau kondisi khusus (ujian, kerja lembur, Ramadan, sakit)

Kondisi bisa diisi lewat form singkat "check-in" sebelum rencana dibuat atau diperbarui.

### 8.3 Alur pembuatan rencana

1. Pengguna mengisi/menyetujui check-in kondisi.
2. Server menghitung angka kunci (sisa halaman, kecepatan, selisih target).
3. Server mengirim data terstruktur ke Claude, dengan instruksi mengembalikan **JSON saja**.
4. Server memvalidasi JSON (skema Zod) dan mengecek logika (total halaman tidak melebihi sisa, tanggal valid, beban harian tidak melebihi batas yang ditetapkan).
5. Jika valid, rencana disimpan dan ditampilkan beserta penjelasan. Jika tidak, coba ulang sekali, lalu fallback ke rencana hitungan biasa.

### 8.4 Contoh bentuk output JSON

```json
{
  "summary": "Ringkasan singkat rencana",
  "daily_pages_new": 0.5,
  "weeks": [
    {
      "week_start": "2026-10-12",
      "focus": "Juz 29, tambah murajaah juz 30",
      "days": [
        {"date": "2026-10-12", "sabaq_pages": 1, "sabqi_pages": 2, "manzil_pages": 5}
      ]
    }
  ],
  "explanation": "Alasan kenapa rencana disusun begini",
  "warnings": []
}
```

### 8.5 Aturan penting AI

- AI **tidak boleh** menulis atau mengutip ayat. Teks hanya dari database sumber terverifikasi.
- AI tidak mengklaim menilai bacaan atau tajwid. Aplikasi menyebut jelas bahwa ini perencana, bukan pengganti guru.
- Angka dan tanggal selalu divalidasi kode.
- Prompt sistem menyuruh AI bersikap realistis: lebih baik target kecil yang konsisten daripada besar yang gagal.
- Batasi data yang dikirim ke AI sebatas yang dibutuhkan, tanpa data pribadi lain.

### 8.6 Biaya dan performa

- Panggilan AI hanya terjadi saat membuat/menyesuaikan rencana atau ringkasan mingguan, bukan di tiap halaman.
- Cache rencana terakhir di database.
- Batasi jumlah panggilan per hari di sisi server untuk mencegah biaya tak terduga.
- Gunakan model yang cukup untuk tugas perencanaan, tidak perlu yang paling besar.

## 9. Algoritma Murajaah (Tanpa AI)

Versi awal yang sederhana:

- Setiap unit (halaman) punya `next_review_date` dan `interval_days`.
- Setelah murajaah: kualitas **mutqin** menggandakan interval, **lancar** menaikkan sedikit, **lemah** mereset ke interval pendek.
- Setiap hari, sistem memilih unit yang jatuh tempo, diurutkan dari yang paling lemah/terlambat, dan dibatasi sesuai kapasitas harian.
- Siklus manzil dijamin menyentuh seluruh hafalan dalam periode tertentu (misal satu juz per hari atau 30 hari putaran), diatur di pengaturan.

Ini bisa dimulai dari aturan sederhana, lalu disempurnakan setelah ada data pemakaian.

## 10. Model Data (SQLite)

### 10.1 Tabel

| Tabel | Isi |
| --- | --- |
| `users` | id, username, password\_hash, created\_at |
| `sessions` | id, user\_id, expires\_at |
| `pages` | page\_number (1 sampai 604), juz, surah\_start, ayah\_start, surah\_end, ayah\_end (referensi mushaf) |
| `memorization_status` | page\_number, status (belum/baru/lancar/mutqin/lemah), memorized\_at, last\_reviewed\_at, next\_review\_date, interval\_days |
| `sessions_log` | id, date, page\_number, type (sabaq/sabqi/manzil), quality, mistakes\_note, duration\_min |
| `goals` | id, type (khatam/harian), target\_pages, deadline, start\_date, active |
| `rest_days` | id, date, reason |
| `checkins` | id, date, free\_minutes, focus\_time, constraints\_note |
| `plans` | id, created\_at, goal\_id, input\_snapshot (JSON), plan\_json, explanation, status |
| `settings` | key, value (rasio sabaq/sabqi/manzil, jam pengingat, batas beban harian) |

### 10.2 Catatan model data

- Tabel `pages` diisi sekali dari data referensi mushaf yang terverifikasi, bukan dibuat AI.
- `sessions_log` adalah sumber kebenaran riwayat. `memorization_status` adalah ringkasan turunan yang bisa dihitung ulang.
- Simpan `input_snapshot` pada `plans` supaya rencana bisa diaudit dan dijelaskan di kemudian hari.
- Gunakan migrasi (Drizzle/Prisma) sejak awal.

## 11. Sumber Teks dan Data Al-Qur'an

- Teks ayat: ambil dari sumber terverifikasi (Tanzil, Quran.com API, atau dataset Mushaf Madinah yang kredibel) dan tampilkan apa adanya tanpa modifikasi.
- Data pemetaan halaman ke ayat: dari dataset mushaf Madinah 604 halaman yang sama dengan mushaf yang kamu pakai.
- Cek lisensi data dan cantumkan atribusi bila diminta.
- Simpan data referensi sebagai file statis atau tabel read-only agar tidak ada risiko berubah tak sengaja.
- Opsional: tombol audio murottal dari sumber yang punya lisensi jelas.

## 12. Deployment (Vercel + Turso)

File SQLite biasa tidak bisa dipakai di Vercel atau Netlify gratis, jadi database dipasang sebagai layanan SQLite terpisah (Turso/libSQL) yang diakses lewat jaringan. Fungsi serverless di kedua platform tidak punya disk persisten, sehingga file yang ditulis saat runtime hilang atau tidak bisa ditulis.

- **Aplikasi dan API:** Next.js di Vercel (tier gratis).
- **Database:** Turso (libSQL, kompatibel SQLite) lewat `@libsql/client`. Skema dan query SQL tetap sama dengan SQLite.
- **Lokal:** pakai file SQLite lokal dengan driver libSQL yang sama, jadi kode tidak berbeda antara lokal dan produksi.
- **Rahasia:** URL dan token database, API key AI, dan secret sesi disimpan di environment variables Vercel.
- **Panggilan AI:** tier gratis membatasi durasi fungsi, jadi panggilan AI dibuat ringkas atau memakai streaming.
- **Backup:** ekspor database berkala (dump SQL) ke penyimpanan lain, plus tombol ekspor di aplikasi.
- **Batas tier gratis:** cek batas Vercel dan Turso saat mendaftar, karena bisa berubah.
- **HTTPS:** otomatis dari Vercel.

Alternatif jika ingin file SQLite biasa: VPS kecil, Fly.io, atau Railway dengan volume persisten (satu instance, WAL mode, backup file terjadwal). Kodenya hampir sama, yang berubah hanya hosting.

## 13. Keamanan dan Privasi

- Data ibadah bersifat personal: batasi akses, jangan indeksasi mesin pencari (`noindex`).
- Hash password kuat, rate limiting login, cookie aman.
- Validasi semua input di server.
- Jangan log data sensitif atau API key.
- Jelaskan di halaman pengaturan data apa yang dikirim ke penyedia AI.
- Fitur hapus/ekspor seluruh data.
- Jaga dependensi tetap terbarui.

## 14. Desain Engagement yang Sehat

- Halaman utama menjawab satu pertanyaan: "Hari ini apa yang perlu aku lakukan?"
- Pengingat terjadwal di waktu yang kamu pilih (misal setelah subuh), tidak spam.
- Pesan yang menenangkan dan realistis, tanpa rasa bersalah.
- Pencapaian bermakna (selesai satu juz, murajaah konsisten satu bulan) yang tidak mendorong pamer.
- Ringkasan mingguan jujur dan singkat: yang berhasil, yang perlu diperbaiki, saran satu hal kecil untuk pekan depan.
- Selalu ada opsi "hari ini ringan" agar kamu tetap menjaga kebiasaan saat sedang sulit.

## 15. Roadmap

| Fase | Isi | Hasil yang diharapkan |
| --- | --- | --- |
| 0. Persiapan | Putuskan stack, sumber data mushaf, hosting; siapkan repo | Keputusan teknis final |
| 1. Fondasi | Login satu akun, skema SQLite, data 604 halaman, deploy awal | Aplikasi online dengan login |
| 2. Tracker inti | Pencatatan setoran/murajaah, peta progres, target dan proyeksi | Bisa dipakai tiap hari menggantikan catatan manual |
| 3. Murajaah otomatis | Algoritma jadwal, tampilan tugas harian | Tahu persis apa yang diulang hari ini |
| 4. Perencana AI | Check-in, pembuatan dan penyesuaian rencana, validasi JSON | Rencana yang menyesuaikan kondisi |
| 5. Engagement | PWA, pengingat, ringkasan mingguan, streak ramah | Kebiasaan lebih terjaga |
| 6. Penguatan | Backup otomatis, ekspor data, offline, audio murottal | Aman dan andal jangka panjang |

**Saran:** pakai hasil Fase 2 sendiri minimal 2 sampai 4 minggu sebelum masuk Fase 4, supaya rencana AI dibangun di atas data kecepatan hafalanmu yang nyata.

## 16. Risiko dan Mitigasi

| Risiko | Mitigasi |
| --- | --- |
| AI salah hitung atau memberi rencana tidak realistis | Semua angka divalidasi kode, ada batas beban harian, fallback ke rencana hitungan biasa |
| Kehilangan data SQLite | Backup harian otomatis dan ekspor manual |
| Akses tidak sah karena aplikasi online | Hash kuat, rate limit, HTTPS; 2FA menyusul |
| Biaya AI membengkak | Batas panggilan per hari, cache, model secukupnya |
| Kehilangan motivasi karena aplikasi terasa menghakimi | Streak ramah, bahasa lembut, hari istirahat |
| Kesalahan data mushaf | Pakai dataset terverifikasi, cek acak manual terhadap mushaf fisik |
| Terlalu banyak fitur sebelum terpakai | Ikuti roadmap bertahap, evaluasi setelah tiap fase |

## 17. Keputusan atas Pertanyaan Terbuka

Pertanyaan awal sudah dijawab; ringkasannya:

| Pertanyaan | Jawaban |
| --- | --- |
| Mushaf | Madinah 15 baris |
| Sistem setoran | Sabaq / sabqi / manzil |
| Hafalan saat ini | Masih sedikit, jadi rencana awal dikalibrasi dari data nyata |
| Hosting | Vercel gratis, database lewat Turso (bagian 12) |
| Audio murottal | Boleh, opsional, setelah MVP |
| Bahasa | Indonesia saja |
| 2FA | Ditunda |

Masih perlu ditentukan nanti: posisi hafalan tepatnya, tanggal target khatam, dan sumber audio murottal dengan lisensi jelas.

## 18. Langkah Berikutnya

1. Tentukan sumber data mushaf Madinah 15 baris (teks ayat dan pemetaan halaman) beserta lisensinya.
2. Siapkan proyek Next.js, akun Vercel, dan akun Turso.
3. Mulai Fase 1: skema database, data 604 halaman, login satu akun.
4. Tentukan posisi hafalan dan target khatam untuk uji coba rencana AI.
