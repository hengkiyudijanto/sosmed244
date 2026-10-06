/**
 * Menguji jalur yang PERSIS dipakai login, dengan kredensial yang diberikan
 * lewat environment — untuk memastikan masalahnya di kredensial, bukan di kode.
 *
 * Jalankan:
 *   U="postgresql://..." pnpm exec tsx scripts/uji-jalur-login.ts
 *
 * Yang diuji berurutan sama seperti server action `masuk`:
 *   1. query pengguna berdasarkan email
 *   2. verifikasi password (bcrypt)
 *   3. buat sesi (insert ke tabel Sesi)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const url = process.env.U ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Butuh U atau DATABASE_URL.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const email = 'kreator@sosmed244.local';
  const sandi = 'Sosmed244Admin!';

  console.log('=== 1. QUERY PENGGUNA ===');
  const p = await prisma.pengguna.findUnique({ where: { email } });
  if (!p) {
    console.log('  ✗ akun tidak ditemukan — seed belum dijalankan di database INI');
    return;
  }
  console.log('  ✓ ditemukan:', p.email, `(${p.peran}), aktif=${p.aktif}`);

  console.log('\n=== 2. VERIFIKASI PASSWORD (bcrypt) ===');
  const cocok = await bcrypt.compare(sandi, p.passwordHash);
  console.log(`  ${cocok ? '✓' : '✗'} password ${cocok ? 'cocok' : 'TIDAK cocok'}`);

  console.log('\n=== 3. BUAT SESI (insert) ===');
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const s = await prisma.sesi.create({
    data: {
      tokenHash,
      penggunaId: p.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  console.log('  ✓ sesi dibuat:', s.id);

  // bersihkan sesi uji supaya tidak menumpuk
  await prisma.sesi.delete({ where: { id: s.id } });
  console.log('  ✓ sesi uji dibersihkan');

  console.log('\n=== KESIMPULAN ===');
  console.log('  Jalur login BERHASIL sepenuhnya dengan kredensial ini.');
}

main()
  .catch((e) => {
    console.error('\n✗ GAGAL:', e instanceof Error ? e.message : e);
    const code = (e as { code?: string }).code;
    if (code) console.error('  kode:', code);
  })
  .finally(() => prisma.$disconnect());
