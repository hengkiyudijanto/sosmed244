import { redirect } from 'next/navigation';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { boleh } from '@/lib/konten/akses';

export const metadata = { title: 'Audit' };

/**
 * Audit log — jejak siapa melakukan apa.
 *
 * Halaman ini WAJIB ada karena menu "Audit" sudah ditampilkan lewat kemampuan
 * `lihat_audit`. Menu yang menunjuk ke halaman tak ada = 404, dan itu kesalahan
 * yang nyata terjadi sebelumnya.
 *
 * Yang ditampilkan sengaja ringkas: waktu, pelaku, aksi, dan entitas. Isi
 * `dataLama`/`dataBaru` tidak dibuka di sini karena bisa memuat isi konten.
 */
export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ aksi?: string; cari?: string }>;
}) {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');
  if (pengguna.harusGantiPassword) redirect('/ubah-password');
  if (!boleh(pengguna.peran, 'lihat_audit')) redirect('/');

  const sp = await searchParams;
  const aksi = (sp.aksi ?? '').trim();
  const cari = (sp.cari ?? '').trim();

  const [daftar, semuaAksi, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(aksi ? { aksi } : {}),
        ...(cari
          ? {
              OR: [
                { aksi: { contains: cari, mode: 'insensitive' } },
                { entitas: { contains: cari, mode: 'insensitive' } },
                { pengguna: { nama: { contains: cari, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: { pengguna: { select: { nama: true, email: true, peran: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.auditLog.groupBy({ by: ['aksi'], _count: true, orderBy: { _count: { aksi: 'desc' } } }),
    prisma.auditLog.count(),
  ]);

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animasi-naik">
          <p className="label-kolom">Audit</p>
          <h1 className="huruf-judul mt-2 text-3xl text-mint sm:text-4xl">Jejak tindakan</h1>
          <p className="mt-3 text-sm leading-relaxed text-teks-2">
            Jejak tindakan yang pernah dilakukan di aplikasi ini — untuk menelusuri
            siapa mengubah atau mengirim konten.
          </p>
        </div>

        {/* ===== filter ===== */}
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <a
            href="/audit"
            className={`rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${ !aksi
                ? 'border-mint bg-mint text-teal'
                : 'border-garis text-teks-2 hover:bg-mint-panel'
            }`}
          >
            Semua <span className="tabular-nums opacity-70">({total})</span>
          </a>
          {semuaAksi.slice(0, 8).map((a) => (
            <a
              key={a.aksi}
              href={`/audit?aksi=${encodeURIComponent(a.aksi)}`}
              className={`rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${ aksi === a.aksi
                  ? 'border-mint bg-mint text-teal'
                  : 'border-garis text-teks-2 hover:bg-mint-panel'
              }`}
            >
              {a.aksi} <span className="tabular-nums opacity-70">({a._count})</span>
            </a>
          ))}

          <form action="/audit" className="ml-auto flex gap-2">
            {aksi && <input type="hidden" name="aksi" value={aksi} />}
            <input
              name="cari"
              defaultValue={cari}
              placeholder="Cari nama, aksi, atau entitas…"
              className="input w-56 text-xs"
            />
            <button type="submit" className="tombol tombol-sekunder text-xs">
              Cari
            </button>
          </form>
        </div>

        {/* ===== tabel ===== */}
        {daftar.length === 0 ? (
          <div className="kartu mt-4 p-10 text-center">
            <p className="text-sm text-teks-2">
              {cari || aksi ? 'Tidak ada catatan yang cocok dengan filter ini.' : 'Belum ada catatan.'}
            </p>
          </div>
        ) : (
          <div className="kartu mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Pelaku</th>
                    <th>Aksi</th>
                    <th>Entitas</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {daftar.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap text-xs tabular-nums text-teks-3">
                        {a.createdAt.toLocaleString('id-ID')}
                      </td>
                      <td className="text-xs">
                        {a.pengguna ? (
                          <>
                            <span className="font-medium text-mint">{a.pengguna.nama}</span>
                            <span className="block text-[10px] uppercase tracking-[0.1em] text-teks-3">
                              {a.pengguna.peran}
                            </span>
                          </>
                        ) : (
                          <span className="text-teks-3">(tidak dikenal)</span>
                        )}
                      </td>
                      <td>
                        <span className="bg-netral-bg px-2 py-0.5 font-mono text-[11px] text-mint">
                          {a.aksi}
                        </span>
                      </td>
                      <td className="text-xs text-teks-2">{a.entitas ?? '—'}</td>
                      <td className="max-w-[280px] text-xs text-teks-3">
                        {ringkasData(a.dataBaru)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-3 text-[11px] text-teks-3">
          Menampilkan {daftar.length} dari {total} catatan.
        </p>
      </div>
    </Kerangka>
  );
}

/**
 * Ringkasan isi `dataBaru` untuk kolom keterangan.
 * Sengaja hanya mengambil beberapa kunci yang aman dibaca — isi konten penuh
 * tidak ditampilkan di daftar.
 */
function ringkasData(data: unknown): string {
  if (!data || typeof data !== 'object') return '—';
  const o = data as Record<string, unknown>;
  const penting = ['judul', 'status', 'catatan', 'alasan', 'nip', 'email', 'nama', 'modus'];
  const bagian = penting
    .filter((k) => o[k] !== undefined && o[k] !== null)
    .map((k) => `${k}: ${String(o[k]).slice(0, 40)}`);
  return bagian.length ? bagian.join(' · ') : '—';
}
