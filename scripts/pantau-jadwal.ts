/**
 * Memantau apakah cron-job.org benar-benar memanggil endpoint jadwal.
 *
 * Caranya: catat jejak keputusan terbaru dari akun sistem, tunggu, lalu lihat
 * apakah ada aktivitas baru. Ini bukti dari sisi DATABASE — jadi tidak
 * bergantung pada dashboard cron-job.org.
 *
 * Pemakaian: pnpm exec tsx scripts/pantau-jadwal.ts [menit]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const p = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)!,
  }),
});

const SISTEM = 'sistem@sosmed244.local';

async function ringkas() {
  const token = await p.tokenPlatform.findUnique({ where: { platform: 'INSTAGRAM' } });
  const sistem = await p.pengguna.findUnique({ where: { email: SISTEM }, select: { id: true } });
  const jejakSistem = sistem
    ? await p.keputusan.count({ where: { olehId: sistem.id } })
    : 0;
  const menunggu = await p.konten.count({ where: { status: 'DIJADWALKAN' } });
  return {
    tokenDiperbaruiAt: token?.diperbaruiAt ?? null,
    galatToken: token?.galatTerakhir ?? null,
    jejakSistem,
    kontenDijadwalkan: menunggu,
  };
}

async function main() {
  const menit = Number(process.argv[2] ?? 12);
  const awal = await ringkas();
  console.log('=== PANTAU JADWAL ===');
  console.log('Awal :', JSON.stringify(awal));

  const selesai = Date.now() + menit * 60_000;
  let terdeteksi = false;
  while (Date.now() < selesai) {
    await new Promise((r) => setTimeout(r, 20_000));
    const kini = await ringkas();
    const baru =
      kini.jejakSistem !== awal.jejakSistem ||
      kini.tokenDiperbaruiAt?.getTime() !== awal.tokenDiperbaruiAt?.getTime();
    if (baru) {
      console.log('\n✅ ADA AKTIVITAS BARU — penjadwal benar-benar memanggil endpoint.');
      console.log('   Sebelum:', JSON.stringify(awal));
      console.log('   Sesudah:', JSON.stringify(kini));
      if (kini.galatToken) console.log(`   ⚠ galat token: ${kini.galatToken}`);
      terdeteksi = true;
      break;
    }
    process.stdout.write('.');
  }

  if (!terdeteksi) {
    const akhir = await ringkas();
    console.log(`\n⚠ Tidak ada aktivitas baru dalam ${menit} menit.`);
    console.log('   Kondisi akhir:', JSON.stringify(akhir));
    console.log(
      '   Ini TIDAK selalu berarti cron mati: endpoint yang memang tidak punya\n' +
        '   pekerjaan tetap menjawab 200 tanpa menulis jejak apa pun.'
    );
  }
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
});
