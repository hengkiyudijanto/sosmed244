import { redirect } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { AksiKonten } from '@/components/aksi-konten';
import { boleh } from '@/lib/konten/akses';
import { periksaKelayakan, LABEL_STATUS, WARNA_STATUS, type Status, type Tujuan } from '@/lib/konten/status';
import { formatUkuran } from '@/lib/konten/media';

export const metadata = { title: 'Persetujuan' };

/**
 * Halaman kerja penyetuju.
 *
 * Dua daftar saja: yang menunggu keputusan SAYA, dan riwayat yang sudah saya
 * putuskan. Konten yang menunggu penyetuju LAIN tidak ditampilkan — bukan
 * disembunyikan, tetapi memang bukan tugas saya.
 */
export default async function Persetujuan() {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');
  if (pengguna.harusGantiPassword) redirect('/ubah-password');
  if (!boleh(pengguna.peran, 'setujui_konten')) redirect('/konten');

  const [menunggu, diputus] = await Promise.all([
    prisma.konten.findMany({
      where: { status: 'MENUNGGU', penyetujuId: pengguna.id },
      include: {
        pembuat: { select: { nama: true, email: true } },
      },
      orderBy: { diajukanAt: 'asc' },
    }),
    prisma.konten.findMany({
      where: {
        penyetujuId: pengguna.id,
        status: { in: ['DISETUJUI', 'DIJADWALKAN', 'DIKIRIM', 'REVISI'] },
        diputusAt: { not: null },
      },
      include: { pembuat: { select: { nama: true } } },
      orderBy: { diputusAt: 'desc' },
      take: 30,
    }),
  ]);

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animasi-naik">
          <h1 className="text-2xl font-bold text-abu-900">Persetujuan</h1>
          <div className="mt-2 h-0.5 w-10 rounded-full bg-logo-merah" />
          <p className="mt-3 text-sm text-abu-500">
            Tinjau konten yang diajukan kepada Anda. Setujui untuk meneruskan ke pengiriman, atau
            minta revisi dengan alasan yang jelas.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="kartu p-5">
            <div className="label-kolom">Menunggu keputusan Anda</div>
            <div className={`mt-1.5 text-2xl font-bold ${menunggu.length > 0 ? 'text-peringatan' : 'text-abu-900'}`}>
              {menunggu.length}
            </div>
            <div className="mt-0.5 text-xs text-abu-400">konten</div>
          </div>
          <div className="kartu p-5">
            <div className="label-kolom">Sudah Anda putuskan</div>
            <div className="mt-1.5 text-2xl font-bold text-abu-900">{diputus.length}</div>
            <div className="mt-0.5 text-xs text-abu-400">30 keputusan terakhir</div>
          </div>
          <div className="kartu p-5">
            <div className="label-kolom">Tugas Anda</div>
            <div className="mt-1.5 text-base font-semibold text-abu-900">
              {menunggu.length === 0 ? 'Tidak ada' : `${menunggu.length} konten`}
            </div>
            <div className="mt-0.5 text-xs text-abu-400">sebagai penyetuju</div>
          </div>
        </div>

        <h2 className="mb-3 mt-8 text-sm font-semibold text-abu-700">Menunggu keputusan Anda</h2>

        {menunggu.length === 0 ? (
          <div className="kartu p-10 text-center">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-sukses-bg">
              <svg className="h-6 w-6 text-sukses" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-sm text-abu-500">Tidak ada konten yang menunggu persetujuan Anda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {menunggu.map((k) => {
              const masalah = periksaKelayakan({
                tujuan: k.tujuan as Tujuan,
                jenis: k.jenis as 'GAMBAR' | 'VIDEO',
                caption: k.caption,
                ukuranByte: k.mediaByte ?? 0,
                mime: k.mediaMime ?? '',
                durasiDetik: k.durasiDetik,
              });

              return (
                <div key={k.id} className="kartu p-6">
                  <div className="flex flex-wrap gap-5">
                    <div className="shrink-0">
                      <div className="flex h-[190px] w-[150px] items-center justify-center overflow-hidden rounded-lg border border-abu-200 bg-abu-50">
                        {k.mediaData ? (
                          k.jenis === 'VIDEO' ? (
                            <span className="text-[11px] text-abu-500">▶ Video</span>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/media/${k.id}?v=${k.versiMedia}`}
                              alt={k.judul}
                              className="h-full w-full object-cover"
                            />
                          )
                        ) : (
                          <span className="text-[11px] text-abu-400">Tanpa berkas</span>
                        )}
                      </div>
                      {k.mediaByte && (
                        <p className="mt-1 text-center text-[10px] tabular-nums text-abu-400">
                          {formatUkuran(k.mediaByte)}
                          {k.durasiDetik ? ` · ${Math.round(k.durasiDetik)} dtk` : ''}
                        </p>
                      )}
                    </div>

                    <div className="min-w-[260px] flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Link
                          href={`/konten/${k.id}`}
                          className="text-base font-bold text-abu-900 hover:text-biru-700"
                        >
                          {k.judul}
                        </Link>
                        <span className="text-xs text-abu-400">oleh {k.pembuat.nama}</span>
                        {k.jumlahRevisi > 0 && (
                          <span className="rounded-full bg-bahaya-bg px-2 py-0.5 text-[10px] font-medium text-bahaya">
                            revisi ke-{k.jumlahRevisi}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-abu-400">
                        {k.tujuan === 'KEDUANYA' ? 'TikTok & Instagram' : k.tujuan} ·{' '}
                        {k.jenis === 'VIDEO' ? 'Video' : 'Gambar'}
                        {k.diajukanAt && <> · diajukan {k.diajukanAt.toLocaleString('id-ID')}</>}
                      </p>

                      <div className="mt-3 rounded-lg bg-abu-50 px-3.5 py-2.5">
                        <p className="mb-1 text-[11px] font-semibold text-abu-500">Caption</p>
                        <p className="baris-2 whitespace-pre-line text-xs leading-relaxed text-abu-700">
                          {k.caption || '—'}
                        </p>
                      </div>

                      {k.catatanKreator && (
                        <div className="mt-2 rounded-lg border-l-[3px] border-biru-500 bg-abu-50 px-3.5 py-2.5">
                          <p className="mb-0.5 text-[11px] font-semibold text-abu-500">
                            Catatan kreator
                          </p>
                          <p className="whitespace-pre-line text-xs leading-relaxed text-abu-700">
                            {k.catatanKreator}
                          </p>
                        </div>
                      )}

                      {masalah.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {masalah.map((m, i) => (
                            <p
                              key={i}
                              className="rounded bg-bahaya-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-bahaya"
                            >
                              <strong>{m.platform}:</strong> {m.pesan}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 border-t border-abu-200 pt-4">
                        <AksiKonten
                          id={k.id}
                          status={k.status as Status}
                          pemilik={k.pembuatId === pengguna.id}
                          penyetuju={k.penyetujuId === pengguna.id}
                          sudahPunyaBerkas={Boolean(k.mediaData)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {diputus.length > 0 && (
          <>
            <h2 className="mb-3 mt-10 text-sm font-semibold text-abu-700">Sudah Anda putuskan</h2>
            <div className="kartu overflow-hidden">
              <div className="overflow-x-auto">
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Judul</th>
                      <th>Kreator</th>
                      <th>Tujuan</th>
                      <th>Status</th>
                      <th>Keputusan</th>
                      <th>Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diputus.map((k) => (
                      <tr key={k.id}>
                        <td className="font-medium text-abu-900">
                          <Link href={`/konten/${k.id}`} className="hover:text-biru-700">
                            {k.judul}
                          </Link>
                        </td>
                        <td className="text-xs text-abu-600">{k.pembuat.nama}</td>
                        <td className="text-xs text-abu-600">
                          {k.tujuan === 'KEDUANYA' ? 'TikTok & IG' : k.tujuan}
                        </td>
                        <td>
                          <span
                            className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium ${WARNA_STATUS[k.status as Status]}`}
                          >
                            {LABEL_STATUS[k.status as Status]}
                          </span>
                        </td>
                        <td className="max-w-[240px] truncate text-xs text-abu-600">
                          {k.alasanRevisi ? `Revisi: ${k.alasanRevisi}` : k.catatanPenyetuju ?? 'Disetujui'}
                        </td>
                        <td className="text-xs tabular-nums text-abu-400">
                          {k.diputusAt?.toLocaleString('id-ID') ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Kerangka>
  );
}
