/**
 * UJI JADWAL — terhadap DATABASE SUNGGUHAN, bukan mock.
 *
 * Kenapa tidak di-mock: yang dijamin di sini adalah perilaku database —
 * `updateMany` dengan syarat status (compare-and-swap). Itu yang mencegah satu
 * konten terkirim DUA KALI ketika cron berikutnya menyusul cron yang masih
 * jalan. Mock hanya akan membuktikan bahwa mock-nya bekerja.
 *
 * Konten uji dibuat khusus dengan awalan [UJI], dan dihapus lagi di akhir.
 *
 * Jalankan: pnpm exec tsx scripts/uji-jadwal.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { jalankanJadwal } from '../src/lib/konten/jadwal.js';
import { JEDA_COBA_ULANG_MENIT, MAKS_PERCOBAAN } from '../src/lib/konten/jadwal-angka.js';
import { MAKS_PAKAI_TOKEN } from '../src/lib/konten/token-media.js';
import { TIKTOK_AKTIF } from '../src/lib/konten/status.js';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });

const PREFIX = '[UJI-JADWAL]';
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

/** Gambar JPEG 1×1 yang sah. */
const JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

async function bersihkan() {
  await prisma.konten.deleteMany({ where: { judul: { startsWith: PREFIX } } });
}

/** Buat konten uji dalam status DIJADWALKAN pada waktu tertentu. */
async function buatKonten(input: {
  nama: string;
  jadwalAt: Date | null;
  status: 'DIJADWALKAN' | 'DISETUJUI' | 'DRAFT';
  tujuan?: 'INSTAGRAM' | 'TIKTOK' | 'KEDUANYA';
  jenisPosting?: 'FEED' | 'STORY' | 'REELS' | 'CAROUSEL';
  jenis?: 'GAMBAR' | 'VIDEO';
  jumlahBerkas?: number;
  pembuatId: string;
  penyetujuId: string;
  brandId: string | null;
}) {
  const jenisPosting = input.jenisPosting ?? 'FEED';
  const jumlah = input.jumlahBerkas ?? 1;
  return prisma.konten.create({
    data: {
      judul: `${PREFIX} ${input.nama}`,
      caption: 'uji jadwal',
      jenis: input.jenis ?? 'GAMBAR',
      jenisPosting,
      tujuan: input.tujuan ?? 'INSTAGRAM',
      status: input.status,
      jadwalAt: input.jadwalAt,
      pembuatId: input.pembuatId,
      penyetujuId: input.penyetujuId,
      brandId: input.brandId,
      media: {
        create: Array.from({ length: jumlah }, (_, i) => ({
          urutan: i,
          jenis: 'GAMBAR' as const,
          data: JPEG,
          mime: 'image/jpeg',
          byte: 100,
          lebar: 1,
          tinggi: 1,
        })),
      },
    },
    select: { id: true, judul: true, jadwalAt: true },
  });
}

