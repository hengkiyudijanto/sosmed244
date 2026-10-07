/**
 * UJI ATURAN & PROTEKSI — memanggil aturan yang SAMA dengan server action,
 * langsung terhadap database, tanpa lewat UI.
 *
 * Jalankan (server harus hidup di :3100):
 *   pnpm exec tsx scripts/uji-aturan.ts
 *
 * Kenapa penting: menyembunyikan tombol BUKAN pengamanan. Server action bisa
 * dipanggil langsung lewat POST oleh siapa pun yang punya sesi. Uji ini
 * memastikan aturannya menolak, bukan hanya tombolnya hilang.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { transisi, periksaKelayakan, type JenisPosting } from '../src/lib/konten/status.js';
import { boleh, bolehAksi, bolehLihat, peranTransisi } from '../src/lib/konten/akses.js';
import { kirimKePlatform, pilihPenerbit, type BerkasKirim } from '../src/lib/konten/penerbit.js';

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

const BASIS = process.env.UJI_BASIS ?? 'http://localhost:3100';

async function main() {
  console.log('=== UJI ATURAN APLIKASI SOSMED244 ===\n');

  const kreator = await prisma.pengguna.findUnique({ where: { email: 'kreator@sosmed244.local' } });
  const penyetuju = await prisma.pengguna.findUnique({ where: { email: 'penyetuju@sosmed244.local' } });
  const admin = await prisma.pengguna.findUnique({ where: { email: 'admin@sosmed244.local' } });

  if (!kreator || !penyetuju || !admin) {
    console.error('❌ Akun contoh tidak ada. Jalankan dulu: pnpm exec tsx scripts/seed.ts');
    process.exit(1);
  }

  const saya = { id: kreator.id, peran: kreator.peran };

  // ===== 1. Kemampuan per peran =====
  console.log('1. Kemampuan per peran');
  cek('kreator boleh mengelola konten', boleh('KREATOR', 'kelola_konten'));
  cek('kreator TIDAK boleh menyetujui', !boleh('KREATOR', 'setujui_konten'));
  cek('kreator TIDAK melihat semua konten', !boleh('KREATOR', 'lihat_semua_konten'));
  cek('penyetuju boleh menyetujui', boleh('PENYETUJU', 'setujui_konten'));
  cek('penyetuju TIDAK kelola pengguna', !boleh('PENYETUJU', 'kelola_pengguna'));
  cek('admin boleh kelola pengaturan', boleh('ADMIN', 'kelola_pengaturan'));

  // ===== 2. Konten belum disetujui tidak bisa dikirim =====
  console.log('\n2. Konten belum disetujui tidak bisa dikirim (aturan inti)');
  for (const s of ['DRAFT', 'MENUNGGU', 'REVISI'] as const) {
    for (const peran of ['PEMILIK', 'PENYETUJU'] as const) {
      cek(`status ${s} oleh ${peran} ditolak`, transisi(s, 'KIRIM', peran).boleh === false);
    }
  }
  cek('DISETUJUI boleh dikirim', transisi('DISETUJUI', 'KIRIM', 'PEMILIK').boleh === true);
  cek('DIKIRIM tidak bisa dikirim dua kali', transisi('DIKIRIM', 'KIRIM', 'PEMILIK').boleh === false);

  // ===== 3. Tidak menyetujui konten sendiri =====
  console.log('\n3. Tidak boleh menyetujui konten sendiri');
  const kontenKreator = {
    pembuatId: kreator.id,
    penyetujuId: penyetuju.id,
    status: 'MENUNGGU' as const,
  };
  cek(
    'kreator dihitung PEMILIK (bukan penyetuju) pada kontennya',
    peranTransisi(kontenKreator, saya) === 'PEMILIK'
  );
  cek(
    'SETUJUI oleh pemilik ditolak',
    transisi('MENUNGGU', 'SETUJUI', peranTransisi(kontenKreator, saya)).boleh === false
  );
  cek(
    'kalau pembuatnya admin, ia tetap PEMILIK (aturan berlaku untuk semua)',
    peranTransisi(
      { pembuatId: admin.id, penyetujuId: penyetuju.id, status: 'MENUNGGU' },
      { id: admin.id, peran: admin.peran }
    ) === 'PEMILIK'
  );

  // ===== 4. Penyetuju yang sudah dikunci =====
  console.log('\n4. Penyetuju terkunci saat diajukan');
  const penyetujuLain = { id: 'orang-lain', peran: 'PENYETUJU' };
  cek(
    'penyetuju lain tidak berwenang memutuskan konten yang sudah ditugaskan',
    peranTransisi(kontenKreator, penyetujuLain) === 'PEMILIK'
  );

  // ===== 5. Cakupan data =====
  console.log('\n5. Cakupan data (kreator hanya melihat miliknya)');
  cek('kreator lain tidak melihat konten orang lain', !bolehLihat(kontenKreator, { id: 'x', peran: 'KREATOR' }));
  cek('penyetuju yang ditugaskan melihatnya', bolehLihat(kontenKreator, { id: penyetuju.id, peran: 'PENYETUJU' }));
  cek('admin melihat semuanya', bolehLihat(kontenKreator, { id: admin.id, peran: 'ADMIN' }));

  // ===== 6. Konten menunggu tidak bisa diubah =====
  console.log('\n6. Konten yang sedang menunggu tidak bisa diubah pemiliknya');
  const hak = bolehAksi(kontenKreator, saya, 'ubah');
  cek('diubah saat MENUNGGU ditolak', hak.boleh === false);
  cek(
    'alasannya menyebut cara keluar (tarik pengajuan)',
    hak.boleh === false && /tarik|menunggu/i.test(hak.alasan)
  );
  cek(
    'konten dikirim tidak bisa dihapus pemiliknya',
    bolehAksi({ ...kontenKreator, status: 'DIKIRIM' }, saya, 'hapus').boleh === false
  );

  // ===== 7. Adapter: mock vs nyata =====
  console.log('\n7. Pemilihan adapter pengiriman');
  const m = pilihPenerbit('INSTAGRAM', { modus: 'mock' });
  cek('modus mock -> adapter mock', m.penerbit.modus === 'mock' && !m.catatan);

  const nyataTanpaKredensial = pilihPenerbit('INSTAGRAM', { modus: 'nyata' });
  cek(
    'modus nyata tanpa kredensial JATUH ke mock + ada catatan sebabnya',
    nyataTanpaKredensial.penerbit.modus === 'mock' && Boolean(nyataTanpaKredensial.catatan)
  );

  const nyata = pilihPenerbit('INSTAGRAM', {
    modus: 'nyata',
    instagram: { igUserId: '1784', accessToken: 'EAAGx' },
  });
  cek('modus nyata dengan kredensial -> adapter nyata', nyata.penerbit.modus === 'nyata');

  const hasil = await kirimKePlatform(
    {
      kontenId: 'uji-' + Date.now(),
      tujuan: 'INSTAGRAM',
      jenisPosting: 'FEED',
      caption: 'uji',
      berkas: [{ url: 'http://localhost:3100/media/uji', jenis: 'GAMBAR', mime: 'image/jpeg' }],
    },
    { modus: 'mock' }
  );
  cek('pengiriman mock menandai dirinya simulasi', hasil.hasil.every((h) => /SIMULASI/i.test(h.pesan)));
  cek('hasil per platform dikumpulkan', hasil.hasil.length === 1 && hasil.hasil[0].platform === 'INSTAGRAM');

  const berkasVideo: BerkasKirim[] = [
    { url: 'http://localhost:3100/media/uji', jenis: 'VIDEO', mime: 'video/mp4' },
  ];
  const keduanya = await kirimKePlatform(
    {
      kontenId: 'uji2-' + Date.now(),
      tujuan: 'KEDUANYA',
      jenisPosting: 'REELS',
      caption: 'uji',
      berkas: berkasVideo,
    },
    { modus: 'mock' }
  );
  cek('tujuan KEDUANYA mengirim ke 2 platform', keduanya.hasil.length === 2);

  // ===== 8. Jenis postingan & multi berkas =====
  console.log('\n8. Jenis postingan (story, carousel, banyak berkas)');

  const storyTT = await kirimKePlatform(
    {
      kontenId: 'uji3-' + Date.now(),
      tujuan: 'TIKTOK',
      jenisPosting: 'STORY',
      caption: '',
      berkas: berkasVideo,
    },
    { modus: 'mock' }
  );
  cek(
    'story ke TikTok GAGAL walaupun modus simulasi, dengan alasan yang jelas',
    storyTT.hasil[0].berhasil === false && /aplikasi TikTok/i.test(storyTT.hasil[0].pesan)
  );

  const storyIG = await kirimKePlatform(
    {
      kontenId: 'uji4-' + Date.now(),
      tujuan: 'INSTAGRAM',
      jenisPosting: 'STORY',
      caption: '',
      berkas: [
        { url: 'http://x/1.jpg', jenis: 'GAMBAR', mime: 'image/jpeg' },
        { url: 'http://x/2.jpg', jenis: 'GAMBAR', mime: 'image/jpeg' },
        { url: 'http://x/3.jpg', jenis: 'GAMBAR', mime: 'image/jpeg' },
      ],
    },
    { modus: 'mock' }
  );
  cek(
    'story 3 berkas dihitung sebagai 3 unggahan',
    storyIG.hasil[0].berhasil && storyIG.hasil[0].jumlahUnggahan === 3
  );

  const carouselKurang = periksaKelayakan({
    tujuan: 'INSTAGRAM',
    jenisPosting: 'CAROUSEL',
    caption: '',
    berkas: [{ jenis: 'GAMBAR', mime: 'image/jpeg', ukuranByte: 1000 }],
  });
  cek(
    'carousel 1 berkas ditolak — minimal 2',
    carouselKurang.some((m) => /minimal 2 berkas/i.test(m.pesan))
  );

  const carouselLebih = periksaKelayakan({
    tujuan: 'INSTAGRAM',
    jenisPosting: 'CAROUSEL',
    caption: '',
    berkas: Array.from({ length: 11 }, () => ({
      jenis: 'GAMBAR' as const,
      mime: 'image/jpeg',
      ukuranByte: 1000,
    })),
  });
  cek(
    'carousel 11 berkas ditolak — maksimal 10',
    carouselLebih.some((m) => /paling banyak 10 berkas/i.test(m.pesan))
  );

  const carouselCampur = periksaKelayakan({
    tujuan: 'INSTAGRAM',
    jenisPosting: 'CAROUSEL',
    caption: 'geser',
    berkas: [
      { jenis: 'GAMBAR', mime: 'image/jpeg', ukuranByte: 1000 },
      { jenis: 'VIDEO', mime: 'video/mp4', ukuranByte: 1000, durasiDetik: 20 },
    ],
  });
  cek('carousel campur gambar + video lolos', carouselCampur.length === 0);

  const storyCaption = periksaKelayakan({
    tujuan: 'INSTAGRAM',
    jenisPosting: 'STORY',
    caption: 'caption yang tidak akan tampil',
    berkas: [{ jenis: 'GAMBAR', mime: 'image/jpeg', ukuranByte: 1000 }],
  });
  cek(
    'caption pada story diberi tahu akan diabaikan',
    storyCaption.some((m) => /diabaikan/i.test(m.pesan))
  );

  // ===== 9. Proteksi halaman lewat HTTP =====
  console.log('\n9. Proteksi halaman lewat HTTP (tanpa sesi)');
  const hidup = await fetch(`${BASIS}/masuk`).then((r) => r.status < 500).catch(() => false);
  if (!hidup) {
    console.log(`  ⚠ server ${BASIS} tidak hidup — bagian HTTP dilewati`);
  } else {
    for (const jalur of ['/', '/konten', '/konten/baru', '/persetujuan', '/pengaturan']) {
      const r = await fetch(`${BASIS}${jalur}`, { redirect: 'manual' });
      cek(
        `${jalur} tanpa sesi tidak 200`,
        r.status === 307 || r.status === 302 || r.status === 401,
        `status ${r.status}`
      );
    }
    // media harus menolak tanpa sesi
    const rm = await fetch(`${BASIS}/media/apa-saja`, { redirect: 'manual' });
    cek('berkas media menolak tanpa sesi', rm.status === 401 || rm.status === 404, `status ${rm.status}`);
  }

  // ===== 10. Data nyata di database =====
  console.log('\n10. Keadaan data yang sebenarnya');
  const jumlah = await prisma.konten.groupBy({ by: ['status'], _count: true });
  const total = jumlah.reduce((a, j) => a + j._count, 0);
  cek('ada konten di database', total > 0, `total ${total}`);
  console.log('    sebaran status:', jumlah.map((j) => `${j.status}=${j._count}`).join(' '));

  const terkirim = await prisma.konten.findMany({
    where: { status: 'DIKIRIM' },
    select: { judul: true, hasilKirim: true },
  });
  cek(
    'setiap konten berstatus DIKIRIM punya catatan hasil pengiriman',
    terkirim.every((k) => k.hasilKirim !== null),
    `${terkirim.length} konten terkirim`
  );

  const tanpaJejak = await prisma.konten.count({ where: { keputusan: { none: {} } } });
  cek('setiap konten punya minimal satu jejak keputusan', tanpaJejak === 0, `${tanpaJejak} tanpa jejak`);

  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
