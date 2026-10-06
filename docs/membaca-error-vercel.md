# Cara membaca pesan error asli di Vercel

Error `ERROR 1294040240` di halaman **sengaja tidak menampilkan detail** ke
pengguna — itu perilaku benar (jangan bocorkan jejak server ke publik), tetapi
membuat diagnosa jadi sulit. Pesan sebenarnya **selalu ada di log deployment**.

## Ambil log (di dashboard Vercel)

1. Buka https://vercel.com/dashboard → project **sosmed244**
2. Tab **Logs** (atau **Deployments** → pilih deployment terakhir → **Functions**)
3. Coba login sekali lagi di aplikasi, lalu **muat ulang halaman Logs**
4. Cari baris berwarna merah di sekitar waktu percobaan login itu

Yang dicari: baris yang memuat salah satu dari ini.

| Pesan di log | Artinya | Perbaikan |
|---|---|---|
| `DATABASE_URL belum diset` | env tidak terbaca | isi env, lalu **redeploy** |
| `password authentication failed` (28P01) | kredensial sudah tidak berlaku | ganti dengan nilai di `.env.vercel.txt`, lalu redeploy |
| `Can't reach database server` (P1001) | host salah / pooler tidak ada | pakai host langsung (tanpa `-pooler`) |
| `ENOTFOUND` | host tidak resolve | nama host salah ketik |
| `The table 'public.Pengguna' does not exist` | migrasi belum dijalankan di DB ini | `pnpm exec prisma migrate deploy` |

## Sebab paling sering: env diubah tapi TIDAK redeploy

Vercel **tidak** menerapkan environment variable baru ke deployment yang sudah
jalan. Setelah mengubah/ menambah env:

> **Deployments → deployment terakhir → menu ⋯ → Redeploy** (centang *Use existing build cache* boleh dikosongkan)

Kalau tidak di-redeploy, aplikasi masih memakai nilai lama — gejalanya persis
seperti "env sudah saya perbaiki tapi masih error".

## Cek cepat dari luar

```bash
# halaman render = tidak menyentuh database
curl -s -o /dev/null -w "%{http_code}\n" https://sosmed244.vercel.app/masuk   # harus 200

# server action (login) = menyentuh database; 500 di sini berarti masalah DB
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://sosmed244.vercel.app/masuk \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=uji@uji.local&password=salah"
```

Pembeda ini penting: **200 pada halaman + 500 pada login = masalah database**,
bukan masalah build.

## Memastikan nilai env yang benar

Nilai yang sudah diuji bisa connect ada di server ini:

```
~/projects/sosmed244/.env.vercel.txt
```

Isinya `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEXT_PUBLIC_APP_URL`. Berkasnya
mode 600 dan terabaikan git.

**Catatan penting:** project Neon ini **tidak punya host pooler** —
`ep-...-pooler.aws.neon.tech` menjawab `ENOTFOUND`. Jadi jangan pakai varian
"Pooled connection" dari Neon Console di sini; pakai koneksi langsung untuk
kedua variabel.

## Cara memastikan deploy sudah membawa env baru

Setelah redeploy, uji lagi dengan `curl` di atas. Kalau login mengembalikan 200
(walaupun dengan pesan "Email atau password salah"), berarti **database sudah
terhubung** dan yang tersisa hanya urusan kredensial akun — bukan lagi masalah
infrastruktur.

Pesan "Email atau password salah" itu **hasil yang bagus** di tahap ini: artinya
query ke database berhasil dan aplikasi berjalan normal.
