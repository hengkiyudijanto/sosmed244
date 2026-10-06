# Mengubah region fungsi Vercel (supaya cepat)

## Kondisi sekarang

| Bagian | Region | Arti |
|---|---|---|
| Permintaan masuk | `sin1` | Singapura — dekat dengan pengguna |
| **Eksekusi fungsi** | **`iad1`** | **Washington DC — jauh dari database** |
| Database Neon | `ap-southeast-1` | Singapura |

Setiap kali halaman dibuka, fungsi di Washington DC harus menanyai database di
Singapura. Bolak-balik menyeberangi Samudra Pasifik + Atlantik, dan itu terasa
sebagai aplikasi yang lambat.

Cara membacanya dari header respons:

```
x-vercel-id: sin1::iad1::...
              │      │
              │      └── region EKSEKUSI  ← yang perlu diubah
              └───────── region permintaan masuk (bukan ini)
```

Bagian **kedua** yang menentukan, bukan yang pertama.

## Cara mengubah (harus yang benar)

Pengaturan region ada di **dua tempat** yang berbeda, dan mengubah yang salah
tidak berpengaruh:

### ✅ Yang benar: Settings → Functions

1. Buka https://vercel.com/hengkyudjanto-4675s-projects/sosmed244/settings/functions
2. Cari bagian **Function Region** (biasanya di atas)
3. Ubah dari **Washington, D.C., USA (iad1)** → **Singapore (sin1)**
4. **Save**

### ❌ Yang tidak berpengaruh: Settings → General → Node.js Region

Opsi di halaman *General* itu untuk hal lain dan **tidak** memindahkan eksekusi
fungsi. Kalau sudah pernah mengubah di sana tapi header masih `iad1`, itu
sebabnya.

> Catatan: pada paket **Hobby**, pilihan region bisa terbatas. Kalau pilihan
> `sin1` tidak muncul, berarti paket Anda belum mengizinkannya — alternatifnya
> pindahkan database mendekat, atau terima kondisi sekarang (aplikasi tetap
> jalan, hanya terasa lambat).

## Setelah diubah: WAJIB redeploy

Sama seperti environment variable, perubahan region **tidak berlaku pada
deployment yang sudah jalan**. Setelah Save:

1. Tab **Deployments**
2. Pada deployment teratas yang berlabel **Production** → menu **⋯** → **Redeploy**

## Cara memastikan sudah pindah

```bash
curl -s -I -L https://sosmed244.vercel.app/masuk | grep -i x-vercel-id
```

Yang ditunggu: bagian **kedua** berubah menjadi `sin1`:

```
x-vercel-id: sin1::sin1::...
                    ↑ sudah benar (keduanya Singapura)
```

Selama masih `sin1::iad1::`, fungsinya masih di Amerika.

## Kenapa ini penting

Bukan sekadar soal rasa. Dua hal nyata:

1. **Setiap halaman** menanyai database beberapa kali (sesi, konten, hitungan
   status). Latensi menyeberang samudra berkali-kali dijumlahkan.
2. **Berkas media** nanti dikirim ke TikTok/Instagram dari server. Kalau
   fungsinya jauh dari tempat penyimpanan, unggahan berkas besar akan lambat dan
   berisiko timeout.

Kalau setelah pindah region masih terasa lambat, penyebab berikutnya adalah
Neon yang "tidur" saat tidak dipakai (cold start) — request pertama setelah
lama menganggur akan lambat, berikutnya normal.
