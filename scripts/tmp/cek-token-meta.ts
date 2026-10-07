/**
 * PERIKSA TOKEN META dari Graph API Explorer — bertahap, tanpa pernah
 * mencetak tokennya.
 *
 * Yang diperiksa dan KENAPA berurutan begini: setiap langkah bisa gagal dengan
 * sebab yang berbeda, dan pesan gagalnya berbeda-beda. Menjalankan semuanya
 * sekaligus membuat penyebabnya kabur. Jadi:
 *
 *   1. Tokennya masih hidup?            → kalau mati, sisanya tidak ada gunanya
 *   2. Tokenku punya izin apa saja?     → izin kurang = gagal di langkah 4
 *   3. Halaman apa saja yang bisa kubuka? → `me/accounts`
 *   4. Halaman mana yang punya akun IG? → di sinilah ID Instagram ditemukan
 *
 * Token dibaca dari environment variable, TIDAK dari argumen: argumen terlihat
 * di daftar proses dan riwayat shell. Skrip ini juga tidak pernah mencetak
 * tokennya, hanya panjang dan potongan kecil untuk memastikan yang dibaca benar.
 *
 * Jalankan: SOSMED_TOKEN_UJI="<token>" pnpm exec tsx scripts/tmp/cek-token-meta.ts
 */

const token = process.env.SOSMED_TOKEN_UJI;
const VERSI = process.env.SOSMED_VERSI ?? 'v21.0';

if (!token) {
  console.error('❌ SOSMED_TOKEN_UJI belum diset.');
  process.exit(1);
}

/** Potongan aman untuk ditampilkan: awal saja, sisanya disamarkan. */
const aman = (s: string) => `${s.slice(0, 6)}…(${s.length} karakter)`;

async function ambil(jalur: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${VERSI}/${jalur}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token!);

  const r = await fetch(url, { method: 'GET' });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, status: r.status, isi: j };
}

function galat(isi: Record<string, unknown>): string {
  const e = isi.error as { message?: string; code?: number; type?: string } | undefined;
  if (!e) return JSON.stringify(isi).slice(0, 300);
  return `${e.message ?? 'tanpa pesan'} (code ${e.code ?? '?'}, ${e.type ?? '?'})`;
}

async function main() {
  console.log('=== PERIKSA TOKEN META ===');
  console.log(`token dibaca: ${aman(token!)}\n`);

  // ===== 1. Token masih hidup? =====
  console.log('1. Token masih berlaku?');
  const me = await ambil('me', { fields: 'id,name' });
  if (!me.ok) {
    console.log(`   ✗ GAGAL: ${galat(me.isi)}`);
    console.log('\n   → Token tidak bisa dipakai. Kemungkinan: sudah lewat 1 jam,');
    console.log('     atau belum dicentang izinnya di Graph API Explorer.');
    return;
  }
  console.log(`   ✓ hidup — akun: ${(me.isi as { name?: string }).name ?? '?'}`);

  // ===== 2. Izin yang dimiliki =====
  console.log('\n2. Izin yang dimiliki token ini');
  const izin = await ambil('me/permissions');
  const daftar = ((izin.isi as { data?: { permission: string; status: string }[] }).data ?? [])
    .filter((p) => p.status === 'granted')
    .map((p) => p.permission);
  console.log(`   ${daftar.length} izin granted: ${daftar.join(', ') || '(kosong)'}`);

  const dibutuhkan = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ];
  const kurang = dibutuhkan.filter((d) => !daftar.includes(d));
  if (kurang.length) {
    console.log(`   ⚠ KURANG: ${kurang.join(', ')}`);
    console.log('   → Centang izin itu di panel Permissions Graph API Explorer,');
    console.log('     lalu sambungkan ulang (jangan pakai token lama ini).');
  } else {
    console.log('   ✓ semua izin yang dibutuhkan ada');
  }

  // ===== 3. Halaman apa saja yang bisa dibuka =====
  console.log('\n3. Facebook Page yang bisa dibuka token ini');
  const akun = await ambil('me/accounts', { fields: 'id,name,instagram_business_account' });
  if (!akun.ok) {
    console.log(`   ✗ GAGAL: ${galat(akun.isi)}`);
    console.log('\n   → Biasanya izin pages_show_list belum ada.');
    return;
  }
  const halaman = ((akun.isi as { data?: Record<string, unknown>[] }).data ?? []) as {
    id: string;
    name: string;
    instagram_business_account?: { id: string };
  }[];

  if (!halaman.length) {
    console.log('   ✗ Tidak ada halaman sama sekali.');
    console.log('\n   → Token ini tidak punya akses ke Facebook Page mana pun.');
    console.log('     Pastikan kamu login sebagai admin halamannya.');
    return;
  }

  const tertaut = halaman.filter((h) => h.instagram_business_account?.id);
  for (const h of halaman) {
    console.log(
      `   • ${h.name}  id=${h.id}  →  ${
        h.instagram_business_account?.id
          ? `akun IG: ${h.instagram_business_account.id}`
          : 'TIDAK ada akun Instagram tertaut'
      }`
    );
  }

  // ===== 4. Kesimpulan =====
  console.log('\n=== KESIMPULAN ===');
  if (!tertaut.length) {
    console.log('✗ Ada halaman, tetapi TIDAK ADA akun Instagram yang tertaut ke halaman itu.');
    console.log('');
    console.log('  Inilah yang tadi saya sebut gagal-diam-diam: tokennya sah, halamannya');
    console.log('  ketemu, tapi akun IG-nya tidak ada. Pengiriman nanti akan gagal dengan');
    console.log('  pesan yang membingungkan.');
    console.log('');
    console.log('  Perbaikan: tautkan dulu akun Instagram ke halaman itu');
    console.log('  (Instagram → Edit Profil → tautkan halaman, atau dari Pengaturan halaman).');
    return;
  }

  console.log(`✓ Jalur Facebook Login SIAP. ${tertaut.length} halaman punya akun IG tertaut.`);
  const target = tertaut[0];
  console.log('');
  console.log('  Nilai yang dipakai aplikasi (bukan rahasia):');
  console.log(`    sosmed_ig_user_id : ${target.instagram_business_account!.id}`);
  console.log(`    halaman           : ${target.name}`);
  console.log('');
  console.log('  Token tetap TIDAK dicetak. Ambil Page Access Token-nya dari Explorer');
  console.log('  (pilih halaman di dropdown "User or Page"), lalu simpan dengan');
  console.log('  scripts/simpan-token.ts agar masa berlakunya ikut tersimpan.');
}

main().catch((e) => {
  console.error('❌ kesalahan tidak terduga:', e instanceof Error ? e.message : e);
  process.exit(1);
});
