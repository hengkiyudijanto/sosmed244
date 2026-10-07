/**
 * UJI TOKEN MEDIA — lewat HTTP, bukan lewat fungsi internal.
 *
 * Ini yang paling penting diperiksa: route /media harus melayani berkas dengan
 * token TANPA sesi, dan menolak token yang salah/kedaluwarsa/habis. Kalau uji
 * ini hanya memanggil fungsi token secara langsung, ia tidak membuktikan bahwa
 * route-nya benar-benar menerima jalur itu.
 *
 * Jalankan (server hidup di :3100): pnpm exec tsx scripts/uji-token.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { buatTokenMedia } from '../src/lib/konten/token-media.js';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
const BASIS = process.env.UJI_BASIS ?? 'http://localhost:3100';

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

async function main() {
  console.log('=== UJI TOKEN MEDIA (lewat HTTP) ===\n');

  const konten = await prisma.konten.findFirst({
    where: { media: { some: {} } },
    include: { media: { orderBy: { urutan: 'asc' } } },
  });
  if (!konten) {
    console.error('❌ Tidak ada konten berberkas. Jalankan seed dulu.');
    process.exit(1);
  }
  const berkas = konten.media[0];
  const url = (t: string, mediaId = berkas.id) =>
    `${BASIS}/media/${konten.id}/${mediaId}?v=${berkas.versi}&t=${encodeURIComponent(t)}`;

  const hidup = await fetch(`${BASIS}/masuk`).then((r) => r.status < 500).catch(() => false);
  if (!hidup) {
    console.log(`⚠ server ${BASIS} tidak hidup — uji ini butuh server.`);
    process.exit(1);
  }

  // ===== 1. Tanpa token: harus tetap butuh sesi =====
  console.log('1. Tanpa token (pintu tetap tertutup untuk umum)');
  const tanpaToken = await fetch(`${BASIS}/media/${konten.id}/${berkas.id}`, { redirect: 'manual' });
  cek('tanpa token dan tanpa sesi DITOLAK', tanpaToken.status === 401, `status ${tanpaToken.status}`);
  cek(
    'isi berkas TIDAK ikut terkirim saat ditolak',
    (await tanpaToken.text()).length === 0,
    'ada isi terkirim'
  );

  // ===== 2. Token palsu =====
  console.log('\n2. Token palsu / salah');
  const palsu = await fetch(url('token-palsu-yang-tidak-pernah-dibuat'));
  cek('token tak dikenal DITOLAK', palsu.status === 401, `status ${palsu.status}`);

  // ===== 3. Token sah: melayani tanpa sesi =====
  console.log('\n3. Token sah melayani berkas TANPA sesi (inilah yang dibutuhkan platform)');
  const [t] = await buatTokenMedia({ kontenId: konten.id, media: [{ id: berkas.id }] });
  const sah = await fetch(url(t.token));
  const isi = await sah.arrayBuffer();
  cek('token sah -> 200', sah.status === 200, `status ${sah.status}`);
  cek('tipe isi image/jpeg', sah.headers.get('content-type') === 'image/jpeg', String(sah.headers.get('content-type')));
  cek('berkas benar-benar terkirim (>100 byte)', isi.byteLength > 100, `${isi.byteLength} byte`);
  cek('respons token TIDAK di-cache bersama', (sah.headers.get('cache-control') ?? '').includes('no-store'), String(sah.headers.get('cache-control')));

  // ===== 4. Token terikat pada satu berkas =====
  console.log('\n4. Token dikunci ke satu berkas');
  const kontenLain = await prisma.konten.findFirst({
    where: { media: { some: {} }, id: { not: konten.id } },
    include: { media: { take: 1 } },
  });
  if (kontenLain?.media[0]) {
    const lain = await fetch(url(t.token, kontenLain.media[0].id));
    cek('token untuk konten lain DITOLAK', lain.status === 401 || lain.status === 404, `status ${lain.status}`);
  } else {
    console.log('  ⚠ hanya ada satu konten berberkas — dilewati');
  }

  // ===== 5. Batas pemakaian =====
  console.log('\n5. Batas pemakaian token');
  const [t2] = await buatTokenMedia({ kontenId: konten.id, media: [{ id: berkas.id }] });
  const p1 = await fetch(url(t2.token));
  const p2 = await fetch(url(t2.token));
  const p3 = await fetch(url(t2.token));
  cek('pemakaian ke-1 berhasil (200)', p1.status === 200, `status ${p1.status}`);
  cek('pemakaian ke-2 masih berhasil — platform kadang mengambil dua kali', p2.status === 200, `status ${p2.status}`);
  cek('pemakaian ke-3 DITOLAK (410 habis)', p3.status === 410, `status ${p3.status}`);

  // ===== 6. Kedaluwarsa =====
  console.log('\n6. Token kedaluwarsa');
  const tokenKedaluwarsa = await buatTokenMedia({
    kontenId: konten.id,
    media: [{ id: berkas.id }],
    umurMenit: -1, // sudah lewat saat dibuat
  });
  const kadaluarsa = await fetch(url(tokenKedaluwarsa[0].token));
  cek('token kedaluwarsa DITOLAK', kadaluarsa.status === 401, `status ${kadaluarsa.status}`);
  cek(
    'pesannya menjelaskan cara memperbaiki',
    (await kadaluarsa.text()).includes('Kirim ulang konten'),
    'pesan tidak menjelaskan'
  );

  // ===== 7. Tidak ada token mentah yang tersimpan =====
  console.log('\n7. Token mentah tidak tersimpan di database');
  const baris = await prisma.tokenMedia.findFirst({
    where: { mediaId: berkas.id },
    select: { tokenHash: true },
  });
  cek('yang tersimpan adalah hash (64 hex), bukan token', /^[a-f0-9]{64}$/.test(baris?.tokenHash ?? ''), baris?.tokenHash?.slice(0, 20));
  const semuaToken = await prisma.tokenMedia.findMany({ select: { tokenHash: true } });
  cek('tidak ada token mentah yang bisa dibaca dari tabel', semuaToken.every((x) => x.tokenHash.length === 64));

  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
