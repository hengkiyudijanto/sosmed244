# sosmed244

Aplikasi manajemen konten sosial media: **kreator mengunggah konten → mengajukan
untuk disetujui → penyetuju memutuskan → konten dikirim ke TikTok & Instagram.**

Aplikasi ini **berdiri sendiri** — tidak berbagi kode, skema, maupun database
dengan proyek lain.

## Alur status

```
DRAFT ──ajukan──► MENUNGGU ──setujui──► DISETUJUI ──kirim──► DIKIRIM
  ▲                  │                     │  ▲
  └────tarik──── REVISI ◄──minta revisi─────┘  └──jadwalkan──► DIJADWALKAN
```

Aturannya hidup di **satu tempat**: `src/lib/konten/status.ts` (`transisi()`),
dengan unit test di `status.test.ts`. Halaman dan server action hanya bertanya —
jangan menulis perbandingan status sendiri di tempat lain.

Dua aturan yang paling penting:

1. **Konten belum disetujui tidak bisa dikirim.** Berlaku untuk semua orang,
   termasuk admin — dijaga di mesin transisi, bukan hanya dengan menyembunyikan
   tombol.
2. **Pengiriman adalah langkah terpisah dari persetujuan.** Kalau platform
   menolak, status tetap *Disetujui* supaya bisa dicoba ulang tanpa mengulang
   approval. Hasil per platform disimpan di kolom `hasilKirim`.

## Peran & hak

| | Kreator | Penyetuju | Admin |
|---|---|---|---|
| Buat / ubah konten sendiri | ✅ | ✅ | ✅ |
| Ajukan / tarik pengajuan | ✅ (miliknya) | ✅ (miliknya) | ✅ |
| Menyetujui / minta revisi | ❌ | ✅ | ✅ |
| Kirim ke platform | ✅ (miliknya) | ✅ | ✅ |
| Lihat semua konten | ❌ | ✅ | ✅ |
| Kelola pengguna & pengaturan | ❌ | ❌ | ✅ |

Kreator **tidak bisa menyetujui kontennya sendiri**, dan penyetuju **dikunci saat
konten diajukan** (tidak bisa diarahkan ulang ke penyetuju lain setelah dibuat).

Semua keputusan hak akses lewat `src/lib/konten/akses.ts`. Jangan menulis
`peran === 'ADMIN'` di halaman atau server action — menambah peran baru harus
cukup dengan mengubah satu berkas itu.

## Menjalankan

```bash
pnpm install
cp .env.example .env.local     # lalu isi DATABASE_URL
pnpm exec prisma migrate dev -n init   # pakai -n, BUKAN --name (Prisma 7)
pnpm exec tsx scripts/seed.ts "PasswordAdmin123"
pnpm dev                        # http://localhost:3000
```

Akun yang dibuat seed:

| Akun | Peran | Password |
|---|---|---|
| `admin@sosmed244.local` | Admin | yang Anda set (wajib ganti saat login pertama) |
| `kreator@sosmed244.local` | Kreator | idem |
| `penyetuju@sosmed244.local` | Penyetuju | idem |

### Perintah lain

```bash
pnpm test                          # unit test (mesin status, hak akses, adapter)
pnpm exec tsc --noEmit             # typecheck
pnpm exec tsx scripts/lihat-data.ts        # lihat isi database apa adanya
pnpm exec tsx scripts/uji-aturan.ts        # uji aturan + proteksi (server harus hidup)
pnpm exec tsx scripts/cek-koneksi.ts       # diagnosa koneksi database
pnpm exec tsx scripts/seed.ts --hapus      # bersihkan data contoh
```

## Deploy ke Vercel

Panduan langkah demi langkah (termasuk environment variables, urutan migrasi, dan
cara mengatasi kalau halaman blank): **[docs/deploy-vercel.md](docs/deploy-vercel.md)**.

Dua hal yang paling sering menjatuhkan deploy pertama:

1. **`prisma migrate deploy` JANGAN ditaruh di build Vercel.** Migrasi dijalankan
   terpisah dari build, sekali, dari sisi pengembang.
2. **`DATABASE_URL` jangan memuat `channel_binding=require`** — parameter itu
   membuat autentikasi gagal (`28P01`) padahal passwordnya benar.

## Pengiriman ke platform (modus simulasi ↔ nyata)

Adapter di `src/lib/konten/penerbit.ts` dipilih lewat `config/sosmed.json`
(sudah di `.gitignore` karena memuat access token):

| Kondisi | Yang dipakai |
|---|---|
| `modus: "mock"` | simulasi — tidak ada unggahan nyata |
| `modus: "nyata"` + kredensial lengkap | adapter Instagram / TikTok sungguhan |
| `modus: "nyata"` + kredensial belum lengkap | **jatuh ke simulasi**, dengan catatan sebabnya |

Menambah platform baru: tambahkan di `PLATFORM` (`status.ts`), tulis fungsinya,
daftarkan di `REGISTRY_PENERBIT`. Tidak perlu mengubah percabangan yang ada.

Adapun validasi platform **dilakukan sebelum memanggil API** (`periksaKelayakan`):
TikTok hanya video, Instagram feed hanya JPEG, caption maks 2200 karakter,
batas ukuran dan durasi. Karena Instagram menolak PNG, gambar dikonversi ke JPEG
di peramban — bukan di server, supaya tidak perlu pustaka encoder di jalur
permintaan.

## Penyimpanan berkas

Media disimpan sebagai data URL di kolom `Konten.mediaData` dan disajikan lewat
route `/media/[id]`. Alasannya: Vercel tidak punya filesystem permanen, dan berkas
besar tidak boleh ikut terkirim di HTML setiap kali halaman dibuka.

