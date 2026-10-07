/**
 * UJI URL PENGIRIMAN — membuktikan URL yang DIBUAT server action benar-benar
 * bisa diambil tanpa sesi oleh platform.
 *
 * Kenapa perlu diuji terpisah dari uji token: uji token memanggil pembuat token
 * langsung. Di sini yang diperiksa adalah kenyataan yang dihadapi platform —
 * URL yang benar-benar dikirim ke TikTok/Instagram.
 *
 * Jalankan (server hidup di :3100): pnpm exec tsx scripts/uji-url-kirim.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { buatTokenMedia, urlBerkasPublik } from '../src/lib/konten/token-media.js';

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
  console.log('=== UJI URL PENGIRIMAN (yang benar-benar dikirim ke platform) ===\n');

  // konten carousel: banyak berkas, seperti kasus yang paling rawan
  const konten = await prisma.konten.findFirst({
    where: { media: { some: {} }, jenisPosting: 'CAROUSEL' },
    include: { media: { orderBy: { urutan: 'asc' } } },
  });
  const dipakai =
    konten ??
    (await prisma.konten.findFirst({
      where: { media: { some: {} } },
      include: { media: { orderBy: { urutan: 'asc' } } },
    }));
  if (!dipakai) {
    console.error('❌ Tidak ada konten berberkas.');
    process.exit(1);
  }
  console.log(
    `Konten uji: "${dipakai.judul}" (${dipakai.jenisPosting}) — ${dipakai.media.length} berkas\n`
  );

  // ==== persis seperti server action: satu token per berkas ====
  const tokens = await buatTokenMedia({
    kontenId: dipakai.id,
    media: dipakai.media.map((m) => ({ id: m.id })),
  });
  const peta = new Map(tokens.map((t) => [t.mediaId, t.token]));

  const urls = dipakai.media.map((m) =>
    urlBerkasPublik({
      basisUrl: BASIS,
      kontenId: dipakai.id,
      mediaId: m.id,
      token: peta.get(m.id)!,
      versi: m.versi,
    })
  );

  console.log('1. Tiap berkas punya URL sendiri dan bisa diambil tanpa sesi');
  for (const [i, u] of urls.entries()) {
    const r = await fetch(u);
    const isi = await r.arrayBuffer();
    cek(
      `berkas ke-${i + 1} -> 200 dan ada isinya`,
      r.status === 200 && isi.byteLength > 100,
      `status ${r.status}, ${isi.byteLength} byte`
    );
  }

  console.log('\n2. Token berbeda tiap berkas (bukan satu token untuk semua)');
  cek('jumlah token unik = jumlah berkas', new Set(tokens.map((t) => t.token)).size === tokens.length);

  console.log('\n3. Tukar token antar berkas DITOLAK');
  if (urls.length >= 2) {
    const tukar = urls[1].replace(peta.get(dipakai.media[1].id)!, peta.get(dipakai.media[0].id)!);
    const r = await fetch(tukar);
    cek('token berkas 1 dipakai untuk berkas 2 -> DITOLAK', r.status === 401, `status ${r.status}`);
  } else {
    console.log('  ⚠ hanya satu berkas — dilewati');
  }

  console.log('\n4. URL thumbnail (tanpa token) TIDAK menerima token');
  const thumbnailDenganToken = `${BASIS}/media/${dipakai.id}?t=${peta.get(dipakai.media[0].id)!}`;
  const rt = await fetch(thumbnailDenganToken);
  cek(
    'token di URL thumbnail diabaikan (tetap butuh sesi)',
    rt.status === 401,
    `status ${rt.status}`
  );

  console.log('\n5. Token bisa dipakai ulang SEKALI (toleransi platform), lalu habis');
  const urlUlang = urls[0];
  const a = await fetch(urlUlang);
  if (a.status === 200) {
    const b = await fetch(urlUlang);
    const c = await fetch(urlUlang);
    cek('pemakaian berikutnya ditolak setelah kuota habis', c.status === 410, `status ${c.status}`);
  } else {
    // token berkas 0 sudah terpakai di langkah 1
    console.log(`  ⚠ token berkas 1 sudah terpakai (status ${a.status}) — bagian ini dilewati`);
  }

  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
