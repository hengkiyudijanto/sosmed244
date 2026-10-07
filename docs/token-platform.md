# Pembaruan token platform (Meta & TikTok)

Token Instagram (long-lived) berlaku **60 hari** dan token TikTok hanya **24 jam**.
Tanpa pembaru, pengiriman berhenti dengan 401 begitu tokennya habis — dan itu
terjadi tanpa peringatan, biasanya tepat saat ada konten yang harus segera
terkirim. Dokumen ini menjelaskan cara kerjanya dan apa yang masih perlu diisi
manusia.

## Dari mana token dibaca

| Sumber | Isi | Berubah? |
|---|---|---|
| `config/sosmed.json` atau environment variable | client key/secret, ig user id, token AWAL | tidak (nilai tetap) |
| Tabel `TokenPlatform` | token hasil pembaruan | ya, setiap kali diperbarui |

Token di database **menang** atas yang di berkas. Yang di berkas hanya dipakai
kalau belum ada hasil pembaruan.

## Kapan diperbarui

`src/lib/konten/token-umur.ts` (fungsi murni, ada unit test-nya):

- Diperbarui kalau sisa masa berlaku **≤ 20%** dari 60 hari.
- **Tidak** diperbarui kalau masa berlakunya **tidak diketahui**. Ini disengaja:
  pada TikTok, setiap pembaruan menerbitkan refresh token baru dan **yang lama
  langsung tidak berlaku** — memperbarui dengan alasan yang salah bisa membuang
  token yang masih panjang umurnya.
- **Tidak** diperbarui kalau baru diperbarui dalam 24 jam terakhir.
- **Tidak** dicoba kalau token sudah kedaluwarsa, atau refresh token sudah lewat
  (percobaan hanya akan gagal dan mengotori catatan).

## Kapan dijalankan

Digabung ke cron harian `/api/cron/jadwal` — bukan cron terpisah, karena paket
Vercel Hobby hanya mengizinkan **satu cron per hari**. Token TikTok yang berlaku
24 jam memang akan selalu menipis di antara dua pemanggilan harian; karena itu
pembaruannya dijalankan SETIAP kali cron berjalan, bukan menunggu ambang.

Kalau butuh pembaruan lebih rapat, panggil endpoint itu lebih sering
(penjadwal luar), atau naik ke paket Pro.

## Yang masih perlu diisi manusia

Agar pembaruan otomatis benar-benar bekerja, dua hal ini belum ada di server:

### Instagram
Pembaruan (`GET /refresh_access_token`) hanya butuh access token itu sendiri —
**tidak butuh App Secret**. Jadi begitu token long-lived pertama tersimpan
bersama tanggal kedaluwarsanya, pembaruan berjalan sendiri tanpa tambahan apa pun.

### TikTok
Butuh **client key** dan **client secret** aplikasi TikTok, serta refresh token
dari alur otorisasi OAuth:

```bash
# Tambahkan ke environment Vercel (Settings → Environment Variables):
SOSMED_TIKTOK_CLIENT_KEY=...
SOSMED_TIKTOK_CLIENT_SECRET=...
```

Refresh token diperoleh sekali lewat alur otorisasi TikTok
(`/v2/oauth/token/` dengan `grant_type=authorization_code`), lalu simpan dengan:

```bash
pnpm exec tsx scripts/simpan-token.ts TIKTOK "<access_token>" "<refresh_token>" <expires_detik> <refresh_expires_detik>
```

Setelah itu pembaruan berjalan sendiri (TikTok mengembalikan refresh token baru
setiap kali — token baru itu yang disimpan).

## Tombol "Perbarui token sekarang"

Ada di halaman **Pengaturan**, di kartu tiap platform. Gunanya:

- memperbarui token yang **tidak punya informasi masa berlaku** (pembaruan
  otomatis sengaja tidak menyentuhnya);
- mencoba lagi setelah pembaruan otomatis gagal karena gangguan jaringan,
  tanpa menunggu cron berikutnya.

Kegagalannya dilaporkan apa adanya (client key belum diisi, refresh token belum
ada, atau platform yang menolak) — bukan disamaratakan menjadi "gagal".

## Halaman Pengaturan menampilkan

- sisa masa berlaku token (hijau/kuning/merah),
- apakah token sudah tersimpan di database (berarti pembaruan otomatis aktif),
- pesan kegagalan pembaruan terakhir, kalau ada.

## Kalau token terlanjur mati

1. Lihat kartu platform di halaman **Pengaturan** — pesannya menyebut penyebabnya.
2. Instagram: buat ulang long-lived token lewat alur Meta, lalu simpan
   (`scripts/simpan-token.ts INSTAGRAM ...`).
3. TikTok: perlu otorisasi ulang dari akun TikTok (refresh token tidak bisa
   dihidupkan kembali setelah lewat masa berlakunya).
