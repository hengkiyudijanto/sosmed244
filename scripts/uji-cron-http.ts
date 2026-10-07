/**
 * UJI ENDPOINT CRON — keamanannya diperiksa lebih dulu, karena endpoint ini
 * MENGIRIM KONTEN KE PLATFORM. Kalau bisa dipicu siapa pun, orang lain bisa
 * memaksa pengiriman.
 *
 * Jalankan (server hidup di :3100): pnpm exec tsx scripts/uji-cron-http.ts
 */
import 'dotenv/config';

const BASIS = process.env.UJI_BASIS ?? 'http://localhost:3100';
const JALUR = `${BASIS}/api/cron/jadwal`;

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
  console.log('=== UJI ENDPOINT CRON (HTTP) ===\n');

  const hidup = await fetch(`${BASIS}/masuk`).then((r) => r.status < 500).catch(() => false);
  if (!hidup) {
    console.log(`⚠ server ${BASIS} tidak hidup — uji ini butuh server.`);
    process.exit(1);
  }

  // ===== 1. Tanpa rahasia =====
  console.log('1. Tanpa header Authorization');
  const tanpa = await fetch(JALUR);
  const isiTanpa = (await tanpa.json().catch(() => ({}))) as { pesan?: string };
  cek(
    'DITOLAK (401 atau 503, bukan 200)',
    tanpa.status === 401 || tanpa.status === 503,
    `status ${tanpa.status}`
  );
  cek('tidak ada pengiriman yang terjadi', tanpa.status !== 200);

  // ===== 2. Rahasia salah =====
  console.log('\n2. Rahasia yang salah');
  const salah = await fetch(JALUR, { headers: { authorization: 'Bearer rahasia-palsu' } });
  cek('DITOLAK', salah.status === 401 || salah.status === 503, `status ${salah.status}`);
  cek(
    'pesannya tidak membocorkan rahasia yang benar',
    !JSON.stringify(await salah.json().catch(() => ({}))).includes('Bearer ')
  );

  // ===== 3. Rahasia benar =====
  console.log('\n3. Rahasia benar');
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia) {
    console.log('  ⚠ CRON_SECRET belum diset di lingkungan ini — bagian ini dilewati');
    console.log('    (justru itu yang diuji di bagian 1: tanpa rahasia, endpoint menolak)');
  } else {
    const benar = await fetch(JALUR, { headers: { authorization: `Bearer ${rahasia}` } });
    const isi = (await benar.json().catch(() => ({}))) as Record<string, unknown>;
    cek('diterima (200)', benar.status === 200, `status ${benar.status}`);
    cek('melaporkan berapa konten yang dipertimbangkan', typeof isi.dipertimbangkan === 'number');
    cek('melaporkan modus pengiriman', isi.modus === 'mock' || isi.modus === 'nyata');
  }

  // ===== 4. Tidak menerima POST (tidak ada jalur alternatif) =====
  console.log('\n4. Metode selain GET tidak melayani pengiriman');
  const post = await fetch(JALUR, { method: 'POST' });
  cek('POST tidak menjalankan jadwal', post.status !== 200 || !(await post.text()).includes('"ok":true'), `status ${post.status}`);

  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
