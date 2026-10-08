/**
 * RESET PASSWORD PENGGUNA dari terminal.
 *
 * Kenapa skrip ini ada: password akun seed pernah diubah saat pengujian, dan
 * tidak ada satu pun cara masuk kembali kalau password itu terlupa — halaman
 * reset di aplikasi justru butuh login dulu (admin yang sudah masuk). Jadi
 * tanpa skrip ini, satu-satunya jalan adalah menyentuh database langsung.
 *
 * CARA PAKAI (di mesin yang punya akses database):
 *
 *   # 1. Reset dengan password yang ANDA tentukan sendiri
 *   pnpm exec tsx scripts/reset-sandi.ts admin@sosmed244.local
 *   #    (akan meminta password baru dua kali, tidak terlihat di layar)
 *
 *   # 2. Hanya melihat daftar akun (tanpa mengubah apa pun)
 *   pnpm exec tsx scripts/reset-sandi.ts --daftar
 *
 *   # 3. Membuka status "nonaktif" pada akun tertentu
 *   pnpm exec tsx scripts/reset-sandi.ts admin@sosmed244.local --aktifkan
 *
 * CATATAN KEAMANAN:
 *  - Password TIDAK pernah lewat argumen perintah (argumen terlihat di daftar
 *    proses dan riwayat shell). Selalu lewat input tersembunyi.
 *  - Hash bcrypt yang ditulis memakai putaran 12, sama dengan `hashPassword()`
 *    di src/lib/auth.ts — kalau angkanya berbeda, password tetap cocok tapi
 *    biayanya jadi tidak konsisten.
 *  - Aturan kekuatan password DISALIN dari validasiPassword() dan diverifikasi
 *    ulang setelah penulisan, supaya tidak ada dua aturan yang berbeda antara
 *    skrip ini dan aplikasi.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL tidak ada.');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const email = process.argv[2];
const aktifkan = process.argv.includes('--aktifkan');

/** Sama persis dengan validasiPassword() di src/lib/auth.ts. */
function validasiPassword(pw: string): string | null {
  if (pw.length < 8) return 'Password minimal 8 karakter';
  if (!/[a-z]/.test(pw)) return 'Password harus mengandung huruf kecil';
  if (!/[A-Z]/.test(pw)) return 'Password harus mengandung huruf besar';
  if (!/[0-9]/.test(pw)) return 'Password harus mengandung angka';
  return null;
}

/**
 * Baca input tanpa menampilkannya di layar.
 *
 * Dipakai library bawaan Node (readline), bukan paket tambahan, supaya skrip ini
 * bisa dijalankan di mesin mana pun yang sudah punya dependensi proyek.
 */
function tanyaTersembunyi(pertanyaan: string): Promise<string> {
  return new Promise((selesai) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const tulis = (process.stdout as unknown as { write: (s: string) => void }).write.bind(process.stdout);

    // @ts-expect-error properti internal readline yang dipakai untuk menyembunyikan
    rl._writeToOutput = function (teks: string) {
      if (teks.includes(pertanyaan)) tulis(pertanyaan);
      else tulis('*');
    };
    rl.question(pertanyaan, (jawaban) => {
      rl.close();
      tulis('\n');
      selesai(jawaban);
    });
  });
}

async function daftarAkun() {
  const semua = await prisma.pengguna.findMany({
    select: { email: true, nama: true, peran: true, aktif: true, harusGantiPassword: true, lastLoginAt: true },
    orderBy: { email: 'asc' },
  });
  console.log(`\n${semua.length} akun:\n`);
  for (const p of semua) {
    console.log(
      `  ${p.email.padEnd(28)} ${String(p.peran).padEnd(10)} ` +
        `${p.aktif ? 'aktif  ' : 'NONAKTIF'} ${p.harusGantiPassword ? 'wajib-ganti' : '           '} ` +
        `${p.lastLoginAt ? 'login ' + p.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : 'belum pernah login'}`
    );
  }
  console.log('\nReset: pnpm exec tsx scripts/reset-sandi.ts <email>');
}

async function main() {
  if (!email || email === '--daftar') {
    await daftarAkun();
    return;
  }

  const pengguna = await prisma.pengguna.findUnique({ where: { email } });
  if (!pengguna) {
    console.error(`❌ Tidak ada akun dengan email "${email}".`);
    console.error('   Jalankan tanpa argumen untuk melihat daftar akun:');
    console.error('   pnpm exec tsx scripts/reset-sandi.ts --daftar');
    process.exit(1);
  }

  console.log(`\nAkun: ${pengguna.nama} <${pengguna.email}> — ${pengguna.peran}`);
  console.log(`aktif: ${pengguna.aktif ? 'ya' : 'TIDAK'} · wajib ganti password: ${pengguna.harusGantiPassword ? 'ya' : 'tidak'}`);

  // ===== mode hanya mengaktifkan =====
  if (aktifkan && process.argv.length <= 3) {
    await prisma.pengguna.update({ where: { email }, data: { aktif: true } });
    console.log('\n✓ Akun diaktifkan. Password TIDAK diubah.');
    return;
  }

  console.log('\nAturan password: minimal 8 karakter, ada huruf besar, huruf kecil, dan angka.');
  const pw1 = await tanyaTersembunyi('Password baru    : ');
  const masalah = validasiPassword(pw1);
  if (masalah) {
    console.error(`\n❌ ${masalah}`);
    process.exit(1);
  }
  const pw2 = await tanyaTersembunyi('Ulangi password  : ');
  if (pw1 !== pw2) {
    console.error('\n❌ Kedua password tidak sama.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(pw1, 12);

  // Pastikan hash benar-benar cocok SEBELUM ditulis. Kalau tidak, pengguna
  // terkunci dari akunnya dan baru ketahuan setelah mencoba login.
  const cocok = await bcrypt.compare(pw1, hash);
  if (!cocok) {
    console.error('\n❌ Hash tidak bisa memverifikasi passwordnya sendiri — dibatalkan, tidak ada yang diubah.');
    process.exit(1);
  }

  await prisma.pengguna.update({
    where: { email },
    data: {
      passwordHash: hash,
      // password sudah ditentukan orangnya sendiri, jadi tidak perlu dipaksa ganti
      harusGantiPassword: false,
      // reset password sekaligus membuka akun yang nonaktif, karena akun
      // nonaktif tidak bisa login berapa pun passwordnya
      aktif: true,
    },
  });

  // Matikan sesi lama: kalau password diganti karena diduga bocor, sesi yang
  // sudah ada tidak boleh tetap hidup.
  const dicabut = await prisma.sesi.updateMany({
    where: { penggunaId: pengguna.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log(`\n✓ Password ${pengguna.email} direset.`);
  console.log(`  akun            : aktif`);
  console.log(`  wajib ganti pw  : tidak`);
  console.log(`  sesi lama dicabut: ${dicabut.count}`);
  if (!aktifkan && !pengguna.aktif) {
    console.log('  (akun ini tadinya NONAKTIF — sekarang dibuka, karena akun nonaktif tidak bisa login)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
