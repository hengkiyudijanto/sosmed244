import { redirect } from 'next/navigation';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { LABEL_PERAN, KETERANGAN_PERAN, PERAN, boleh } from '@/lib/konten/akses';
import { daftarBrand } from '@/app/actions/pengguna';
import { FormTambahPengguna, AksiPengguna } from '@/components/kelola-pengguna';

export const metadata = { title: 'Pengguna' };

/**
 * Kelola pengguna: lihat, tambah, ubah, reset password, aktif/nonaktif/hapus.
 *
 * Penjagaan penting — ditegakkan di SERVER ACTION, bukan hanya di tampilan:
 *  - admin tidak bisa menonaktifkan / menurunkan peran / menghapus dirinya sendiri
 *  - administrator aktif terakhir tidak bisa dihapus atau dinonaktifkan
 *  - pengguna yang sudah punya jejak (konten/keputusan) dinonaktifkan, bukan dihapus,
 *    supaya riwayat approval tidak kehilangan pelakunya
 */
export default async function HalamanPengguna() {
  const saya = await penggunaDariSesi();
  if (!saya) redirect('/masuk');
  if (saya.harusGantiPassword) redirect('/ubah-password');
  if (!boleh(saya.peran, 'kelola_pengguna')) redirect('/');

  const [daftar, brand] = await Promise.all([
    prisma.pengguna.findMany({
      select: {
        id: true,
        email: true,
        nama: true,
        peran: true,
        aktif: true,
        harusGantiPassword: true,
        lastLoginAt: true,
        brandId: true,
        brand: { select: { nama: true, kode: true } },
        _count: { select: { kontenDibuat: true, keputusan: true } },
      },
      orderBy: [{ aktif: 'desc' }, { peran: 'asc' }, { nama: 'asc' }],
    }),
    daftarBrand(),
  ]);

  const jumlahAdministratorAktif = daftar.filter((d) => d.peran === 'ADMIN' && d.aktif).length;

  return (
    <Kerangka pengguna={saya}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animasi-naik flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-kolom">Pengguna</p>
            <h1 className="huruf-judul mt-2 text-3xl text-mint sm:text-4xl">Kelola akses</h1>
            <p className="mt-3 text-sm leading-relaxed text-teks-2">
              Kelola siapa yang bisa masuk ke aplikasi ini beserta perannya.
            </p>
          </div>
          <FormTambahPengguna daftarBrand={brand} />
        </div>

        {/* ===== ringkasan peran ===== */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {PERAN.map((p) => {
            const jumlah = daftar.filter((d) => d.peran === p).length;
            return (
              <div key={p} className="kartu p-5">
                <div className="label-kolom">{LABEL_PERAN[p]}</div>
                <div className="mt-1.5 text-3xl font-extrabold tabular-nums text-mint">{jumlah}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-teks-3">
                  {KETERANGAN_PERAN[p]}
                </div>
              </div>
            );
          })}
        </div>

        {jumlahAdministratorAktif <= 1 && (
          <div className="mt-5 border-l-2 border-tunggu bg-tunggu-bg px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-tunggu">
              Hanya ada {jumlahAdministratorAktif} administrator aktif
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-teks-2">
              Akun administrator terakhir tidak dapat dihapus atau dinonaktifkan — kalau tidak,
              pengaturan aplikasi tidak bisa dibuka siapa pun. Tambahkan administrator lain sebelum
              mengubah yang ini.
            </p>
          </div>
        )}

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
                  <th className="text-right">Konten</th>
                  <th>Status</th>
                  <th>Login terakhir</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-mint">
                      {p.nama}
                      {p.id === saya.id && (
                        <span className="ml-2 bg-aksen-pudar px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-aksen">
                          Anda
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-teks-2">{p.email}</td>
                    <td>
                      <span className="rounded-full bg-aksen-pudar px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-aksen">
                        {LABEL_PERAN[p.peran]}
                      </span>
                    </td>
                    <td className="text-xs text-teks-2">{p.brand?.kode ?? '—'}</td>
                    <td className="text-right text-xs tabular-nums text-teks-2">
                      {p._count.kontenDibuat}
                      {p._count.keputusan > 0 && (
                        <span
                          className="ml-1 text-teks-3"
                          title={`${p._count.keputusan} keputusan approval`}
                        >
                          /{p._count.keputusan}
                        </span>
                      )}
                    </td>
                    <td className="text-xs">
                      {!p.aktif ? (
                        <span className="font-semibold text-buruk">nonaktif</span>
                      ) : p.harusGantiPassword ? (
                        <span className="font-semibold text-tunggu">wajib ganti password</span>
                      ) : (
                        <span className="font-semibold text-aksen">aktif</span>
                      )}
                    </td>
                    <td className="text-xs tabular-nums text-teks-3">
                      {p.lastLoginAt ? p.lastLoginAt.toLocaleString('id-ID') : 'belum pernah'}
                    </td>
                    <td>
                      <AksiPengguna
                        pengguna={{
                          id: p.id,
                          nama: p.nama,
                          email: p.email,
                          peran: p.peran,
                          aktif: p.aktif,
                          harusGantiPassword: p.harusGantiPassword,
                          brandId: p.brandId,
                          jumlahKonten: p._count.kontenDibuat,
                          jumlahKeputusan: p._count.keputusan,
                        }}
                        daftarBrand={brand}
                        sayaId={saya.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-teks-3">
          Kolom <strong className="text-mint">Konten</strong> menampilkan <em>jumlah konten</em> /{' '}
          <em>jumlah keputusan approval</em>. Pengguna yang sudah punya keduanya akan{' '}
          <strong>dinonaktifkan, bukan dihapus</strong> — supaya riwayat approval tetap menunjukkan
          siapa pelakunya.
        </p>
      </div>
    </Kerangka>
  );
}
