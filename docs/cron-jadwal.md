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

## Kalau butuh lebih sering dari sekali sehari — pakai penjadwal LUAR

Batas sekali-sehari itu milik **penjadwal Vercel**, bukan endpoint kita.
`/api/cron/jadwal` adalah HTTP biasa dan menjawab kapan saja asal header
`Authorization: Bearer <CRON_SECRET>` benar. Jadi jalan keluarnya: matikan
`crons` di `vercel.json`, lalu panggil endpoint-nya dari penjadwal di luar.

**Penting saat memindahkan penjadwal:** hapus entri `crons` dari `vercel.json`.
Kalau tidak, dua penjadwal (Vercel + luar) memanggil endpoint yang sama. Itu
tidak merusak data — penguncian `updateMany` menjamin satu konten tidak terkirim
dua kali — tetapi percuma dan membuat log sulit dibaca.

`scripts/cron-ping.sh` disediakan untuk ini:

```bash
./scripts/cron-ping.sh --cek        # pastikan endpoint hidup (harus 401 tanpa rahasia)
./scripts/cron-ping.sh              # panggil sekali, pakai ~/.sosmed-cron.env
./scripts/cron-ping.sh --rahasia    # ambil rahasia dari Vercel CLI dulu
```

Rahasia disimpan di `~/.sosmed-cron.env` (chmod 600, di luar repo) — **jangan**
ditulis ke dalam repo. Log ringkas ada di `~/.sosmed-cron.log` (tanpa rahasia).

### Opsi penjadwal luar (per Okt 2026)

| Opsi | Cadence | Catatan |
|---|---|---|
| **cron-job.org** | tiap menit | Gratis, tanpa kartu kredit. Tempel URL + header `Authorization` di UI-nya. |
| **GitHub Actions** | min. 5 menit | Gratis, tanpa akun baru. Sering telat saat jam sibuk; schedule bisa mati di repo yang tidak aktif 60 hari terhadap repo pribadi. |
| **crontab server ini** | tiap menit | Tidak ada pihak ke-3, tapi mati kalau VPS mati. |
| **Vercel Pro** | tiap menit | $20/bln; paling rapi, tanpa layanan luar. |

> Jangan pakai `*/N` dengan N di bawah 5 menit pada penjadwal luar: endpoint ini
> melakukan unggahan ke platform, dan memanggilnya berlebihan hanya membebani
> API Instagram.

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

