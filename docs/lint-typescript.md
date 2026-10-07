# Lint: kenapa TypeScript ada dua di `package.json`

Kalau kamu membuka `package.json` dan bingung kenapa `typescript` diarahkan ke
paket lain, ini penjelasannya.

```json
"typescript":         "npm:@typescript/typescript6@^6.0.2",   // untuk tools
"@typescript/native": "npm:typescript@^7.0.2",                // `tsc` = 7
```

## Penyebabnya

`pnpm lint` dulu **gagal total** tanpa memeriksa satu baris pun:

```
Error: typescript-eslint does not support TS 7.0.
```

`eslint-config-next` membawa `typescript-eslint`, dan versi itu mensyaratkan
`typescript >=4.8.4 <6.1.0`. Proyek ini memakai TypeScript 7.0.2 — versi stabil
terbaru — sehingga tidak ada versi `typescript-eslint` yang cocok. Menaikkan
dependensi bukan jalan keluar.

## Jalan keluarnya

TypeScript 7 belum punya API compiler publik (7.1 baru akan punya). Selama itu,
tim TypeScript menyediakan paket kompatibilitas `@typescript/typescript6` supaya
tooling yang butuh API compiler tetap jalan **berdampingan**:

- `pnpm exec tsc` → **TypeScript 7.0.2** (cepat, yang dipakai build)
- ESLint / typescript-eslint → membaca kode lewat API **6.0.2**

Tidak ada yang diturunkan, tidak ada aturan yang hilang. Cek sendiri:

```bash
pnpm exec tsc --version                          # 7.0.2
node -e "console.log(require('./node_modules/typescript/package.json').version)"  # 6.0.2
```

## Yang perlu diketahui

- **`npm run lint` sekarang memeriksa JavaScript murni** (aturan dasar ESLint:
  `no-var`, `prefer-const`, `eqeqeq`, variabel tak terpakai) plus membaca berkas
  TypeScript dengan parser yang benar. Aturan khusus TypeScript dari
  `typescript-eslint` belum aktif.
- **Di berkas `.ts`/`.tsx`, `no-undef` dan `no-unused-vars` sengaja dimatikan.**
  Aturan itu tidak memahami tipe: `LayoutProps` (tipe global buatan Next saat
  build) dan `React` (dari JSX transform baru) dilaporkan sebagai "tidak dikenal"
  padahal sah. Pemeriksaan nama yang sesungguhnya dilakukan TypeScript.
- **Aturan `@next/next/*` tidak aktif.** Plugin Next didaftarkan agar komentar
  `eslint-disable` yang lama tetap sah, tapi aturannya tidak dijalankan.
  Komentar-komentar usang itu sudah dihapus.
- **Pemeriksaan tipe tetap lengkap**: `pnpm exec tsc --noEmit`, dan Next
  menjalankannya otomatis saat `pnpm build`. Jadi kesalahan tipe tetap
  tertangkap sebelum deploy — yang hilang hanya *gaya* pemeriksaan lint.

## Kapan disederhanakan

Begitu `typescript-eslint` mengumumkan dukungan TypeScript 7:

1. Hapus dua alias di `package.json`, kembalikan `"typescript": "^7.0.2"`.
2. Di `eslint.config.mjs`, pakai `...next` kembali dan hapus bagian plugin manual.
3. Jalankan `pnpm lint` — aturan Next dan TypeScript akan aktif kembali.
