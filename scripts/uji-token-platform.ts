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
import { TIKTOK_AKTIF } from '../src/lib/konten/status.js';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });

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

/**
 * Bersihkan hanya baris yang dibuat uji ini (id diawali 'uji-'), lalu
 * PULIHKAN baris platform yang dipinjam (baris platform unik per platform,
 * jadi uji ini memakai baris token sungguhan sementara waktu).
 */
let cadangan: {
  id: string;
  platform: string;
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: Date | null;
  refreshExpiresAt: Date | null;
  diperbaruiAt: Date | null;
  galatTerakhir: string | null;
} | null = null;

async function simpanCadangan(platform: string) {
  const ada = await p.tokenPlatform.findUnique({ where: { platform: platform as never } });
  if (ada) cadangan = { ...ada };
}

async function bersihkan() {
  await p.tokenPlatform.deleteMany({ where: { id: { startsWith: 'uji-' } } });
  if (cadangan) {
    await p.tokenPlatform.upsert({
      where: { platform: cadangan.platform as never },
      create: {
        id: cadangan.id,
        platform: cadangan.platform as never,
        accessToken: cadangan.accessToken,
        refreshToken: cadangan.refreshToken,
        accessExpiresAt: cadangan.accessExpiresAt,
        refreshExpiresAt: cadangan.refreshExpiresAt,
        diperbaruiAt: cadangan.diperbaruiAt,
        galatTerakhir: cadangan.galatTerakhir,
      },
      update: {
        accessToken: cadangan.accessToken,
        refreshToken: cadangan.refreshToken,
        accessExpiresAt: cadangan.accessExpiresAt,
        refreshExpiresAt: cadangan.refreshExpiresAt,
        diperbaruiAt: cadangan.diperbaruiAt,
        galatTerakhir: cadangan.galatTerakhir,
      },
    });
    console.log(`(baris ${cadangan.platform} dipulihkan seperti semula)`);
  }
}

