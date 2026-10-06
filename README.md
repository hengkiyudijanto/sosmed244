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

## Sebelum dipakai produksi (belum selesai)

1. **URL media publik.** TikTok & Instagram menarik berkas dari URL, sedangkan
   `/media/[id]` masih memerlukan sesi login. Perlu token sekali-pakai berumur
   pendek khusus pengiriman.
2. **`NEXT_PUBLIC_APP_URL`** harus diisi alamat publik; kalau tidak, URL media
   menunjuk localhost.
3. **Refresh token** Meta (~60 hari) & TikTok — belum ada pembaru otomatis.
4. **Pengiriman terjadwal** belum berjalan sendiri: status & `jadwalAt` sudah
   tersimpan, tetapi belum ada worker/cron yang menjalankannya.
5. **App review** TikTok Content Posting API & izin Meta.

## Jebakan yang sudah memakan waktu

- **`channel_binding=require` di URI Neon** membuat autentikasi gagal (`28P01`)
  dari server ini, padahal password benar. Buang parameternya.
- **URI dari response "create project" Neon memuat password placeholder** (`***`).
  Ambil dari endpoint `connection_uri`, atau reset password role-nya.
- **Host pooler Neon** di project baru sempat menolak koneksi (`P1001`) saat
  compute belum aktif. Koneksi langsung lebih andal untuk development.
- **`useFormStatus().pending` jangan dipakai langsung untuk `disabled`** — nilainya
  `true` saat HTML dirender di server, sehingga semua tombol tercetak nonaktif.
  Pakai `useKirimForm()`.
- **Kegagalan mock tidak boleh deterministik per konten.** Versi pertama memakai
  hash id, akibatnya konten yang gagal akan gagal selamanya dan tombol "coba
  kirim lagi" tidak pernah bisa berhasil. Sekarang berbasis acak (~20%).
- **Uji UI lewat skrip: `document.querySelector('button[type=submit]')` mengambil
  tombol PERTAMA di halaman**, dan itu tombol "Keluar" — sehingga skrip "Simpan"
  malah logout. Ambil dari dalam form yang benar.
- **`prisma migrate dev` butuh `-n`, bukan `--name`.**
