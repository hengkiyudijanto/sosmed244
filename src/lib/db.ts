import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma client singleton.
 *
 * Prisma 7 tidak lagi membaca `url` dari schema — koneksi diserahkan ke driver
 * adapter (@prisma/adapter-pg + `pg`). Tanpa adapter, instansiasi melempar error
 * yang TIDAK menyebut kata "adapter", jadi sulit dilacak.
 *
 * Di mode dev, hot-reload Next bisa membuat banyak instance; disimpan di
 * globalThis supaya tidak membuka koneksi baru tiap reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buat() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL belum diset. Salin .env.example ke .env.local lalu isi nilainya.'
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? buat();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
