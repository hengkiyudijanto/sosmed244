import { redirect } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { AksiKonten } from '@/components/aksi-konten';
import { boleh } from '@/lib/konten/akses';
import {
  periksaKelayakan,
  LABEL_JENIS_POSTING,
  LABEL_STATUS,
  WARNA_STATUS,
  type JenisPosting,
  type Status,
  type Tujuan,
} from '@/lib/konten/status';
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
        media: { orderBy: { urutan: 'asc' } },
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
          <p className="label-kolom">Persetujuan</p>
          <h1 className="huruf-judul mt-2 text-3xl text-mint sm:text-4xl">Menunggu keputusan Anda</h1>
          <p className="mt-3 text-sm leading-relaxed text-teks-2">
            Tinjau konten yang diajukan kepada Anda. Setujui untuk meneruskan ke pengiriman, atau
            minta revisi dengan alasan yang jelas.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="kartu p-5">
            <div className="label-kolom">Menunggu keputusan Anda</div>
            <div
              className={`mt-1.5 text-3xl font-extrabold tabular-nums ${ menunggu.length > 0 ? 'text-tunggu' : 'text-mint'
              }`}
            >
              {menunggu.length}
            </div>
            <div className="mt-0.5 text-[11px] text-teks-3">konten</div>
          </div>
          <div className="kartu p-5">
            <div className="label-kolom">Sudah Anda putuskan</div>
            <div className="mt-1.5 text-3xl font-extrabold tabular-nums text-mint">
              {diputus.length}
            </div>
            <div className="mt-0.5 text-[11px] text-teks-3">30 keputusan terakhir</div>
          </div>
          <div className="kartu p-5">
            <div className="label-kolom">Tugas Anda</div>
            <div className="mt-1.5 text-base font-bold text-mint">
              {menunggu.length === 0 ? 'Tidak ada' : `${menunggu.length} konten`}
            </div>
            <div className="mt-0.5 text-[11px] text-teks-3">sebagai penyetuju</div>
          </div>
        </div>

        <h2 className="mb-3 mt-8 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
          Menunggu keputusan Anda
        </h2>

        {menunggu.length === 0 ? (
          <div className="kartu p-10 text-center">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-baik-bg">
              <svg className="h-6 w-6 text-baik" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-sm text-teks-2">Tidak ada konten yang menunggu persetujuan Anda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {menunggu.map((k) => {
              const masalah = periksaKelayakan({
                tujuan: k.tujuan as Tujuan,
                jenisPosting: k.jenisPosting as JenisPosting,
                caption: k.caption,
                berkas: k.media.map((m) => ({
                  jenis: m.jenis,
                  mime: m.mime,
                  ukuranByte: m.byte,
                  durasiDetik: m.durasiDetik,
                })),
              });
              const penghalang = masalah.filter((m) => !/akan diabaikan/i.test(m.pesan));
              const utama = k.media[0];
              const totalByte = k.media.reduce((a, m) => a + m.byte, 0);

              return (
                <div key={k.id} className="kartu p-6">
                  <div className="flex flex-wrap gap-5">
                    <div className="shrink-0">
                      <div className="flex h-[190px] w-[150px] items-center justify-center overflow-hidden border border-garis-kuat bg-latar">
                        {utama ? (
                          utama.jenis === 'VIDEO' ? (
                            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-aksen">
                              ▶ Video
                            </span>
                          ) : (
                            <img
                              src={`/media/${k.id}/${utama.id}?v=${utama.versi}`}
                              alt={k.judul}
                              className="h-full w-full object-cover"
                            />
                          )
                        ) : (
                          <span className="text-[11px] text-teks-3">Tanpa berkas</span>
                        )}
                      </div>
                      {k.media.length > 0 && (
                        <p className="mt-1 text-center text-[10px] tabular-nums text-teks-3">
                          {k.media.length} berkas · {formatUkuran(totalByte)}
                        </p>
                      )}
                    </div>

                    <div className="min-w-[260px] flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Link
                          href={`/konten/${k.id}`}
                          className="text-base font-bold uppercase tracking-[-0.01em] text-mint hover:text-aksen"
                        >
                          {k.judul}
                        </Link>
                        <span className="text-xs text-teks-3">oleh {k.pembuat.nama}</span>
                        {k.jumlahRevisi > 0 && (
                          <span className="rounded-full bg-buruk-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-buruk">
                            revisi ke-{k.jumlahRevisi}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-teks-3">
                        {k.tujuan === 'KEDUANYA' ? 'TikTok & Instagram' : k.tujuan} ·{' '}
                        <strong className="font-bold text-aksen-teks">
                          {LABEL_JENIS_POSTING[k.jenisPosting as JenisPosting]}
                        </strong>
                        {k.media.length > 1 && ` · ${k.media.length} berkas`}
                        {k.diajukanAt && <> · diajukan {k.diajukanAt.toLocaleString('id-ID')}</>}
                      </p>

                      <div className="mt-3 border-l-2 border-garis-kuat bg-mint-panel px-3.5 py-2.5">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-teks-3">
                          Caption
                        </p>
                        <p className="baris-2 whitespace-pre-line text-xs leading-relaxed text-teks-2">
                          {k.caption || '—'}
                        </p>
                      </div>

                      {k.catatanKreator && (
                        <div className="mt-2 border-l-2 border-aksen bg-mint-panel px-3.5 py-2.5">
                          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-teks-3">
                            Catatan kreator
                          </p>
                          <p className="whitespace-pre-line text-xs leading-relaxed text-teks-2">
                            {k.catatanKreator}
                          </p>
                        </div>
                      )}

                      {penghalang.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-[11px] font-bold text-buruk">
                            Sebaiknya ditolak / minta revisi — konten ini belum bisa dikirim:
                          </p>
                          {penghalang.map((m, i) => (
                            <p
                              key={i}
                              className="border-l-2 border-buruk bg-buruk-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-buruk"
                            >
                              <strong>{m.platform}:</strong> {m.pesan}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 border-t border-garis pt-4">
                        <AksiKonten
                          id={k.id}
                          status={k.status as Status}
                          pemilik={k.pembuatId === pengguna.id}
                          penyetuju={k.penyetujuId === pengguna.id}
                          jumlahBerkas={k.media.length}
                          penghalang={penghalang}
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
            <h2 className="mb-3 mt-10 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
              Sudah Anda putuskan
            </h2>
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
                        <td className="font-medium text-mint">
                          <Link href={`/konten/${k.id}`} className="hover:text-aksen">
                            {k.judul}
                          </Link>
                        </td>
                        <td className="text-xs text-teks-2">{k.pembuat.nama}</td>
                        <td className="text-xs text-teks-2">
                          {k.tujuan === 'KEDUANYA' ? 'TikTok & IG' : k.tujuan}
                        </td>
                        <td>
                          <span
                            className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${ WARNA_STATUS[k.status as Status]
                            }`}
                          >
                            {LABEL_STATUS[k.status as Status]}
                          </span>
                        </td>
                        <td className="max-w-[240px] truncate text-xs text-teks-2">
                          {k.alasanRevisi ? `Revisi: ${k.alasanRevisi}` : k.catatanPenyetuju ?? 'Disetujui'}
                        </td>
                        <td className="text-xs tabular-nums text-teks-3">
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