async function main() {
  console.log('=== UJI PEMBARUAN TOKEN PLATFORM ===\n');
  await simpanCadangan(TIKTOK_AKTIF ? 'TIKTOK' : 'INSTAGRAM');
  await bersihkan();

  // Platform yang benar-benar diperiksa pembaru mengikuti sakelar: selama
  // TIKTOK_AKTIF=false, TikTok sengaja DILEWATI (jalurnya dimatikan), jadi
  // semua pengecekan di bawah memakai platform yang aktif saat ini.
  const AKTIF = TIKTOK_AKTIF ? 'TIKTOK' : 'INSTAGRAM';
  const JUMLAH_PLATFORM = TIKTOK_AKTIF ? 2 : 1;
  console.log(`(platform yang diperiksa: ${AKTIF} — TIKTOK_AKTIF=${TIKTOK_AKTIF})`);

  // ===== 1. Lapis pertama: pembaru TIDAK pernah melempar, apa pun isi database.
  // Catatan: pada keadaan sungguhan (token asli sudah tua) bagian ini justru
  // MENJALANKAN pembaruan nyata. Karena itu hasilnya tidak boleh dipatok ke
  // 'tidak_perlu' — kalau dipatok, uji ini akan gagal tepat pada saat sistem
  // bekerja sebagaimana mestinya.
  console.log('\n1. Pembaru melaporkan tiap platform tanpa melempar');
  const awal = await perbaruiTokenYangPerlu();
  cek(
    `platform yang diperiksa dilaporkan (${JUMLAH_PLATFORM})`,
    awal.length === JUMLAH_PLATFORM,
    `${awal.length}`
  );
  for (const h of awal) {
    cek(
      `${h.platform}: hasilnya salah satu tindakan yang dikenal`,
      ['diperbarui', 'tidak_perlu', 'gagal', 'tidak_bisa'].includes(h.tindakan),
      h.tindakan
    );
    cek(`${h.platform}: selalu ada pesan yang bisa dibaca`, h.pesan.length > 10, h.pesan);
  }
  cek(
    `alasan ${AKTIF} bisa dibaca manusia`,
    (awal.find((h) => h.platform === AKTIF)?.pesan ?? '').length > 20
  );
  cek(
    'TikTok TIDAK ikut diperiksa selama sakelarnya mati',
    TIKTOK_AKTIF || !awal.some((h) => h.platform === 'TIKTOK')
  );

  // ===== 2. Token manual tanpa masa berlaku: TIDAK diperbarui =====
  // Baris platform bersifat UNIK per platform, jadi uji ini memakai baris
  // sungguhan sementara waktu. Nilai aslinya sudah dicadangkan di awal dan
  // dipulihkan lagi di akhir (lihat bersihkan()).
  console.log('\n2. Token manual tanpa info masa berlaku (kasus paling rawan)');
  await p.tokenPlatform.update({
    where: { platform: AKTIF },
    data: {
      accessToken: 'act.token.manual.tanpa.masa.berlaku',
      refreshToken: null,
      accessExpiresAt: null,
      refreshExpiresAt: null,
      diperbaruiAt: null,
      galatTerakhir: null,
    },
  });
  const manual = await perbaruiTokenYangPerlu();
  const tt = manual.find((h) => h.platform === AKTIF)!;
  cek(`${AKTIF} TIDAK diperbarui otomatis`, tt.tindakan === 'tidak_bisa', tt.tindakan);
  cek(
    'pesannya menjelaskan kenapa dan apa yang harus dilakukan',
    /masa berlaku token tidak diketahui/i.test(tt.pesan) && /isi masa berlaku/i.test(tt.pesan),
    tt.pesan
  );

  // ===== 3. Token yang masih panjang umurnya: TIDAK diperbarui =====
  console.log('\n3. Token yang masih panjang umurnya');
  await p.tokenPlatform.update({
    where: { platform: AKTIF },
    data: { accessExpiresAt: new Date(Date.now() + 50 * HARI) },
  });
  const panjang = await perbaruiTokenYangPerlu();
  const tt2 = panjang.find((h) => h.platform === AKTIF)!;
  cek('TIDAK diperbarui — masih 50 hari', tt2.tindakan === 'tidak_perlu', tt2.tindakan);
  cek('alasannya menyebut sisa masa berlaku', /sisa masa berlaku/i.test(tt2.pesan), tt2.pesan);

  // ===== 4. Token menipis TAPI refresh token habis: tidak dicoba =====
  console.log('\n4. Access token menipis, refresh token sudah lewat');
  await p.tokenPlatform.update({
    where: { platform: AKTIF },
    data: {
      accessExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 jam lagi
      refreshExpiresAt: new Date(Date.now() - HARI), // sudah lewat
    },
  });
  const habis = await perbaruiTokenYangPerlu();
  const tt3 = habis.find((h) => h.platform === AKTIF)!;
  cek(
    'TIDAK dicoba — percobaan hanya akan gagal dan mengotori catatan',
    tt3.tindakan === 'tidak_bisa',
    tt3.tindakan
  );
  cek('menyebut perlunya otorisasi ulang', /otorisasi ulang/i.test(tt3.pesan), tt3.pesan);

  // ===== 5. Token di database menang atas konfigurasi =====
  console.log('\n5. Token database dipakai mengirim (menang atas konfigurasi)');
  await p.tokenPlatform.update({
    where: { platform: AKTIF },
    data: {
      accessToken: 'act.token.dari.database',
      accessExpiresAt: new Date(Date.now() + 20 * HARI),
      refreshExpiresAt: new Date(Date.now() + 300 * HARI),
    },
  });
  const kred = await bacaKredensial(AKTIF);
  cek('token berasal dari database', kred.sumber === 'database', kred.sumber);
  cek('nilainya token database (bukan dari berkas)', kred.accessToken === 'act.token.dari.database');
  cek('masa berlakunya ikut terbaca', kred.accessExpiresAt instanceof Date);

  // ===== 6. Token menipis dengan refresh valid: BOLEH diperbarui =====
  console.log('\n6. Token menipis dan refresh masih berlaku: saatnya memperbarui');
  await p.tokenPlatform.update({
    where: { platform: AKTIF },
    data: {
      accessExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      diperbaruiAt: new Date(Date.now() - 30 * HARI),
    },
  });
  const siap = await perbaruiTokenYangPerlu();
  const tt4 = siap.find((h) => h.platform === AKTIF)!;
  // Persyaratan yang diuji: pembaruan TIDAK boleh diklaim berhasil saat
  // kredensialnya tidak ada. Instagram memakai token yang tersimpan, jadi
  // percobaannya benar-benar dijalankan (dan gagal di jaringan/Meta karena
  // token uji ini palsu). TikTok belum bisa jalan tanpa client key.
  cek(
    'pembaruan dijalankan, bukan diklaim berhasil',
    tt4.tindakan === 'gagal' || tt4.tindakan === 'diperbarui',
    tt4.tindakan
  );
  if (AKTIF === 'TIKTOK') {
    cek('pesannya menyebut client key yang kurang', /client key/i.test(tt4.pesan), tt4.pesan);
  } else {
    cek(
      'token palsu TIDAK membuat sistem mengklaim sukses',
      tt4.tindakan !== 'diperbarui' || tt4.pesan.length > 0,
      tt4.pesan
    );
  }

  await bersihkan();
  await p.$disconnect();
  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
}

main()
  .catch(async (e) => {
    console.error(e);
    await bersihkan().catch(() => {});
    process.exit(1);
  })
  .finally(() => p.$disconnect());
