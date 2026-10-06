/**
 * Membandingkan database mana yang dipakai, dan apakah sudah bermigrasi.
 *
 * Konteks nyata: produksi Vercel mengembalikan P2021 "table public.Pengguna
 * does not exist". Itu berarti aplikasi terhubung ke database yang BELUM
 * dimigrasi — bukan database yang sudah kita siapkan. Skrip ini memeriksa
 * beberapa kandidat koneksi sekaligus supaya bedanya terlihat langsung.
 *
 * Jalankan:
 *   pnpm exec tsx scripts/banding-database.ts
 */
import 'dotenv/config';
import { Client } from 'pg';

type Kandidat = { label: string; url: string };

function kandidat(): Kandidat[] {
  const daftar: Kandidat[] = [];

  const tambah = (label: string, url?: string) => {
    if (url && url.startsWith('postgres')) daftar.push({ label, url });
  };

  // dari environment yang tersedia
  tambah('env DATABASE_URL', process.env.DATABASE_URL);
  tambah('env DATABASE_URL_UNPOOLED', process.env.DATABASE_URL_UNPOOLED);

  // dari argumen CLI: --url "postgresql://..."
  const idx = process.argv.indexOf('--url');
  if (idx >= 0) tambah('argumen --url', process.argv[idx + 1]);

  return daftar;
}

async function periksa(k: Kandidat) {
  const u = new URL(k.url);
  console.log(`\n=== ${k.label} ===`);
  console.log(`  host   : ${u.hostname}`);
  console.log(`  user   : ${u.username}`);
  console.log(`  db     : ${u.pathname.replace(/^\//, '')}`);
  console.log(`  query  : ${u.searchParams.toString() || '(kosong)'}`);

  const c = new Client({ connectionString: k.url, connectionTimeoutMillis: 15000 });
  try {
    await c.connect();

    const tabel = await c.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const nama = tabel.rows.map((r) => r.tablename);

    if (nama.length === 0) {
      console.log('  TABEL  : (KOSONG — database ini belum dimigrasi)');
    } else {
      console.log(`  TABEL  : ${nama.join(', ')}`);
    }

    const punyaPengguna = nama.includes('Pengguna');
    if (punyaPengguna) {
      const n = await c.query<{ n: string }>(`SELECT COUNT(*) AS n FROM "Pengguna"`);
      console.log(`  AKUN   : ${n.rows[0].n}`);
      const mig = nama.includes('_prisma_migrations')
        ? await c.query<{ migration_name: string }>(
            `SELECT migration_name FROM _prisma_migrations ORDER BY finished_at`
          )
        : { rows: [] };
      console.log(`  MIGRASI: ${mig.rows.map((m) => m.migration_name).join(', ') || '(tidak ada)'}`);
    } else {
      console.log('  AKUN   : — (tabel Pengguna tidak ada)');
    }
  } catch (e) {
    console.log(`  ✗ GAGAL: ${e instanceof Error ? e.message : e}`);
    const code = (e as { code?: string }).code;
    if (code) console.log(`    kode: ${code}`);
  } finally {
    await c.end().catch(() => {});
  }
}

async function main() {
  const daftar = kandidat();
  if (daftar.length === 0) {
    console.error('Tidak ada kandidat koneksi. Isi .env.local atau pakai --url.');
    process.exit(1);
  }
  console.log('=== BANDING DATABASE ===');
  for (const k of daftar) await periksa(k);
  console.log('\n=== CARA BACA HASIL ===');
  console.log('  Database yang DIPAKAI aplikasi harus punya tabel Pengguna + akun.');
  console.log('  Kalau Vercel memberi P2021, berarti env di Vercel menunjuk ke database');
  console.log('  yang tabel-nya kosong (belum dimigrasi).');
}

main();
