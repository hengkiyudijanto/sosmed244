import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Konfigurasi vitest.
 *
 * Alias '@/' WAJIB ada di sini: test mengimpor modul lewat alias yang sama
 * dengan kode aplikasi. Tanpa ini, test gagal dengan "Cannot find package
 * '@/lib/...'" — dan itu terlihat seperti kode yang salah, padahal cuma
 * konfigurasi test.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
