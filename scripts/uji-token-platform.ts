/**
 * UJI PEMBARUAN TOKEN — terhadap database sungguhan, lewat endpoint cron.
 *
 * Yang diperiksa bukan koneksi ke Meta/TikTok (itu butuh kredensial nyata),
 * melainkan hal-hal yang kalau salah akan membuat token MATI tanpa bisa
 * dipulihkan:
 *
 *  1. Token yang ditempel manual (tanpa info masa berlaku) TIDAK diperbarui
 *     otomatis — memperbarui tanpa tahu sisa waktunya bisa membuang token yang
 *     masih panjang umurnya, dan pada TikTok refresh token lama langsung mati.
 *  2. Token yang masa berlakunya masih jauh TIDAK diperbarui.
 *  3. Endpoint cron melaporkan alasan tiap platform secara terbuka.
 *  4. Token di database MENANG atas token di berkas saat mengirim.
 *
 * Jalankan (server hidup di :3100): pnpm exec tsx scripts/uji-token-platform.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { perbaruiTokenYangPerlu, bacaKredensial } from '../src/lib/konten/token-platform.js';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });

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

const HARI = 24 * 60 * 60 * 1000;

/** Bersihkan hanya baris yang dibuat uji ini (id diawali 'uji-'). */
async function bersihkan() {
  await prisma.tokenPlatform.deleteMany({ where: { id: { startsWith: 'uji-' } } });
}

async function main() {
  console.log('=== UJI PEMBARUAN TOKEN PLATFORM ===\n');
  await bersihkan();

  // ===== 1. Belum ada kredensial sama sekali =====
  console.log('1. Keadaan tanpa kredensial tersimpan');
  const awal = await perbaruiTokenYangPerlu();
  cek('kedua platform dilaporkan', awal.length === 2, `${awal.length}`);
  for (const h of awal) {
    cek(
      `${h.platform}: dilaporkan tanpa menjalankan pembaruan`,
      h.tindakan === 'tidak_perlu' || h.tindakan === 'tidak_bisa',
      h.tindakan
    );
  }
  cek(
    'alasan Instagram bisa dibaca manusia',
    (awal.find((h) => h.platform === 'INSTAGRAM')?.pesan ?? '').length > 20
  );

  // ===== 2. Token manual tanpa masa berlaku: TIDAK diperbarui =====
  console.log('\n2. Token manual tanpa info masa berlaku (kasus paling rawan)');
  await prisma.tokenPlatform.create({
    data: {
      id: 'uji-manual',
      platform: 'TIKTOK',
      accessToken: 'act.token.manual.tanpa.masa.berlaku',
    },
  });
  const manual = await perbaruiTokenYangPerlu();
  const tt = manual.find((h) => h.platform === 'TIKTOK')!;
  cek('TIKTOK TIDAK diperbarui otomatis', tt.tindakan === 'tidak_bisa', tt.tindakan);
  cek(
    'pesannya menjelaskan kenapa dan apa yang harus dilakukan',
    /masa berlaku token tidak diketahui/i.test(tt.pesan) && /isi masa berlaku/i.test(tt.pesan),
    tt.pesan
  );

  // ===== 3. Token yang masih panjang umurnya: TIDAK diperbarui =====
  console.log('\n3. Token yang masih panjang umurnya');
  await prisma.tokenPlatform.update({
    where: { id: 'uji-manual' },
    data: { accessExpiresAt: new Date(Date.now() + 50 * HARI) },
  });
  const panjang = await perbaruiTokenYangPerlu();
  const tt2 = panjang.find((h) => h.platform === 'TIKTOK')!;
  cek('TIDAK diperbarui — masih 50 hari', tt2.tindakan === 'tidak_perlu', tt2.tindakan);
  cek('alasannya menyebut sisa masa berlaku', /sisa masa berlaku/i.test(tt2.pesan), tt2.pesan);

  // ===== 4. Token menipis TAPI refresh token habis: tidak dicoba =====
  console.log('\n4. Access token menipis, refresh token sudah lewat');
  await prisma.tokenPlatform.update({
    where: { id: 'uji-manual' },
    data: {
      accessExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 jam lagi
      refreshExpiresAt: new Date(Date.now() - HARI), // sudah lewat
    },
  });
  const habis = await perbaruiTokenYangPerlu();
  const tt3 = habis.find((h) => h.platform === 'TIKTOK')!;
  cek(
    'TIDAK dicoba — percobaan hanya akan gagal dan mengotori catatan',
    tt3.tindakan === 'tidak_bisa',
    tt3.tindakan
  );
  cek('menyebut perlunya otorisasi ulang', /otorisasi ulang/i.test(tt3.pesan), tt3.pesan);

  // ===== 5. Token di database menang atas konfigurasi =====
  console.log('\n5. Token database dipakai mengirim (menang atas konfigurasi)');
  await prisma.tokenPlatform.update({
    where: { id: 'uji-manual' },
    data: {
      accessToken: 'act.token.dari.database',
      accessExpiresAt: new Date(Date.now() + 20 * HARI),
      refreshExpiresAt: new Date(Date.now() + 300 * HARI),
    },
  });
  const kred = await bacaKredensial('TIKTOK');
  cek('token berasal dari database', kred.sumber === 'database', kred.sumber);
  cek('nilainya token database (bukan dari berkas)', kred.accessToken === 'act.token.dari.database');
  cek('masa berlakunya ikut terbaca', kred.accessExpiresAt instanceof Date);

  // ===== 6. Token menipis dengan refresh valid: BOLEH diperbarui =====
  console.log('\n6. Token menipis dan refresh masih berlaku: saatnya memperbarui');
  await prisma.tokenPlatform.update({
    where: { id: 'uji-manual' },
    data: {
      accessExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      diperbaruiAt: new Date(Date.now() - 30 * HARI),
    },
  });
  const siap = await perbaruiTokenYangPerlu();
  const tt4 = siap.find((h) => h.platform === 'TIKTOK')!;
  // tanpa client key, pembaruan TIDAK bisa jalan — dan itu harus dilaporkan
  // sebagai kegagalan yang jelas, bukan diam-diam "berhasil"
  cek(
    'dilaporkan sebagai gagal (client key belum diisi) — bukan diklaim berhasil',
    tt4.tindakan === 'gagal',
    tt4.tindakan
  );
  cek(
    'pesannya menyebut client key yang kurang',
    /client key/i.test(tt4.pesan),
    tt4.pesan
  );

  await bersihkan();
  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
}

main()
  .catch(async (e) => {
    console.error(e);
    await bersihkan().catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
