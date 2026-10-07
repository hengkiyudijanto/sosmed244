/**
 * UJI TOKEN TERSIMPAN terhadap Meta — memastikan token yang ada di database
 * benar-benar bisa dipakai MENGIRIM, bukan hanya tersimpan.
 *
 * Kenapa dipisah dari uji lain: "token tersimpan" dan "token bisa menerbitkan
 * konten" adalah dua hal berbeda. Token bisa sah tapi tidak punya izin publish,
 * dan itu baru ketahuan saat mencoba. Di sini diperiksa bertahap:
 *
 *   1. token masih hidup (GET /me)
 *   2. izin yang dimiliki token
 *   3. akun Instagram terbaca lewat ID yang dikonfigurasi
 *   4. KUOTA penerbitan hari ini (content_publishing_limit)
 *
 * Langkah 4 itu yang paling informatif: endpoint-nya hanya bisa dijawab kalau
 * izin instagram_content_publish benar-benar berlaku, jadi jawaban sukses di
 * langkah ini praktis membuktikan jalur penerbitan terbuka.
 *
 * TIDAK mengirim konten apa pun. Hanya membaca.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const p = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)!,
  }),
});

const VERSI = process.env.SOSMED_IG_API_VERSI ?? 'v26.0';
const IG_USER_ID = process.env.SOSMED_IG_USER_ID;

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
  console.log('=== UJI TOKEN TERSIMPAN TERHADAP META ===\n');

  if (!IG_USER_ID) {
    console.log('❌ SOSMED_IG_USER_ID belum diset di .env.local');
    process.exit(1);
  }

  const tersimpan = await p.tokenPlatform.findUnique({ where: { platform: 'INSTAGRAM' } });
  if (!tersimpan?.accessToken) {
    console.log('❌ Token Instagram belum tersimpan di database.');
    process.exit(1);
  }
  const token = tersimpan.accessToken;
  console.log(`  token: ${token.slice(0, 8)}… (${token.length} karakter)`);
  console.log(`  ig user id: ${IG_USER_ID}\n`);

  const dasar = `https://graph.facebook.com/${VERSI}`;
  const panggil = async (jalur: string, params: Record<string, string> = {}) => {
    const url = new URL(`${dasar}/${jalur}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', token);
    const r = await fetch(url);
    return { ok: r.ok, status: r.status, isi: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const pesanGalat = (isi: Record<string, unknown>) => {
    const e = isi.error as { message?: string; code?: number } | undefined;
    return e ? `${e.message ?? '?'} (code ${e.code ?? '?'})` : JSON.stringify(isi).slice(0, 200);
  };

  // ===== 1 =====
  console.log(`1. Token hidup di ${VERSI}?`);
  const me = await panggil('me', { fields: 'id,name' });
  cek(
    'token diterima Meta',
    me.ok,
    me.ok ? undefined : pesanGalat(me.isi)
  );
  if (me.ok) console.log(`     nama: ${(me.isi as { name?: string }).name ?? '?'}`);

  // ===== 2 =====
  console.log('\n2. Izin pada token ini');
  const izin = await panggil('me/permissions');
  const granted = ((izin.isi as { data?: { permission: string; status: string }[] }).data ?? [])
    .filter((x) => x.status === 'granted')
    .map((x) => x.permission);

  /**
   * CATATAN PENTING: daftar ini TIDAK bisa dipakai sebagai bukti untuk Page
   * Access Token. Halaman membawa izin yang diwariskan dari user token, dan
   * warisan itu TIDAK tampil di `me/permissions` milik token halaman — daftar
   * di sini bisa kosong atau hanya berisi izin halaman (`pages_*`) meski izin
   * penerbitan Instagram sebenarnya BERLAKU.
   *
   * Karena itu hasilnya dilaporkan sebagai keterangan, dan bukti yang
   * sesungguhnya diambil dari langkah 4: `content_publishing_limit` hanya bisa
   * dijawab kalau izin `instagram_content_publish` benar-benar berlaku.
   */
  console.log(`     ${granted.length} izin terlihat: ${granted.join(', ') || '(kosong — wajar untuk Page Access Token)'}`);
  if (granted.length === 0 || !granted.some((g) => g.startsWith('instagram_'))) {
    console.log('     (ketiadaan izin instagram_* di sini BUKAN tanda masalah — lihat langkah 4)');
  }

  // ===== 3 =====
  console.log('\n3. Akun Instagram terbaca lewat ID di konfigurasi?');
  const ig = await panggil(IG_USER_ID, { fields: 'id,username,name' });
  cek(
    'akun Instagram ditemukan',
    ig.ok && (ig.isi as { id?: string }).id === IG_USER_ID,
    ig.ok ? `id=${(ig.isi as { id?: string }).id}` : pesanGalat(ig.isi)
  );
  if (ig.ok) {
    const u = ig.isi as { username?: string; name?: string };
    console.log(`     username: @${u.username ?? '?'}  (${u.name ?? '?'})`);
  }

  // ===== 4 =====
  console.log('\n4. Kuota penerbitan hari ini');
  const kuota = await panggil(`${IG_USER_ID}/content_publishing_limit`, { fields: 'quota_usage,config' });
  if (kuota.ok) {
    const data = (kuota.isi as { data?: { quota_usage?: number; config?: { quota_total?: number } }[] }).data?.[0];
    console.log(`     terpakai: ${data?.quota_usage ?? '?'} dari ${data?.config?.quota_total ?? '?'}`);
    cek('kuota penerbitan bisa dibaca (izin publish berlaku)', true);
  } else {
    cek('kuota penerbitan bisa dibaca (izin publish berlaku)', false, pesanGalat(kuota.isi));
  }

  console.log(`\n=== HASIL: ${lulus} lulus, ${gagal} gagal ===`);
  if (gagal > 0) {
    console.log('\nCatatan: kegagalan di langkah 3 biasanya berarti token BUKAN untuk');
    console.log('halaman itu, atau ID akun Instagram-nya salah.');
  }
  process.exit(gagal > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => p.$disconnect());
