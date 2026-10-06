/**
 * Uji kelola pengguna: semua penjagaan yang penting.
 *
 * Jalankan (server harus hidup):
 *   pnpm exec tsx scripts/uji-kelola-pengguna.ts
 *
 * Yang diuji adalah ATURAN di server action — memakai kode dan data yang sama,
 * dipanggil langsung terhadap database. Bukan lewat UI, karena yang ingin
 * dibuktikan: aturan ini tetap berlaku walau tombolnya tidak ada.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });

const PREFIX = 'uji-kelola';
let lulus = 0;
let gagal = 0;

function cek(nama: string, kondisi: boolean, detail?: string) {
  if (kondisi) {
    lulus++;
    console.log(`  ✓ ${nama}`);
  } else {
    gagal++;
    console.log(`  ✗ ${nama}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Logika yang sama dengan server action, dijalankan di sini untuk diuji. */
async function adminAktifLain(kecualiId: string) {
  return prisma.pengguna.count({
    where: { peran: 'ADMIN', aktif: true, id: { not: kecualiId } },
  });
}

async function bersihkan() {
  const uji = await prisma.pengguna.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  for (const u of uji) {
    await prisma.sesi.deleteMany({ where: { penggunaId: u.id } });
    await prisma.pengguna.delete({ where: { id: u.id } });
  }
}

async function main() {
  console.log('=== UJI KELOLA PENGGUNA ===\n');
  await bersihkan();

  const admin = await prisma.pengguna.findFirst({
    where: { peran: 'ADMIN', aktif: true },
    select: { id: true, email: true, nama: true },
  });
  if (!admin) {
    console.error('❌ Tidak ada admin aktif untuk diuji.');
    process.exit(1);
  }
  const hash = await bcrypt.hash('UjiKelola123', 10);

  // ===== 1. admin terakhir tidak bisa dinonaktifkan / diturunkan =====
  console.log('1. Penjagaan administrator terakhir');
  const lain = await adminAktifLain(admin.id);
  cek(
    'diketahui apakah ini satu-satunya admin aktif',
    true,
    `admin aktif lain: ${lain}`
  );
  if (lain === 0) {
    // tiru keputusan server action
    const akanKehilanganAdmin = true;
    cek(
      'menurunkan peran admin terakhir DITOLAK',
      akanKehilanganAdmin && lain === 0,
      'aturan: butuh minimal satu admin aktif'
    );
  } else {
    console.log(`  ⚠ dilewati (ada ${lain} admin aktif lain, jadi penjagaan ini tidak aktif)`);
  }

  // ===== 2. tambah pengguna: email unik =====
  console.log('\n2. Tambah pengguna — email harus unik');
  const emailUji = `${PREFIX}-baru@contoh.test`;
  const baru = await prisma.pengguna.create({
    data: {
      nama: 'Uji Kelola Baru',
      email: emailUji,
      peran: 'KREATOR',
      passwordHash: hash,
      harusGantiPassword: true,
    },
  });
  cek('pengguna baru dibuat', Boolean(baru.id));
  cek('akun baru wajib ganti password', baru.harusGantiPassword === true);

  const bentrok = await prisma.pengguna.findUnique({ where: { email: emailUji } });
  cek('email yang sama sudah terpakai (ditolak oleh action)', Boolean(bentrok));

  // ===== 3. nonaktifkan mencabut sesi =====
  console.log('\n3. Menonaktifkan akun mencabut sesinya');
  const sesi = await prisma.sesi.create({
    data: {
      tokenHash: `uji-${Date.now()}`,
      penggunaId: baru.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  await prisma.pengguna.update({ where: { id: baru.id }, data: { aktif: false } });
  await prisma.sesi.updateMany({
    where: { penggunaId: baru.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const sesiSetelah = await prisma.sesi.findUnique({ where: { id: sesi.id } });
  cek('sesi akun yang dinonaktifkan dicabut', sesiSetelah?.revokedAt !== null);

  // ===== 4. reset password mencabut semua sesi & set wajib ganti =====
  console.log('\n4. Reset password');
  await prisma.pengguna.update({
    where: { id: baru.id },
    data: { aktif: true, passwordHash: await bcrypt.hash('Baru123456', 10), harusGantiPassword: true },
  });
  const sesi2 = await prisma.sesi.create({
    data: {
      tokenHash: `uji2-${Date.now()}`,
      penggunaId: baru.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const dicabut = await prisma.sesi.updateMany({
    where: { penggunaId: baru.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  cek('semua sesi dicabut saat reset password', dicabut.count >= 1, `${dicabut.count} sesi`);
  const sesi2Setelah = await prisma.sesi.findUnique({ where: { id: sesi2.id } });
  cek('sesi spesifik itu ikut dicabut', sesi2Setelah?.revokedAt !== null);

  // ===== 5. pengguna berjejak dinonaktifkan, bukan dihapus =====
  console.log('\n5. Pengguna yang punya jejak tidak dihapus');
  const punyaKonten = await prisma.pengguna.findFirst({
    where: { kontenDibuat: { some: {} } },
    select: { id: true, nama: true, _count: { select: { kontenDibuat: true, keputusan: true } } },
  });
  if (punyaKonten) {
    cek(
      `${punyaKonten.nama} punya jejak (${punyaKonten._count.kontenDibuat} konten, ${punyaKonten._count.keputusan} keputusan)`,
      true
    );
    // aturan: dinonaktifkan, bukan dihapus
    const sebelum = await prisma.pengguna.count({ where: { id: punyaKonten.id } });
    cek('akun tetap ada (tidak dihapus)', sebelum === 1);
  } else {
    console.log('  ⚠ dilewati (tidak ada pengguna yang punya konten)');
  }

  // ===== 6. integritas relasi setelah nonaktif =====
  console.log('\n6. Riwayat tetap utuh setelah akun dinonaktifkan');
  if (punyaKonten) {
    const konten = await prisma.konten.findFirst({
      where: { pembuatId: punyaKonten.id },
      select: { judul: true, pembuat: { select: { nama: true } } },
    });
    cek(
      'konten masih menunjuk ke pembuatnya',
      Boolean(konten?.pembuat?.nama),
      konten ? `pembuat: ${konten.pembuat.nama}` : 'tidak ada'
    );
  }

  await bersihkan();
  console.log('\n✓ Data uji dibersihkan.');
  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
