/**
 * Seed akun pertama & data contoh.
 *
 * Jalankan:
 *   pnpm exec tsx scripts/seed.ts            # buat akun + brand + data contoh
 *   pnpm exec tsx scripts/seed.ts --hapus    # bersihkan data contoh
 *
 * Password admin diambil dari ADMIN_PASSWORD di .env.local (atau argumen).
 * Akun dibuat dengan harusGantiPassword = true, jadi password itu WAJIB diganti
 * saat login pertama.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL tidak ada.');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Gambar JPEG 1×1 (putih) sebagai berkas contoh — cukup untuk membuktikan jalur berkas hidup. */
const JPEG_KECIL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const PREFIX = '[CONTOH]';

async function main() {
  const hapus = process.argv.includes('--hapus');

  if (hapus) {
    const n = await prisma.konten.deleteMany({ where: { judul: { startsWith: PREFIX } } });
    console.log(`✓ ${n.count} konten contoh dihapus.`);
    return;
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@sosmed244.local').toLowerCase();
  const nama = process.env.ADMIN_NAMA ?? 'Administrator';
  const password = process.env.ADMIN_PASSWORD ?? process.argv[2];

  if (!password) {
    console.error(
      '❌ Password belum diset.\n' +
        '   Tambahkan ADMIN_PASSWORD ke .env.local, atau jalankan:\n' +
        '   pnpm exec tsx scripts/seed.ts "PasswordAnda123"'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Password minimal 8 karakter.');
    process.exit(1);
  }

  // ===== brand =====
  const brand = await prisma.brand.upsert({
    where: { kode: 'UMUM' },
    update: {},
    create: { kode: 'UMUM', nama: 'Brand Utama', keterangan: 'Dibuat otomatis oleh seed.' },
  });
  console.log('✓ Brand:', brand.kode, '-', brand.nama);

  // ===== akun =====
  const hash = await bcrypt.hash(password, 12);
  const admin = await prisma.pengguna.upsert({
    where: { email },
    update: { nama, peran: 'ADMIN', aktif: true, brandId: brand.id },
    create: {
      email,
      nama,
      passwordHash: hash,
      peran: 'ADMIN',
      brandId: brand.id,
      harusGantiPassword: true,
    },
  });
  console.log(`✓ Admin: ${admin.email} (wajib ganti password saat login pertama)`);

  // akun contoh untuk mencoba alur approval (kalau belum ada)
  const contoh: { email: string; nama: string; peran: 'KREATOR' | 'PENYETUJU' }[] = [
    { email: 'kreator@sosmed244.local', nama: 'Kreator Contoh', peran: 'KREATOR' },
    { email: 'penyetuju@sosmed244.local', nama: 'Penyetuju Contoh', peran: 'PENYETUJU' },
  ];
  for (const c of contoh) {
    const ada = await prisma.pengguna.findUnique({ where: { email: c.email } });
    if (ada) {
      console.log(`• Lewati (sudah ada): ${c.email}`);
      continue;
    }
    const u = await prisma.pengguna.create({
      data: {
        email: c.email,
        nama: c.nama,
        passwordHash: hash,
        peran: c.peran,
        brandId: brand.id,
        harusGantiPassword: false, // supaya bisa langsung dipakai mencoba alur
      },
    });
    console.log(`✓ ${c.peran}: ${u.email}`);
  }

  // ===== data contoh =====
  const kreator = await prisma.pengguna.findUnique({ where: { email: 'kreator@sosmed244.local' } });
  const penyetuju = await prisma.pengguna.findUnique({ where: { email: 'penyetuju@sosmed244.local' } });

  if (kreator && penyetuju) {
    // Data contoh sengaja mencakup SETIAP jenis postingan, supaya alur baru
    // (story berderet, carousel multi berkas) bisa dicoba tanpa mengunggah apa pun.
    const daftar: {
      judul: string;
      caption: string;
      tujuan: 'TIKTOK' | 'INSTAGRAM' | 'KEDUANYA';
      status: 'DRAFT' | 'MENUNGGU' | 'REVISI' | 'DISETUJUI';
      jenisPosting: 'FEED' | 'STORY' | 'REELS' | 'CAROUSEL';
      /** berapa berkas contoh yang dibuat */
      jumlahBerkas: number;
      /** semua berkas berupa video? (untuk Reels/TikTok) */
      video?: boolean;
    }[] = [
      {
        judul: `${PREFIX} Promo bulan ini`,
        caption: 'Promo spesial bulan ini. Syarat dan ketentuan berlaku.',
        tujuan: 'INSTAGRAM',
        status: 'DRAFT',
        jenisPosting: 'FEED',
        jumlahBerkas: 1,
      },
      {
        judul: `${PREFIX} Story promo 3 slide`,
        caption: '',
        tujuan: 'INSTAGRAM',
        status: 'DRAFT',
        jenisPosting: 'STORY',
        jumlahBerkas: 3,
      },
      {
        judul: `${PREFIX} Carousel 4 produk`,
        caption: 'Geser untuk melihat keempat produk unggulan.',
        tujuan: 'INSTAGRAM',
        status: 'DRAFT',
        jenisPosting: 'CAROUSEL',
        jumlahBerkas: 4,
      },
      {
        judul: `${PREFIX} Menunggu persetujuan`,
        caption: 'Konten yang sudah diajukan dan menunggu keputusan penyetuju.',
        tujuan: 'INSTAGRAM',
        status: 'MENUNGGU',
        jenisPosting: 'FEED',
        jumlahBerkas: 1,
      },
      {
        judul: `${PREFIX} Perlu revisi`,
        caption: 'Konten yang dikembalikan penyetuju untuk diperbaiki.',
        tujuan: 'INSTAGRAM',
        status: 'REVISI',
        jenisPosting: 'FEED',
        jumlahBerkas: 1,
      },
      {
        judul: `${PREFIX} Sudah disetujui`,
        caption: 'Konten yang lolos approval dan siap dikirim ke platform.',
        tujuan: 'INSTAGRAM',
        status: 'DISETUJUI',
        jenisPosting: 'FEED',
        jumlahBerkas: 1,
      },
      {
        judul: `${PREFIX} Draft tanpa berkas`,
        caption: '',
        tujuan: 'INSTAGRAM',
        status: 'DRAFT',
        jenisPosting: 'FEED',
        jumlahBerkas: 0,
      },
    ];

    let dibuat = 0;
    for (const c of daftar) {
      const ada = await prisma.konten.findFirst({ where: { judul: c.judul } });
      if (ada) continue;

      const konten = await prisma.konten.create({
        data: {
          judul: c.judul,
          caption: c.caption,
          // jenis ringkasan mengikuti berkas yang benar-benar dibuat
          jenis: c.video ? 'VIDEO' : 'GAMBAR',
          jenisPosting: c.jenisPosting,
          tujuan: c.tujuan,
          status: c.status,
          pembuatId: kreator.id,
          penyetujuId: penyetuju.id,
          brandId: brand.id,
          media: {
            create: Array.from({ length: c.jumlahBerkas }, (_, i) => ({
              urutan: i,
              jenis: c.video ? ('VIDEO' as const) : ('GAMBAR' as const),
              data: JPEG_KECIL,
              mime: c.video ? 'video/mp4' : 'image/jpeg',
              byte: 5000,
              lebar: 1080,
              tinggi: 1080,
            })),
          },
          ...(c.status !== 'DRAFT' ? { pengajuId: kreator.id, diajukanAt: new Date() } : {}),
          ...(c.status === 'REVISI'
            ? {
                diputusAt: new Date(),
                alasanRevisi: 'Caption perlu menyebutkan syarat dan ketentuan secara lebih jelas.',
                jumlahRevisi: 1,
              }
            : {}),
          ...(c.status === 'DISETUJUI' ? { diputusAt: new Date() } : {}),
        },
      });

      await prisma.keputusan.create({
        data: {
          kontenId: konten.id,
          aksi: 'DIBUAT',
          olehId: kreator.id,
          catatan: `Dibuat oleh skrip seed (${c.jumlahBerkas} berkas).`,
        },
      });
      dibuat++;
    }
    console.log(`✓ ${dibuat} konten contoh dibuat.`);
  }

  console.log('\n=== AKUN ===');
  console.log(`  Admin     : ${email}`);
  console.log('  Kreator   : kreator@sosmed244.local');
  console.log('  Penyetuju : penyetuju@sosmed244.local');
  console.log(`  Password  : (nilai yang Anda set) untuk semuanya`);
  console.log('\nBersihkan data contoh: pnpm exec tsx scripts/seed.ts --hapus');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
