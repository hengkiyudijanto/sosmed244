import { redirect } from 'next/navigation';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { LABEL_PERAN, KETERANGAN_PERAN, PERAN, boleh } from '@/lib/konten/akses';

export const metadata = { title: 'Pengguna' };

/**
 * Daftar pengguna aplikasi.
 *
 * Halaman ini WAJIB ada karena menu "Pengguna" sudah ditampilkan lewat
 * kemampuan `kelola_pengguna`. Menu yang menunjuk halaman tak ada = 404.
 *
 * Belum ada formulir tambah/ubah pengguna di sini — akun masih dibuat lewat
 * skrip seed. Yang penting halaman ini TIDAK menyesatkan: disebutkan apa adanya
 * apa yang belum bisa dilakukan, bukan menampilkan tombol yang tidak bekerja.
 */
export default async function HalamanPengguna() {
  const saya = await penggunaDariSesi();
  if (!saya) redirect('/masuk');
  if (saya.harusGantiPassword) redirect('/ubah-password');
  if (!boleh(saya.peran, 'kelola_pengguna')) redirect('/');

  const daftar = await prisma.pengguna.findMany({
    select: {
      id: true,
      email: true,
      nama: true,
      peran: true,
      aktif: true,
      harusGantiPassword: true,
      lastLoginAt: true,
      createdAt: true,
      brand: { select: { nama: true, kode: true } },
      _count: { select: { kontenDibuat: true } },
    },
    orderBy: [{ peran: 'asc' }, { nama: 'asc' }],
  });

  const perPeran = PERAN.map((p) => ({
    peran: p,
    jumlah: daftar.filter((d) => d.peran === p).length,
  }));

  return (
    <Kerangka pengguna={saya}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animasi-naik">
          <h1 className="text-2xl font-bold text-abu-900">Pengguna</h1>
          <div className="mt-2 h-0.5 w-10 rounded-full bg-jingga-500" />
          <p className="mt-3 text-sm text-abu-500">
            Siapa saja yang bisa masuk ke aplikasi ini, dan perannya masing-masing.
          </p>
        </div>

        {/* ===== ringkasan peran ===== */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {perPeran.map((p) => (
            <div key={p.peran} className="kartu p-5">
              <div className="label-kolom">{LABEL_PERAN[p.peran]}</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-abu-900">{p.jumlah}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-abu-400">
                {KETERANGAN_PERAN[p.peran]}
              </div>
            </div>
          ))}
        </div>

        {/* ===== tabel ===== */}
        <div className="kartu mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>Peran</th>
                  <th>Brand</th>
                  <th className="text-right">Konten dibuat</th>
                  <th>Status</th>
                  <th>Login terakhir</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-abu-900">{p.nama}</td>
                    <td className="text-xs text-abu-600">{p.email}</td>
                    <td>
                      <span className="rounded-full bg-biru-100 px-2.5 py-1 text-[11px] font-medium text-biru-700">
                        {LABEL_PERAN[p.peran]}
                      </span>
                    </td>
                    <td className="text-xs text-abu-600">{p.brand?.kode ?? '—'}</td>
                    <td className="text-right text-xs tabular-nums text-abu-600">
                      {p._count.kontenDibuat}
                    </td>
                    <td className="text-xs">
                      {!p.aktif ? (
                        <span className="text-bahaya">nonaktif</span>
                      ) : p.harusGantiPassword ? (
                        <span className="text-peringatan">wajib ganti password</span>
                      ) : (
                        <span className="text-sukses">aktif</span>
                      )}
                    </td>
                    <td className="text-xs tabular-nums text-abu-400">
                      {p.lastLoginAt ? p.lastLoginAt.toLocaleString('id-ID') : 'belum pernah'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== apa yang belum bisa dilakukan ===== */}
        <div className="kartu mt-5 border-l-[3px] border-peringatan p-5">
          <h2 className="mb-2 text-sm font-semibold text-peringatan">Belum tersedia di halaman ini</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-abu-700">
            <li>
              <strong>Tambah / ubah pengguna lewat antarmuka.</strong> Akun sekarang dibuat
              lewat skrip (<code className="font-mono">scripts/seed.ts</code>) atau langsung di
              database. Menu ini masih hanya untuk melihat.
            </li>
            <li>
              <strong>Reset password.</strong> Kalau ada yang lupa password, sementara ini harus
              dilakukan lewat skrip/database.
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-abu-500">
            Sengaja ditulis apa adanya supaya tidak ada tombol yang tampak bisa diklik tetapi
            tidak bekerja.
          </p>
        </div>
      </div>
    </Kerangka>
  );
}