**Ini bukan tempat untuk video besar.** Kalau kolom ini membengkak, pindahkan ke
object storage — hanya route `/media/[id]` yang perlu diubah.

## Sebelum dipakai produksi

**Sudah beres dan terverifikasi di produksi:**

1. ✅ **URL media publik.** `/media/[id]/[mediaId]` menerima token sekali-pakai
   lewat `?t=…` (30 menit, maks 2× pengambilan), jadi platform bisa menarik berkas
   tanpa sesi. Rute thumbnail `/media/[id]` sengaja TETAP hanya-sesi.
2. ✅ **`NEXT_PUBLIC_APP_URL`** terisi `https://sosmed244.vercel.app`.
3. ✅ **Pembaru token otomatis** (`token-umur.ts` + `token-platform.ts`) jalan
   dari cron harian. Token Instagram yang dipakai produksi sekarang berjenis
   **PAGE dan tidak kedaluwarsa**.
4. ✅ **Pengiriman terjadwal jalan sendiri.** Dialihkan dari cron Vercel (paket
   Hobby hanya boleh sekali sehari, dan melanggarnya menolak SELURUH deployment)
   ke **penjadwal luar** yang memanggil `/api/cron/jadwal` tiap 5 menit dengan
   `Authorization: Bearer <CRON_SECRET>`. Entri `crons` di `vercel.json` sudah
   dihapus. Terbukti: konten terjadwal benar-benar terbit ke Instagram.
5. ✅ **Pemantauan**: pemeriksa harian yang hanya melapor bila ada masalah
   (`scripts/pemeriksa.ts`), plus notifikasi kegagalan dari penjadwal luar.

**Yang masih tersisa:**

1. **Jalur TikTok dinonaktifkan** (`TIKTOK_AKTIF = false` di
   `src/lib/konten/status.ts`). TikTok hanya mengizinkan unggahan nyata setelah
   app-nya lolos audit, dan audit itu tidak tersedia untuk alat internal seperti
   ini. Kodenya masih utuh dan bisa dinyalakan kembali kalau app-nya sudah lolos.
   Lihat `docs/jalur-tiktok.md`.
2. **App review** TikTok Content Posting API — administratif. Untuk Meta TIDAK
   perlu review selama hanya menerbitkan ke akun/halaman sendiri (Standar
   Access) — sudah terbukti.
3. **Aturan lint khusus TypeScript & Next** belum aktif sampai typescript-eslint
   mendukung TS 7. Pemeriksaan tipe tetap lengkap lewat `tsc --noEmit` dan saat
   `next build`. Lihat `docs/lint-typescript.md`.
4. **Token platform bergantung pada satu penjadwal luar.** Kalau penjadwal itu
   berhenti, konten terjadwal dan pembaruan token ikut berhenti. Notifikasi
   kegagalan di akun penjadwal adalah alarmnya.

## Jebakan yang sudah memakan waktu

- **`channel_binding=require` di URI Neon** membuat autentikasi gagal (`28P01`)
  dari server ini, padahal password benar. Buang parameternya.
- **URI dari response "create project" Neon memuat password placeholder** (`***`).
  Ambil dari endpoint `connection_uri`, atau reset password role-nya.
- **Host pooler Neon** belum tentu ada. Di project ini
  `...-pooler.aws.neon.tech` menjawab `ENOTFOUND` — pakai host langsung.
- **`prisma migrate` gagal di host pooler yang belum aktif** (`P1001`). Untuk
  development dan migrasi, arahkan ke koneksi langsung.
- **Deploy Vercel: env baru TIDAK berlaku sampai di-redeploy.** Ini penyebab
  paling sering dari "sudah saya perbaiki tapi masih error".
- **Error `P2021 table does not exist` tidak menyebut database mana yang dituju.**
  Untuk memastikan, bandingkan daftar tabel: database sosmed244 punya `Pengguna`,
  sedangkan btn-sip punya `Pegawai`. `scripts/banding-database.ts` memeriksa ini.
- **`useFormStatus().pending` jangan dipakai langsung untuk `disabled`** — nilainya
  `true` saat HTML dirender di server, sehingga semua tombol tercetak nonaktif.
  Pakai `useKirimForm()`.
- **Kegagalan mock tidak boleh deterministik per konten.** Versi pertama memakai
  hash id, akibatnya konten yang gagal akan gagal selamanya dan tombol "coba
  kirim lagi" tidak pernah bisa berhasil. Sekarang berbasis acak (~20%).
- **Uji UI lewat skrip: `document.querySelector('button[type=submit]')` mengambil
  tombol PERTAMA di halaman**, dan itu tombol "Keluar" — sehingga skrip "Simpan"
  malah logout. Ambil dari dalam form yang benar.
- **`curl` TIDAK memanggil server action Next.** Action butuh header `Next-Action`
  berisi id yang ditanam di bundel klien. Tanpa itu, POST hanya menghasilkan render
  halaman biasa yang **selalu 200** — sehingga tampak "berhasil" padahal login
  tidak pernah dijalankan. Ini sempat menyesatkan saat diagnosa produksi.
- **`postcss.config.mjs` wajib ada.** Tanpa itu Tailwind tidak diproses: halaman
  tetap tampil tetapi tanpa tata letak, dan CSS hasil build hanya berisi beberapa
  aturan. Periksa dengan menghitung aturan di CSS hasil build.
- **`prisma migrate dev` butuh `-n`, bukan `--name`.**
- **`URL.query` tidak ada di TypeScript** — pakai `URL.searchParams`.

