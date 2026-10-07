# Menyalakan pengiriman terjadwal (CRON_SECRET + cron Vercel)

Endpoint: `GET /api/cron/jadwal` — menjalankan konten berstatus DIJADWALKAN yang
waktunya sudah tiba. Logikanya di `src/lib/konten/jadwal.ts`.

## Kondisi saat ini

- **`CRON_SECRET` sudah diisi** di Vercel (environment Production). Endpoint
  menolak semua permintaan tanpa header `Authorization: Bearer <CRON_SECRET>`.
- **Jadwal: sekali sehari**, `0 1 * * *` (01:00 UTC = 08:00 WIB).
- Terverifikasi di produksi: tanpa rahasia → `401 {"ok":false,"pesan":"Tidak berwenang."}`;
  dengan rahasia → `200 {"ok":true,...}`.

## PENTING: paket Hobby hanya boleh cron SEKALI SEHARI

Ini pernah menghabiskan waktu lama karena gejalanya menipu. Paket Vercel Hobby
menolak cron yang berjalan lebih dari sekali sehari:

```
Hobby accounts are limited to daily cron jobs.
This cron expression (*/5 * * * *) would run more than once per day.
Upgrade to the Pro plan to unlock all Cron Jobs features on Vercel.
```

Yang membuatnya menipu: **SELURUH deployment ditolak**, bukan hanya cron-nya.
Situs tetap dilayani versi lama, sehingga halaman lama tampak normal
(`/masuk` → 200, `/media/x` → 401), hanya rute yang BARU ditambahkan yang 404,
dan daftar Deployments tidak menampilkan commit terbaru sama sekali.

Gejala itu mudah disalahartikan sebagai **webhook Git yang putus** — dan memang
sempat membuat pengecekan Git di GitHub dan Vercel dilakukan (hasilnya: repo
tersambung normal dan izinnya "All repositories", jadi bukan masalahnya).

**Cara menemukan penyebab aslinya**: deploy manual dari CLI, yang mencetak
alasan penolakan dengan jelas.

```bash
vercel login          # sekali saja; butuh konfirmasi di browser
vercel --prod
```

Kalau butuh pengiriman tiap beberapa menit: naik ke paket Pro, atau pakai
penjadwal luar (mis. cron-job.org gratis) yang memanggil endpoint ini dengan
header `Authorization: Bearer <CRON_SECRET>`.

## Cara deploy dari server ini

`vercel` CLI sudah login sebagai `hengkiyudijanto-4675`:

```bash
cd ~/projects/sosmed244
vercel --prod         # deploy commit terbaru, tanpa menunggu webhook
vercel ls             # daftar deployment
```

## Cara memastikan endpoint hidup

```bash
# tanpa rahasia -> 401 (DITOLAK), BUKAN 404
curl -s -o /dev/null -w "%{http_code}\n" https://sosmed244.vercel.app/api/cron/jadwal

# dengan rahasia benar -> 200 dan melaporkan berapa konten dipertimbangkan
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  https://sosmed244.vercel.app/api/cron/jadwal
```

Bedakan empat jawaban yang mudah tertukar:

| Jawaban | Artinya |
|---|---|
| `404` | Kode belum ter-deploy (deployment-nya gagal atau belum jalan) |
| `503` + pesan menyebut CRON_SECRET | Endpoint hidup, tetapi rahasianya belum diisi di server |
| `401` | Endpoint hidup dan rahasia sudah ada; header permintaannya yang salah |
| `200` | Berjalan seperti seharusnya |

## Kalau jadwal terlihat "tidak jalan"

1. Endpoint menjawab 401/200 (bukan 404)? Kalau 404 → deploy belum jalan.
2. Lihat jejak di halaman konten:
   - `KIRIM_OTOMATIS` → berhasil dikirim sesuai jadwal.
   - `KIRIM_OTOMATIS_GAGAL` → cron jalan, platformnya menolak. Pesannya ada di situ.
   - `JADWAL_DIBATALKAN` → isinya bermasalah (tanpa berkas, atau jenis yang
     tidak didukung platform). Perbaiki lalu jadwalkan ulang.
   - Tidak ada jejak apa pun → cron-nya belum terpanggil.
3. Ingat jadwalnya **sekali sehari**. Konten yang dijadwalkan pukul 09:00 WIB
   baru dijalankan pada pemanggilan berikutnya (08:00 WIB esok hari) kecuali
   endpoint dipanggil manual.

