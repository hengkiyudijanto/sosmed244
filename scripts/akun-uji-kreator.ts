/**
 * Membuat akun KREATOR uji supaya bisa menguji alur lintas pengguna
 * (kreator mengajukan -> penyetuju lain menyetujui) tanpa menyentuh akun bersama.
 *
 *   pnpm exec tsx scripts/akun-uji-kreator.ts buat
 *   pnpm exec tsx scripts/akun-uji-kreator.ts hapus
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL belum diset (sumberkan .env.local dulu).');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const EMAIL = 'uji-kreator@sosmed244.local';
const SANDI = 'UjiTema244!';

async function main() {
  if (process.argv[2] === 'hapus') {
    const ada = await prisma.pengguna.findUnique({
      where: { email: EMAIL },
      include: { _count: { select: { kontenDibuat: true, keputusan: true } } },
    });
    if (!ada) {
      console.log('Tidak ada akun uji kreator.');
      return;
    }
    // konten yang dibuatnya ikut dibersihkan supaya tidak meninggalkan sampah
    await prisma.sesi.deleteMany({ where: { penggunaId: ada.id } });
    const konten = await prisma.konten.findMany({
      where: { pembuatId: ada.id },
      select: { id: true },
    });
    for (const k of konten) {
      await prisma.keputusan.deleteMany({ where: { kontenId: k.id } });
      await prisma.media.deleteMany({ where: { kontenId: k.id } });
    }
    await prisma.konten.deleteMany({ where: { pembuatId: ada.id } });
    await prisma.pengguna.delete({ where: { id: ada.id } });
    console.log('Akun uji kreator + kontennya DIHAPUS:', EMAIL, `(${konten.length} konten)`);
    return;
  }

  const hash = await bcrypt.hash(SANDI, 12);
  const p = await prisma.pengguna.upsert({
    where: { email: EMAIL },
    update: { passwordHash: hash, aktif: true, harusGantiPassword: false },
    create: {
      email: EMAIL,
      nama: 'Uji Kreator',
      peran: 'KREATOR',
      passwordHash: hash,
      aktif: true,
      harusGantiPassword: false,
    },
  });
  console.log(`Akun uji kreator siap: ${p.email} / ${SANDI} (peran ${p.peran})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
