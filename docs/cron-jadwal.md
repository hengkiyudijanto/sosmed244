# Menyalakan pengiriman terjadwal (CRON_SECRET + cron Vercel)

Kode worker-nya sudah ada dan teruji, tetapi **tidak akan jalan sendiri** sebelum
dua hal di bawah diselesaikan di dashboard Vercel. Endpoint sengaja MENOLAK
semua permintaan selama `CRON_SECRET` belum diisi — endpoint yang mengirim
konten ke platform tidak boleh bisa dipicu siapa pun yang tahu alamatnya.

## 1. Isi CRON_SECRET (WAJIB)

1. Buka https://vercel.com/hengkyudjanto-4675s-projects/sosmed244/settings/environment-variables
2. **Add New** → Name: `CRON_SECRET`
3. Value: string acak yang panjang. Buat di server dengan:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

4. Environment: centang **Production** (dan Preview kalau mau dicoba di sana)
5. **Save**

Vercel otomatis mengirim header `Authorization: Bearer <CRON_SECRET>` pada setiap
pemanggilan cron, jadi nilai ini tidak perlu ditempel ke mana pun lagi.

## 2. Pastikan cron terdaftar

Berkas `vercel.json` di repo sudah berisi:

```json
{
  "crons": [
    { "path": "/api/cron/jadwal", "schedule": "*/5 * * * *" }
  ]
}
```

Artinya: setiap 5 menit. Setelah deploy, daftar cron bisa dilihat di
https://vercel.com/hengkyudjanto-4675s-projects/sosmed244/cron-jobs
(kalau menu ini tidak muncul, paket Vercel-nya belum mengizinkan cron).

## 3. Deploy ulang

Sama seperti environment variable lain: **perubahan baru berlaku setelah
redeploy.** Tab Deployments → deployment Production teratas → **⋯** → **Redeploy**.

## Cara memastikan sudah hidup

```bash
# 1) tanpa rahasia -> harus DITOLAK (401/503), bukan 200
curl -s -o /dev/null -w "%{http_code}\n" https://sosmed244.vercel.app/api/cron/jadwal

# 2) dengan rahasia benar -> 200 dan melaporkan berapa konten dipertimbangkan
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  https://sosmed244.vercel.app/api/cron/jadwal
```

Perhatikan juga: kalau CRON_SECRET **belum** diisi, jawabannya `503` dengan pesan
yang menyebut variabel itu — itu tanda endpoint hidup tetapi sengaja menolak,
bukan tanda cron-nya rusak.

## Kalau jadwal terlihat "tidak jalan"

Periksa berurutan:

1. **Kode terbaru sudah ter-deploy?** Rute `/api/cron/jadwal` harus menjawab
   (401/503 kalau tanpa rahasia). Kalau 404, deployment-nya belum jalan.
2. **CRON_SECRET sudah diisi dan sudah di-redeploy?** Lihat bagian 1 dan 3.
3. **Isi jadwalnya sendiri.** Lihat jejak di halaman konten: kalau ada
   `KIRIM_OTOMATIS_GAGAL`, berarti cron jalan tetapi platformnya menolak —
   pesannya ada di situ. Kalau tidak ada jejak apa pun, cron-nya belum jalan.
4. **Konten yang tidak lengkap dibatalkan, bukan dicoba ulang.** Kalau jejaknya
   `JADWAL_DIBATALKAN`, isinya yang bermasalah (mis. tanpa berkas, atau story
   ke TikTok) — perbaiki lalu jadwalkan ulang.
