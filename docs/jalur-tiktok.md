# Jalur TikTok — dinonaktifkan (TIKTOK_AKTIF = false)

## Kenapa dimatikan

TikTok Content Posting API hanya mengizinkan unggahan **nyata** kalau app-nya
sudah lolos **audit**. Tanpa audit:

- semua unggahan dipaksa **privat** (`unaudited_client_can_only_post_to_private_accounts`),
- akun yang mengunggah harus disetel privat,
- maksimum 5 pengguna per 24 jam.

Masalahnya, pedoman TikTok secara eksplisit **menolak app "untuk pemakaian
pribadi atau internal"** dan menyebut "alat bantu untuk mengunggah konten ke akun
yang Anda atau tim Anda kelola" sebagai **tidak diterima**. Jadi alat internal
seperti sosmed244 tidak punya jalur audit yang realistis.

Kesimpulan pemilik aplikasi: jalur TikTok **disembunyikan dari antarmuka**,
kodenya tetap disimpan.

## Cara menyalakan kembali

Satu baris di `src/lib/konten/status.ts`:

```ts
export const TIKTOK_AKTIF = false;   // -> true
```

Yang otomatis ikut hidup kembali:

| Bagian | Berkas |
|---|---|
| Pilihan tujuan `TikTok saja` & `TikTok & Instagram` | `form-konten.tsx` (memakai `TUJUAN`) |
| Kolom TikTok di tabel dukungan jenis postingan | `pengaturan/page.tsx` (memakai `PLATFORM`) |
| Pembaruan token TikTok di cron harian + tombol di Pengaturan | `token-platform.ts` (memakai `daftar`) |
| Kartu status kredensial TikTok | `pengaturan/page.tsx` |

Yang **tidak** ikut hidup sendiri: kartu kredensial di halaman Pengaturan sudah
disederhanakan jadi satu cabang (Instagram). Kembalikan bentuk kondisionalnya
dari riwayat git (commit sebelum "TikTok dinonaktifkan") kalau TikTok dihidupkan.

## Yang TIDAK dihapus (sengaja)

- Adapter `buatTikTok()` di `src/lib/konten/penerbit.ts` — lengkap, termasuk
  mode DRAFT dan PUBLIK.
- Aturan jenis postingan TikTok di `ATURAN_JENIS_POSTING.TIKTOK` (FEED & REELS;
  STORY dan CAROUSEL memang tidak ada di API TikTok).
- Batas platform `BATAS_PLATFORM.TIKTOK`.
- Pembaruan token TikTok di `token-platform.ts`.
- Skrip `scripts/simpan-token.ts TIKTOK <access> <expires> <refresh> <refresh_expires>`.
- **Unit test** untuk semua di atas (memakai `PLATFORM_TIKTOK`/`PLATFORM_DIKENAL`),
  supaya kode TikTok tidak membusuk tanpa ada yang menjaga.

## Perilaku data lama

Nilai `TIKTOK` dan `KEDUANYA` **tetap ada** di tipe dan database (skema tidak
diubah, tidak ada migrasi). Konten lama yang tujuannya `KEDUANYA` atau `TIKTOK`:

- `platformDariTujuan()` menyaringnya menjadi platform yang dilayani →
  `KEDUANYA` menjadi `['INSTAGRAM']`, `TIKTOK` menjadi `[]`.
- Akibatnya: konten itu **tetap terkirim ke Instagram** dan tidak error.
- Dijaga oleh unit test: "konten lama bertujuan KEDUANYA dikirim ke Instagram
  saja — tanpa error" dan "tujuan TIKTOK (data lama) tidak mengirim ke mana pun".

## Kalau memutuskan memakai perantara

Ada layanan yang audit TikTok-nya sudah lolos (mis. Blotato). Kalau nanti mau
lewat jalur itu, yang perlu diubah hanya `buatTikTok()` — antarmuka dan mesin
status tidak perlu disentuh karena sudah memisahkan platform dari cara kirim.
