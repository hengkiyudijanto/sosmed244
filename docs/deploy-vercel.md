# Deploy ke Vercel — sosmed244

Repo: https://github.com/hengkiyudijanto/sosmed244
Semua sudah siap dari sisi kode. Ikuti urutan ini.

## Sudah diverifikasi (jangan dikerjakan ulang)

- Build sukses **tanpa** `DATABASE_URL` → Vercel tidak butuh akses database saat
  build. Semua 10 halaman dinamis (`ƒ`), jadi tidak ada halaman statis yang
  memanggil DB saat kompilasi.
- `build` = `prisma generate && next build` (tanpa migrate — benar).
- Kredensial tidak ikut ter-commit: hanya `.env.example` dan
  `config/sosmed.contoh.json` yang masuk repo.

---

## 1. Import repo di Vercel

1. Buka https://vercel.com/new
2. Pilih **Import Git Repository** → `hengkiyudijanto/sosmed244`
3. Framework akan terdeteksi otomatis sebagai **Next.js**. Biarkan default:
   - Build Command: `pnpm build`
   - Output Directory: `.next` (default)
   - Install Command: `pnpm install`
4. **Jangan klik Deploy dulu** — isi Environment Variables di langkah 2, kalau
   tidak aplikasinya akan error saat dibuka.

## 2. Environment Variables

Tambahkan **sebelum** deploy pertama (menu *Environment Variables*, centang
Production + Preview + Development untuk semuanya):

| Nama | Nilai |
|---|---|
| `DATABASE_URL` | connection string Neon (lihat cara ambil di bawah) |
| `DATABASE_URL_UNPOOLED` | connection string Neon yang sama tanpa pooling |
| `NEXT_PUBLIC_APP_URL` | `https://sosmed244.vercel.app` |

**Cara mengambil nilai database** (jangan tempel di chat):

```bash
# di laptop/server, dari repo btn-sip atau sosmed244:
neon connection-string --project-id wild-sunset-06071450
```

Atau dari Neon Console → project **sosmed244** → Connection Details.

- Nilai untuk `DATABASE_URL` = varian **Pooled connection**
- Nilai untuk `DATABASE_URL_UNPOOLED` = varian **Direct connection**

> **PENTING — jangan sertakan `channel_binding=require`.** Parameter itu membuat
> autentikasi gagal dari server ini (`28P01`, "password authentication failed")
> padahal passwordnya benar. Hapus parameter tersebut dari URL sebelum dipakai.
> Akhiri URL dengan `?sslmode=require`.

`NEXT_PUBLIC_APP_URL` **harus** sama dengan domain akhir aplikasi. Nilai ini
dipakai untuk menyusun URL berkas media yang diambil TikTok/Instagram. Kalau
salah, platform tidak bisa mengambil berkasnya saat nanti pindah ke pengiriman
nyata.

Kalau nama project Vercel Anda ternyata bukan `sosmed244`, sesuaikan:
`https://<nama-project>.vercel.app`.

## 3. Deploy

Klik **Deploy**. Tunggu sampai selesai (±1–2 menit).

## 4. Setelah deploy — WAJIB: jalankan migrasi

Deploy **tidak** menjalankan migrasi (memang sengaja, supaya build tidak
menyentuh database produksi). Skema harus diterapkan sekali dari sisi Anda:

```bash
# dari repo lokal Anda
git clone git@github.com:hengkiyudijanto/sosmed244.git
cd sosmed244
pnpm install

export DATABASE_URL="postgresql://...  (yang UNPOOLED, tanpa channel_binding)"
pnpm exec prisma migrate deploy
```

Perintah ini menerapkan migrasi `20261005215218_init_sosmed244` yang sudah ada di
repo. Aman dijalankan berulang (idempoten).

## 5. Buat akun pertama

Database Vercel masih kosong. Buat akun admin + data contoh:

```bash
# masih di repo lokal, dengan DATABASE_URL yang sama
pnpm exec tsx scripts/seed.ts "PasswordAdminAnda123"
```

Akun yang dibuat:

| Akun | Peran | Kegunaan |
|---|---|---|
| `admin@sosmed244.local` | Admin | lihat Pengaturan; **wajib ganti password saat login pertama** |
| `kreator@sosmed244.local` | Kreator | buat & ajukan konten |
| `penyetuju@sosmed244.local` | Penyetuju | setujui / minta revisi |

Ketiganya memakai password yang Anda isi di perintah di atas.

> Ganti password bawaan itu setelah login pertama — akun contoh ini dibuat hanya
> supaya alurnya bisa langsung dicoba.

## 6. Coba alurnya

1. Buka `https://sosmed244.vercel.app` → login sebagai `kreator@sosmed244.local`
2. **Buat Konten** → unggah gambar → pilih penyetuju → simpan sebagai draft
3. Buka kontennya → **Ajukan untuk disetujui**
4. Logout, login sebagai `penyetuju@sosmed244.local` → **Persetujuan**
5. Coba **Minta revisi** (isi alasan) lalu lihat dari sisi kreator; setelah itu
   **Setujui** dan **Kirim ke platform**

Pengiriman masih **simulasi** (tidak ada unggahan nyata ke TikTok/Instagram) —
banner kuning "Modus simulasi" akan tampak di dasbor. Itu memang perilaku yang
diharapkan sekarang.

---

## Kalau ada masalah

**Halaman blank / 500 setelah deploy** → environment variables belum terisi,
atau `DATABASE_URL` masih memuat `channel_binding=require`.

**"This Serverless Function has timed out"** saat buka halaman** → database Neon
sedang cold start (project baru). Muat ulang sekali, biasanya langsung normal.

**Login selalu gagal "Email atau password salah"** → langkah 5 (seed) belum
dijalankan, jadi belum ada akun sama sekali. Cek juga:
```bash
pnpm exec tsx scripts/lihat-data.ts    # harus menampilkan daftar pengguna
```

**Tidak bisa menekan tombol apapun** → laporkan; di proyek ini pernah terjadi
karena `useFormStatus().pending` dipakai mentah untuk `disabled` (tombol tercetak
nonaktif di HTML). Sudah diperbaiki dengan `useKirimForm()`, tapi kalau muncul
lagi itu petunjuk arahnya ke sana.

## Yang belum ada (jangan dianggap beres)

1. **Pengiriman nyata** ke TikTok/Instagram — masih simulasi. Perlu: URL media
   publik (token sekali-pakai), kredensial di `config/sosmed.json`, refresh
   token, dan app review platform.
2. **Pengiriman terjadwal** — status DIJADWALKAN + kolom `jadwalAt` sudah ada,
   tapi belum ada worker/cron yang menjalankannya.
3. **Region.** Kalau database Neon di Singapura, region fungsi Vercel sebaiknya
   juga Singapura (`sin1`) supaya responsnya cepat — set di Project Settings →
   Functions → Region.
