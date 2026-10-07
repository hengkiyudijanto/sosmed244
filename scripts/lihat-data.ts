/**
 * Inspeksi keadaan data — untuk memastikan apa yang benar-benar tersimpan,
 * bukan hanya apa yang tampak di layar.
 *
 * Jalankan: pnpm exec tsx scripts/lihat-data.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });

async function main() {
  const pengguna = await prisma.pengguna.findMany({
    select: { email: true, nama: true, peran: true, aktif: true, harusGantiPassword: true },
    orderBy: { peran: 'asc' },
  });
  console.log(`=== PENGGUNA (${pengguna.length}) ===`);
  for (const p of pengguna) {
    console.log(`  ${p.peran.padEnd(9)} ${p.email.padEnd(30)} ${p.nama}${p.harusGantiPassword ? ' [wajib ganti pw]' : ''}`);
  }

  const konten = await prisma.konten.findMany({
    select: {
      judul: true,
      status: true,
      jenis: true,
      jenisPosting: true,
      tujuan: true,
      jumlahRevisi: true,
      hasilKirim: true,
      pembuat: { select: { nama: true } },
      penyetuju: { select: { nama: true } },
      _count: { select: { keputusan: true, media: true } },
      media: { select: { byte: true }, orderBy: { urutan: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\n=== KONTEN (${konten.length}) ===`);
  for (const k of konten) {
    const hasil = k.hasilKirim ? JSON.stringify(k.hasilKirim).slice(0, 40) + '…' : '';
    const total = k.media.reduce((a, m) => a + m.byte, 0);
    console.log(
      `  [${k.status.padEnd(10)}] ${k.jenisPosting.padEnd(9)} ${k.judul.slice(0, 34).padEnd(36)}` +
        ` ${String(k._count.media).padStart(2)} berkas ${String(total).padStart(7)}B` +
        ` rev=${k.jumlahRevisi} jejak=${k._count.keputusan} penyetuju=${k.penyetuju?.nama ?? '—'} ${hasil}`
    );
  }

  const audit = await prisma.auditLog.findMany({
    select: { aksi: true, entitas: true, createdAt: true, pengguna: { select: { nama: true } } },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  console.log(`\n=== AUDIT TERAKHIR ===`);
  for (const a of audit) {
    console.log(`  ${a.createdAt.toISOString().slice(11, 19)} ${a.aksi.padEnd(18)} ${a.entitas ?? ''} oleh ${a.pengguna?.nama ?? '(tidak dikenal)'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
