import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Konfigurasi Prisma 7.
 *
 * Sejak Prisma 7, URL koneksi TIDAK lagi ditulis di schema.prisma — dipindahkan
 * ke sini untuk Migrate, dan ke `adapter` di PrismaClient saat runtime.
 * (Kalau keduanya lupa, error-nya tidak menyebut kata "adapter".)
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
