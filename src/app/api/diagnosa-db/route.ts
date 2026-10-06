import { NextResponse } from 'next/server';
import { Client } from 'pg';

/**
 * Endpoint diagnosa koneksi database — HANYA untuk memastikan deployment
 * benar-benar memakai database yang dimaksud.
 *
 * Kenapa perlu: kalau aplikasi terhubung ke database yang salah, gejalanya
 * adalah P2021 "table does not exist" — yang tidak memberi tahu kita database
 * MANA yang sebenarnya terpakai. Endpoint ini menjawabnya langsung dari dalam
 * deployment.
 *
 * KEAMANAN: tidak pernah menampilkan password atau URL utuh. Yang ditampilkan
 * hanya host, nama database, daftar tabel, dan jumlah baris — cukup untuk
 * memastikan benar/salah, tidak cukup untuk dipakai menyusup.
 *
 * Hapus endpoint ini setelah masalah selesai (atau lindungi dengan rahasia).
 */
export async function GET() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    return NextResponse.json(
      { ok: false, masalah: 'DATABASE_URL tidak diset di environment ini' },
      { status: 500 }
    );
  }

  let host = '?';
  let database = '?';
  let user = '?';
  let query = '';
  try {
    const u = new URL(url);
    host = u.hostname;
    database = u.pathname.replace(/^\//, '');
    user = u.username;
    // searchParams, bukan .query — properti itu tidak ada di tipe URL
    query = u.searchParams.toString();
  } catch {
    return NextResponse.json(
      { ok: false, masalah: 'DATABASE_URL tidak dapat diurai sebagai URL' },
      { status: 500 }
    );
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 12000 });

  try {
    await client.connect();

    const tabel = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const nama = tabel.rows.map((r) => r.tablename);

    // Penanda yang menentukan: apakah ini database sosmed244 atau bukan
    const punyaPengguna = nama.includes('Pengguna');
    const punyaPegawai = nama.includes('Pegawai'); // khas btn-sip

    let jumlahAkun: number | null = null;
    if (punyaPengguna) {
      const r = await client.query<{ n: string }>(`SELECT COUNT(*) AS n FROM "Pengguna"`);
      jumlahAkun = Number(r.rows[0].n);
    }

    const migrasi = nama.includes('_prisma_migrations')
      ? (await client.query<{ migration_name: string }>(
          `SELECT migration_name FROM _prisma_migrations ORDER BY finished_at`
        )).rows.map((m) => m.migration_name)
      : [];

    return NextResponse.json({
      ok: punyaPengguna && jumlahAkun !== null && jumlahAkun > 0,
      koneksi: { host, database, user, parameter: query },
      tabel: nama,
      diagnosa: punyaPengguna
        ? jumlahAkun === 0
          ? 'Tabel Pengguna ADA, tetapi belum ada akun — jalankan scripts/seed.ts'
          : `SIAP — database sosmed244, ${jumlahAkun} akun tersedia`
        : punyaPegawai
          ? 'SALAH DATABASE — ini database btn-sip (punya tabel Pegawai, bukan Pengguna)'
          : 'SALAH DATABASE — tidak punya tabel Pengguna',
      migrasi,
      versiNode: process.version,
      adaVercelRegion: process.env.VERCEL_REGION ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        koneksi: { host, database, user, parameter: query },
        masalah: e instanceof Error ? e.message : 'gagal terhubung',
        kode: (e as { code?: string }).code ?? null,
      },
      { status: 500 }
    );
  } finally {
    await client.end().catch(() => {});
  }
}