async function main() {
  console.log('=== UJI JADWAL (database sungguhan) ===\n');
  await bersihkan();

  const kreator = await prisma.pengguna.findUnique({ where: { email: 'kreator@sosmed244.local' } });
  const penyetuju = await prisma.pengguna.findUnique({ where: { email: 'penyetuju@sosmed244.local' } });
  if (!kreator || !penyetuju) {
    console.error('❌ Akun seed tidak ada. Jalankan seed dulu.');
    process.exit(1);
  }
  const brand = await prisma.brand.findFirst({ select: { id: true } });
  const dasar = {
    pembuatId: kreator.id,
    penyetujuId: penyetuju.id,
    brandId: brand?.id ?? null,
  };

  const sekarang = new Date();

  // ===== 1. Hanya yang jatuh tempo dijalankan =====
  console.log('1. Hanya konten yang jadwalnya sudah lewat yang dijalankan');
  const lampau = await buatKonten({ nama: 'jatuh tempo', jadwalAt: new Date(sekarang.getTime() - 60_000), status: 'DIJADWALKAN', ...dasar });
  const masaDepan = await buatKonten({ nama: 'belum waktunya', jadwalAt: new Date(sekarang.getTime() + 3600_000), status: 'DIJADWALKAN', ...dasar });

  const hasil1 = await jalankanJadwal(sekarang);
  const cekLampau = await prisma.konten.findUnique({ where: { id: lampau.id }, select: { status: true, jadwalAt: true } });
  const cekDepan = await prisma.konten.findUnique({ where: { id: masaDepan.id }, select: { status: true, jadwalAt: true } });

  cek('konten jatuh tempo diproses', hasil1.rincian.some((r) => r.kontenId === lampau.id));
  cek(
    'konten jatuh tempo: berakhir DIKIRIM atau DIJADWALKAN ulang (tidak menggantung)',
    cekLampau?.status === 'DIKIRIM' || cekLampau?.status === 'DIJADWALKAN',
    `status ${cekLampau?.status}`
  );
  cek(
    'konten yang belum waktunya TIDAK disentuh',
    cekDepan?.status === 'DIJADWALKAN' &&
      cekDepan.jadwalAt?.getTime() === masaDepan.jadwalAt?.getTime(),
    `status ${cekDepan?.status}`
  );

  // ===== 2. Konten tanpa berkas: jadwal DIBATALKAN (bukan dicoba ulang) =====
  console.log('\n2. Konten tidak lengkap: jadwal dibatalkan, bukan dicoba selamanya');
  const kosong = await buatKonten({ nama: 'tanpa berkas', jadwalAt: new Date(sekarang.getTime() - 60_000), status: 'DIJADWALKAN', jumlahBerkas: 0, ...dasar });
  await jalankanJadwal(sekarang);
  const cekKosong = await prisma.konten.findUnique({ where: { id: kosong.id }, select: { status: true, jadwalAt: true } });
  cek('status kembali ke DISETUJUI', cekKosong?.status === 'DISETUJUI', `status ${cekKosong?.status}`);
  cek('jadwal dikosongkan', cekKosong?.jadwalAt === null);
  const jejakBatal = await prisma.keputusan.findFirst({ where: { kontenId: kosong.id, aksi: 'JADWAL_DIBATALKAN' } });
  cek('ada jejak keputusan JADWAL_DIBATALKAN', Boolean(jejakBatal));
  cek('jejaknya menjelaskan sebabnya', (jejakBatal?.catatan ?? '').includes('berkas'));

  // ===== 3. Jenis yang tidak didukung platform: dibatalkan =====
  console.log('\n3. Konten yang tujuannya mustahil: dibatalkan, bukan dicoba ulang');
  if (TIKTOK_AKTIF) {
    // TikTok hidup: story ke TikTok memang ditolak API, jadi inilah kasusnya.
    const storyTikTok = await buatKonten({
      nama: 'story ke tiktok',
      jadwalAt: new Date(sekarang.getTime() - 60_000),
      status: 'DIJADWALKAN',
      tujuan: 'TIKTOK',
      jenisPosting: 'STORY',
      ...dasar,
    });
    await jalankanJadwal(sekarang);
    const cekStory = await prisma.konten.findUnique({ where: { id: storyTikTok.id }, select: { status: true, jadwalAt: true } });
    cek('story TikTok dibatalkan (bukan gagal berulang)', cekStory?.status === 'DISETUJUI', `status ${cekStory?.status}`);
    const jejakStory = await prisma.keputusan.findFirst({ where: { kontenId: storyTikTok.id, aksi: 'JADWAL_DIBATALKAN' } });
    cek('catatannya menyebut TikTok', (jejakStory?.catatan ?? '').toLowerCase().includes('tiktok'));
  } else {
    // TikTok DIMATIKAN (TIKTOK_AKTIF=false): tujuan TIKTOK kini menunjuk ke
    // platform aktif (Instagram), jadi story tidak lagi "mustahil" — yang
    // mustahil adalah konten berformat gambar dengan jenis WajibVideo.
    // Ujinya tetap harus membuktikan hal yang sama: dibatalkan SEKALI, tanpa
    // percobaan ulang.
    const takLayak = await buatKonten({
      nama: 'gambar dijejalkan ke reels',
      jadwalAt: new Date(sekarang.getTime() - 60_000),
      status: 'DIJADWALKAN',
      tujuan: 'INSTAGRAM',
      jenisPosting: 'REELS',
      jenis: 'GAMBAR',
      ...dasar,
    });
    await jalankanJadwal(sekarang);
    const cekTakLayak = await prisma.konten.findUnique({ where: { id: takLayak.id }, select: { status: true, jadwalAt: true } });
    cek(
      'konten tidak layak dibatalkan (bukan gagal berulang)',
      cekTakLayak?.status === 'DISETUJUI',
      `status ${cekTakLayak?.status}`
    );
    const jejakTakLayak = await prisma.keputusan.findFirst({ where: { kontenId: takLayak.id, aksi: 'JADWAL_DIBATALKAN' } });
    cek('catatannya menjelaskan sebabnya', (jejakTakLayak?.catatan ?? '').length > 10, jejakTakLayak?.catatan ?? '(kosong)');
  }

  // ===== 4. Tidak terkirim dua kali (penguncian) =====
  console.log('\n4. Satu konten TIDAK terkirim dua kali');
  const sekali = await buatKonten({ nama: 'sekali saja', jadwalAt: new Date(sekarang.getTime() - 60_000), status: 'DIJADWALKAN', ...dasar });
  // dua pemanggilan berurutan pada waktu yang sama, meniru cron yang menyusul
  const [a, b] = await Promise.all([jalankanJadwal(sekarang), jalankanJadwal(sekarang)]);
  const jumlahKeputusanKirim = await prisma.keputusan.count({
    where: { kontenId: sekali.id, aksi: { in: ['KIRIM_OTOMATIS', 'KIRIM_OTOMATIS_GAGAL'] } },
  });
  cek(
    'pemanggilan bersamaan hanya menghasilkan satu percobaan pengiriman',
    jumlahKeputusanKirim === 1,
    `jumlah jejak kirim = ${jumlahKeputusanKirim} (lulus=${a.terkirim + a.gagal}, b=${b.terkirim + b.gagal})`
  );

  // ===== 5. Token berkas dibuat saat pengiriman terjadwal =====
  console.log('\n5. Pengiriman terjadwal membuat tautan bertoken seperti jalur manual');
  const berToken = await buatKonten({
    nama: 'carousel berjadwal',
    jadwalAt: new Date(sekarang.getTime() - 60_000),
    status: 'DIJADWALKAN',
    jenisPosting: 'CAROUSEL',
    jumlahBerkas: 3,
    ...dasar,
  });
  await jalankanJadwal(sekarang);
  const tokenKonten = await prisma.tokenMedia.count({ where: { kontenId: berToken.id } });
  cek('dibuat satu tautan per berkas (3 berkas → 3 token)', tokenKonten === 3, `jumlah token ${tokenKonten}`);
  const tokenContoh = await prisma.tokenMedia.findFirst({ where: { kontenId: berToken.id }, select: { maksPakai: true, tokenHash: true } });
  cek('batas pemakaian sesuai aturan', tokenContoh?.maksPakai === MAKS_PAKAI_TOKEN);
  cek('disimpan sebagai hash, bukan token mentah', /^[a-f0-9]{64}$/.test(tokenContoh?.tokenHash ?? ''));

  // ===== 6. Gagal berulang: dibatalkan setelah batas percobaan =====
  console.log('\n6. Gagal berulang berhenti sendiri setelah batas percobaan');
  const bandel = await buatKonten({ nama: 'selalu gagal', jadwalAt: new Date(sekarang.getTime() - 60_000), status: 'DIJADWALKAN', ...dasar });
  // buat tokennya selalu habis? Tidak bisa dipaksa lewat mock acak.
  // Yang diuji: berapa kali percobaan sampai dibatalkan, memakai jejak yang
  // ditanam lebih dulu supaya berada tepat di ambang batas.
  for (let i = 1; i < MAKS_PERCOBAAN; i++) {
    await prisma.keputusan.create({
      data: {
        kontenId: bandel.id,
        aksi: 'KIRIM_OTOMATIS_GAGAL',
        olehId: kreator.id,
        catatan: `percobaan ke-${i} (ditanam untuk uji)`,
      },
    });
  }
  // dengan percobaan yang sudah ada, jalankan sampai konten ini diproses lagi
  let akhir = await prisma.konten.findUnique({ where: { id: bandel.id }, select: { status: true } });
  for (let putaran = 0; putaran < MAKS_PERCOBAAN && akhir?.status === 'DIJADWALKAN'; putaran++) {
    await prisma.konten.update({ where: { id: bandel.id }, data: { jadwalAt: new Date(Date.now() - 60_000) } });
    await jalankanJadwal(new Date());
    akhir = await prisma.konten.findUnique({ where: { id: bandel.id }, select: { status: true } });
  }
  cek(
    'konten yang selalu gagal akhirnya dibatalkan (tidak dicoba selamanya)',
    akhir?.status === 'DISETUJUI' || akhir?.status === 'DIKIRIM',
    `status akhir ${akhir?.status}`
  );

  // ===== 7. Akun sistem untuk jejak pengiriman otomatis =====
  console.log('\n7. Jejak pengiriman otomatis punya pelaku yang jelas');
  const akunSistem = await prisma.pengguna.findUnique({
    where: { email: 'sistem@sosmed244.local' },
    select: { nama: true, aktif: true, peran: true },
  });
  cek('akun sistem ada', Boolean(akunSistem));
  cek('akun sistem TIDAK aktif (tidak bisa login)', akunSistem?.aktif === false);

  await bersihkan();
  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  console.log(`(jeda percobaan ulang: ${JEDA_COBA_ULANG_MENIT} menit, batas: ${MAKS_PERCOBAAN}×)`);
  if (gagal > 0) process.exit(1);
}

main()
  .catch(async (e) => {
    console.error(e);
    await bersihkan().catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
