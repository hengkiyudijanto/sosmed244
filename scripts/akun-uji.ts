/**
 * Membuat akun UJI SEMENTARA untuk memeriksa tampilan (tema).
 *
 * Kenapa: memeriksa halaman dalam aplikasi menuntut login, sedangkan password
 * akun seed sudah tidak diketahui dan akun bersama itu TIDAK boleh disentuh.
 * Skrip ini membuat akun terpisah berperan ADMIN supaya semua halaman bisa
 * dibuka, lalu bisa dihapus lagi kapan saja.
 *
 * Jalankan (kredensial dari .env.local):
 *   set -a && . ./.env.local && set +a && pnpm exec tsx scripts/akun-uji.ts buat
 *   set -a && . ./.env.local && set +a && pnpm exec tsx scripts/akun-uji.ts hapus
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
const EMAIL = 'uji-tema@sosmed244.local';
const NAMA = 'Akun Uji Tema';
const SANDI = 'UjiTema244!';

async function main() {
  const aksi = process.argv[2];

  if (aksi === 'hapus') {
    const ada = await prisma.pengguna.findUnique({ where: { email: EMAIL } });
    if (!ada) {
      console.log('Tidak ada akun uji — tidak ada yang dihapus.');
      return;
    }
    // hapus sesi + akun (belum punya konten/keputusan, jadi aman dihapus)
    await prisma.sesi.deleteMany({ where: { penggunaId: ada.id } });
    await prisma.pengguna.delete({ where: { id: ada.id } });
    console.log('Akun uji DIHAPUS:', EMAIL);
    return;
  }

  const hash = await bcrypt.hash(SANDI, 12);
  const p = await prisma.pengguna.upsert({
    where: { email: EMAIL },
    update: { passwordHash: hash, aktif: true, harusGantiPassword: false },
    create: {
      email: EMAIL,
      nama: NAMA,
      peran: 'ADMIN',
      passwordHash: hash,
      aktif: true,
      harusGantiPassword: false,
    },
  });
  console.log(`Akun uji siap: ${p.email} / ${SANDI} (peran ${p.peran})`);
  console.log('Hapus lagi setelah selesai: pnpm exec tsx scripts/akun-uji.ts hapus');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
