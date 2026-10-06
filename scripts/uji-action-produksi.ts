/**
 * Memanggil server action `masuk` di URL mana pun dengan protokol yang BENAR.
 *
 * Kenapa perlu skrip ini: `curl` biasa TIDAK benar-benar memanggil server action.
 * Server action Next di panggil lewat POST dengan header `Next-Action` berisi id
 * action, dan id itu di-embed di HTML halaman (sebagai $ACTION_ID_... di bundel
 * klien). Tanpa header itu, POST hanya menghasilkan render halaman biasa — yang
 * selalu 200, sehingga tampak "berhasil" padahal action-nya tidak pernah jalan.
 *
 * Inilah sebabnya pengujian dengan curl sempat menyesatkan: 200 di sana tidak
 * berarti login berhasil.
 *
 * Jalankan:
 *   pnpm exec tsx scripts/uji-action-produksi.ts https://sosmed244.vercel.app
 */
import 'dotenv/config';

const BASIS = process.argv[2] ?? 'https://sosmed244.vercel.app';
const email = process.argv[3] ?? 'kreator@sosmed244.local';
const password = process.argv[4] ?? 'Sosmed244Admin!';

/** Ambil id server action untuk form login dari bundel klien. */
async function cariActionId(): Promise<string | null> {
  const html = await fetch(`${BASIS}/masuk`).then((r) => r.text());

  // 1) cara paling langsung: id action tertanam di HTML sebagai $ACTION_ID_<hex>
  const langsung = html.match(/\$ACTION_ID_([a-f0-9]{40,})/);
  if (langsung) return langsung[1];

  // 2) kalau tidak ada, id-nya ada di berkas JS yang direferensikan halaman
  const skrip = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  for (const s of skrip.slice(0, 12)) {
    const url = s.startsWith('http') ? s : `${BASIS}${s}`;
    try {
      const isi = await fetch(url).then((r) => r.text());
      const cocok = isi.match(/[a-f0-9]{40,}/g);
      if (cocok) {
        // id action biasanya yang muncul berdampingan dengan nama fungsi "masuk"
        const sekitar = isi.match(/masuk[^a-f0-9]{0,80}([a-f0-9]{40,})/);
        if (sekitar) return sekitar[1];
        return cocok[0];
      }
    } catch {
      /* lanjut ke berkas berikutnya */
    }
  }
  return null;
}

async function main() {
  console.log('=== UJI SERVER ACTION PRODUKSI ===');
  console.log('basis :', BASIS);
  console.log('email :', email);

  const actionId = await cariActionId();
  if (!actionId) {
    console.error('\n✗ Tidak menemukan id server action di halaman /masuk.');
    console.error('  Tanpa id ini, action tidak bisa dipanggil dari luar.');
    process.exit(1);
  }
  console.log('action:', actionId.slice(0, 16) + '…');

  const body = new FormData();
  body.set('email', email);
  body.set('password', password);

  const r = await fetch(`${BASIS}/masuk`, {
    method: 'POST',
    headers: {
      'Next-Action': actionId,
      // server action mengharapkan multipart/form-data
      Accept: 'text/x-component',
    },
    body,
    redirect: 'manual',
  });

  console.log('\nstatus:', r.status);
  const setCookie = r.headers.getSetCookie?.() ?? [];
  console.log('set-cookie:', setCookie.length ? setCookie.map((c) => c.split('=')[0]).join(', ') : '(tidak ada)');

  const isi = await r.text();

  // Cari petunjuk di badan respons
  const petunjuk: string[] = [];
  if (/sosmed244_sesi/.test(setCookie.join(' '))) petunjuk.push('COOKIE SESI DIBUAT → login berhasil');
  if (/Email atau password salah/.test(isi)) petunjuk.push('kredensial ditolak (akun/password tidak cocok)');
  if (/Akun tidak aktif/.test(isi)) petunjuk.push('akun nonaktif');
  if (/server error|couldn't load|Internal Server Error/i.test(isi)) petunjuk.push('ERROR SERVER di dalam action');
  if (/DATABASE_URL/.test(isi)) petunjuk.push('DATABASE_URL bermasalah');
  if (/authentication failed|28P01/.test(isi)) petunjuk.push('kredensial database ditolak (28P01)');
  if (/Can't reach|P1001|ENOTFOUND/.test(isi)) petunjuk.push('database tidak terjangkau dari Vercel');
  if (/does not exist|P2021/.test(isi)) petunjuk.push('TABEL TIDAK ADA → migrasi belum dijalankan');

  console.log('\n=== PETUNJUK ===');
  console.log(petunjuk.length ? petunjuk.map((p) => '  • ' + p).join('\n') : '  (tidak ada petunjuk yang dikenali)');

  console.log('\n=== 400 KARAKTER PERTAMA RESPONS ===');
  console.log(isi.slice(0, 400).replace(/\s+/g, ' '));
}

main().catch((e) => {
  console.error('gagal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
