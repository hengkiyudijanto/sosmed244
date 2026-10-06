/**
 * Diagnosa database: apakah migrasi sudah diterapkan dan apakah ada akun.
 *
 * Dipakai untuk memastikan keadaan database yang SAMA dengan yang dipakai
 * aplikasi produksi (bukan database lain).
 *
 * Jalankan: pnpm exec tsx scripts/diagnosa-db.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL tidak ada.');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const url = new URL(connectionString!);
  console.log('=== KONEKSI ===');
  console.log('host     :', url.hostname);
  console.log('database :', url.pathname.replace(/^\//, ''));

  // 1. tabel ada?
  const tabel = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  const nama = tabel.map((t) => t.tablename);
  console.log('\n=== TABEL ===');
  console.log(nama.length ? nama.join(', ') : '(KOSONG — migrasi belum dijalankan)');

  // 2. migrasi tercatat?
  const migrasi = nama.includes('_prisma_migrations')
    ? await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
        SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at
      `
    : [];
  console.log('\n=== MIGRASI TERCATAT ===');
  if (migrasi.length === 0) {
    console.log('(belum ada migrasi diterapkan)');
  } else {
    for (const m of migrasi) {
      console.log(`  ${m.finished_at ? '✓' : '…'} ${m.migration_name}`);
    }
  }

  // 3. ada akun?
  if (nama.includes('Pengguna')) {
    const jumlah = await prisma.pengguna.count();
    console.log('\n=== AKUN ===');
    if (jumlah === 0) {
      console.log('(KOSONG — belum di-seed, tidak ada yang bisa login)');
    } else {
      const daftar = await prisma.pengguna.findMany({
        select: { email: true, nama: true, peran: true, aktif: true, harusGantiPassword: true },
        orderBy: { peran: 'asc' },
      });
      for (const p of daftar) {
        console.log(
          `  ${p.peran.padEnd(9)} ${p.email.padEnd(30)} ${p.nama}` +
            `${p.harusGantiPassword ? ' [wajib ganti pw]' : ''}${p.aktif ? '' : ' [NONAKTIF]'}`
        );
      }
    }
  }

  // 4. isi konten
  if (nama.includes('Konten')) {
    const konten = await prisma.konten.count();
    console.log('\n=== KONTEN ===');
    console.log(`  jumlah: ${konten}`);
  }

  console.log('\n=== KESIMPULAN ===');
  if (nama.length === 0) {
    console.log('  → Migrasi BELUM dijalankan. Jalankan: pnpm exec prisma migrate deploy');
  } else if (nama.includes('Pengguna') && (await prisma.pengguna.count()) === 0) {
    console.log('  → Skema sudah ada, tetapi BELUM ADA AKUN. Jalankan seed.');
  } else {
    console.log('  → Database siap dipakai.');
  }
}

main()
  .catch((e) => {
    console.error('GAGAL:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
