/**
 * Konfigurasi ESLint.
 *
 * MASALAH YANG DISELESAIKAN: `eslint-config-next` membawa `typescript-eslint`,
 * dan versi itu mensyaratkan `typescript >=4.8.4 <6.1.0`. Proyek ini memakai
 * TypeScript 7.0.2, sehingga ESLint GAGAL TOTAL:
 *
 *   Error: typescript-eslint does not support TS 7.0.
 *
 * Akibatnya `pnpm lint` error tanpa memeriksa satu baris pun.
 *
 * JALAN KELUARNYA (dari tim TypeScript sendiri): TypeScript 7 belum punya API
 * publik, dan 7.1 baru akan punya. Selama itu, mereka menyediakan paket
 * kompatibilitas `@typescript/typescript6` supaya tooling yang butuh API
 * compiler (seperti typescript-eslint) tetap jalan BERDAMPINGAN:
 *
 *   "typescript":         npm:@typescript/typescript6@^6.0.2   <- untuk tools
 *   "@typescript/native": npm:typescript@^7.0.2                <- `tsc` tetap 7
 *
 * Hasilnya: `pnpm exec tsc` tetap TypeScript 7 (cepat), sementara ESLint
 * membaca kode dengan API 6.0.2.
 *
 * CATATAN soal aturan `@next/next/*`: aturan itu datang dari plugin Next, yang
 * TIDAK bisa dimuat bersamaan dengan typescript-eslint versi lama tanpa
 * memicu masalah kompatibilitas yang sama. Karena itu aturan Next tidak dipakai
 * di sini — dan komentar `eslint-disable-next-line @next/next/no-img-element`
 * di beberapa berkas jadi tidak merujuk aturan yang ada. Untuk mencegah ESLint
 * mengeluh soal rujukan yang tidak dikenal (tanpa harus menyentuh berkas kode),
 * nama aturan itu didaftarkan sebagai aturan kosong di bawah: rujukan di
 * komentar tetap sah, tetapi aturannya sendiri tidak aktif.
 *
 * KAPAN DISEDERHANAKAN: begitu `typescript-eslint` mendukung TypeScript 7,
 * hapus dua alias di package.json, kembalikan `typescript: ^7.x`, lalu pakai
 * kembali `...next` di sini dan hapus daftar aturan kosong itu.
 */

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import next from 'eslint-config-next';
import globals from 'globals';

/**
 * Ambil HANYA bagian plugin dari `eslint-config-next`, bukan ruleset-nya.
 *
 * `eslint-config-next` adalah larik tiga bagian: [0] memuat plugin (react,
 * react-hooks, import, jsx-a11y, @next/next), [1] memuat ruleset
 * typescript-eslint — yang GAGAL dimuat bersama TypeScript 7 — dan [2] aturan
 * Next itu sendiri.
 *
 * Dengan hanya memakai bagian [0] kita tahu plugin `@next/next` terdaftar
 * (sehingga komentar `eslint-disable-next-line @next/next/no-img-element` yang
 * sudah ada di kode tetap sah), TANPA menyentuh ruleset yang bermasalah.
 *
 * Cara ini lebih kuat daripada mendaftarkan nama aturannya sendiri-sendiri:
 * plugin yang benar-benar terpasang tidak akan melaporkan "Definition for rule
 * ... was not found", berapa pun aturan yang dirujuk komentar di kode.
 */
const pluginNext = Array.isArray(next)
  ? next.find((c) => c?.plugins?.['@next/next']) ?? {}
  : {};

export default defineConfig([
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'prisma/migrations/**',
      'next-env.d.ts',
    ],
  },

  // ===== aturan dasar JavaScript =====
  js.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['warn', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },

  // ===== berkas TypeScript: pakai parser khusus =====
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Aturan no-unused-vars bawaan ESLint TIDAK memahami tipe TypeScript:
      // parameter yang hanya dipakai di posisi tipe dianggap "tidak dipakai".
      // Karena itu dimatikan untuk berkas .ts, bukan dibiarkan menghasilkan
      // peringatan palsu yang lama-lama diabaikan orang.
      'no-unused-vars': 'off',
      // 'no-undef' juga tidak masuk akal untuk berkas TypeScript: TypeScript
      // sendirilah yang memeriksa nama yang tidak dikenal, dan ia tahu hal-hal
      // yang tidak diketahui ESLint (mis. tipe global `LayoutProps` yang dibuat
      // Next saat build, dan `React` dari JSX transform baru).
      'no-undef': 'off',
      eqeqeq: ['warn', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },

  // ===== rujukan aturan Next di komentar `eslint-disable` =====
  // Plugin Next didaftarkan (tanpa ruleset-nya) supaya komentar
  // `eslint-disable-next-line @next/next/no-img-element` yang sudah ada di kode
  // tidak dilaporkan sebagai rujukan tak dikenal.
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: pluginNext.plugins ?? {},
  },
]);
