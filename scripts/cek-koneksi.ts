/**
 * Uji koneksi cepat ke DATABASE_URL, dengan pesan error lengkap.
 * Jalankan: pnpm exec tsx scripts/cek-koneksi.ts
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ DATABASE_URL tidak ada di environment.');
    process.exit(1);
  }

  // tampilkan bentuk URL tanpa membocorkan password
  const u = new URL(url);
  console.log('host     :', u.hostname);
  console.log('port     :', u.port || '(default)');
  console.log('database :', u.pathname.replace(/^\//, ''));
  console.log('sslmode  :', u.searchParams.get('sslmode') ?? '(tidak diset)');
  console.log('user     :', u.username ? `${u.username.slice(0, 3)}…` : '(kosong)');

  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    const r = await client.query('select version() as v, now() as t');
    console.log('\n✓ TERHUBUNG');
    console.log('  ', String(r.rows[0].v).slice(0, 60));
    console.log('   waktu server:', r.rows[0].t);
  } catch (e) {
    console.error('\n✗ GAGAL:', e instanceof Error ? e.message : e);
    console.error('  code:', (e as { code?: string }).code);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
