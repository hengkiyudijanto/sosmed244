import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { FormKonten } from '@/components/form-konten';
import { AksiKonten, HasilKirim } from '@/components/aksi-konten';
import { daftarCalonPenyetuju } from '@/app/konten/baru/page';
import { boleh, bolehAksi, bolehLihat, type Saya } from '@/lib/konten/akses';
import {
  KETERANGAN_STATUS,
  IKON_STATUS,
  LABEL_STATUS,
  WARNA_STATUS,
  periksaKelayakan,
  type Status,
  type Tujuan,
} from '@/lib/konten/status';
import { formatUkuran } from '@/lib/konten/media';

export const metadata = { title: 'Detail Konten' };

export default async function DetailKonten({ params }: { params: Promise<{ id: string }> }) {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');
  if (pengguna.harusGantiPassword) redirect('/ubah-password');

  const { id } = await params;
  const konten = await prisma.konten.findUnique({
    where: { id },
    include: {
      pembuat: { select: { id: true, nama: true, email: true } },
      penyetuju: { select: { id: true, nama: true } },
      keputusan: {
        include: { oleh: { select: { nama: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!konten) notFound();

  const saya: Saya = { id: pengguna.id, peran: pengguna.peran };
  const ringkas = {
    pembuatId: konten.pembuatId,
    penyetujuId: konten.penyetujuId,
    status: konten.status as Status,
  };

  if (!bolehLihat(ringkas, saya)) redirect('/konten');

  const pemilik = konten.pembuatId === pengguna.id;
  const penyetujuSaya = konten.penyetujuId === pengguna.id && boleh(pengguna.peran, 'setujui_konten');
  const bolehUbah = bolehAksi(ringkas, saya, 'ubah').boleh;
  const calon = bolehUbah ? await daftarCalonPenyetuju(pengguna.id) : [];

  const status = konten.status as Status;
  const masalah = konten.jenis && konten.mediaByte
    ? periksaKelayakan({
        tujuan: konten.tujuan as Tujuan,
        jenis: konten.jenis as 'GAMBAR' | 'VIDEO',
        caption: konten.caption,
        ukuranByte: konten.mediaByte,
        mime: konten.mediaMime ?? '',
        durasiDetik: konten.durasiDetik,
      })
    : [];

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/konten" className="text-xs text-abu-500 hover:text-abu-700">
          ← Kembali ke daftar konten
        </Link>

        {/* ===== kepala ===== */}
        <div className="animasi-naik mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-abu-900">{konten.judul}</h1>
            <div className="mt-2 h-0.5 w-10 rounded-full bg-jingga-500" />
            <p className="mt-3 text-xs text-abu-500">
              Dibuat oleh {konten.pembuat.nama} · {konten.createdAt.toLocaleString('id-ID')}
              {konten.penyetuju && <> · penyetuju: {konten.penyetuju.nama}</>}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${WARNA_STATUS[status]}`}
          >
            {IKON_STATUS[status]} {LABEL_STATUS[status]}
          </span>
        </div>

        <p className="mt-3 rounded-lg bg-abu-100 px-3.5 py-2.5 text-xs leading-relaxed text-abu-500">
          {KETERANGAN_STATUS[status]}
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="space-y-5">
            {/* ===== berkas ===== */}
            <section className="kartu p-5">
              <h2 className="mb-3 text-sm font-semibold text-abu-800">Berkas</h2>
              {!konten.mediaData ? (
                <p className="text-xs text-abu-400">Belum ada berkas.</p>
              ) : konten.jenis === 'VIDEO' ? (
                <video
                  src={`/media/${konten.id}?v=${konten.versiMedia}`}
                  controls
                  className="max-h-[60vh] w-full rounded-lg bg-abu-900"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/media/${konten.id}?v=${konten.versiMedia}`}
                  alt={konten.judul}
                  className="max-h-[60vh] w-full rounded-lg border border-abu-200 bg-abu-50 object-contain"
                />
              )}
              {konten.mediaByte && (
                <p className="mt-2 text-[11px] tabular-nums text-abu-400">
                  {konten.jenis} · {formatUkuran(konten.mediaByte)}
                  {konten.mediaLebar ? ` · ${konten.mediaLebar}×${konten.mediaTinggi}` : ''}
                  {konten.durasiDetik ? ` · ${Math.round(konten.durasiDetik)} detik` : ''}
                </p>
              )}
            </section>

            {/* ===== caption ===== */}
            <section className="kartu p-5">
              <h2 className="mb-2 text-sm font-semibold text-abu-800">Caption</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-abu-700">
                {konten.caption || <span className="text-abu-400">Tanpa caption.</span>}
              </p>
              <p className="mt-2 text-[11px] tabular-nums text-abu-400">
                {konten.caption.length} / 2200 karakter
              </p>
            </section>

            {konten.hasilKirim && (
              <section className="kartu p-5">
                <h2 className="mb-3 text-sm font-semibold text-abu-800">Hasil pengiriman</h2>
                <HasilKirim hasil={konten.hasilKirim} />
              </section>
            )}

            {bolehUbah && (
              <details className="kartu p-5">
                <summary className="cursor-pointer text-sm font-semibold text-abu-800">
                  Ubah isi konten
                </summary>
                <div className="mt-4">
                  <FormKonten
                    konten={{
                      id: konten.id,
                      judul: konten.judul,
                      caption: konten.caption,
                      tujuan: konten.tujuan,
                      jenis: konten.jenis,
                      adaBerkas: Boolean(konten.mediaData),
                      mediaUrl: konten.mediaData
                        ? `/media/${konten.id}?v=${konten.versiMedia}`
                        : null,
                      mediaByte: konten.mediaByte,
                      mediaLebar: konten.mediaLebar,
                      mediaTinggi: konten.mediaTinggi,
                      durasiDetik: konten.durasiDetik,
                      penyetujuId: konten.penyetujuId,
                    }}
                    calonPenyetuju={calon}
                    sayaId={pengguna.id}
                  />
                </div>
              </details>
            )}

            {/* ===== riwayat ===== */}
            <section className="kartu p-5">
              <h2 className="mb-3 text-sm font-semibold text-abu-800">Riwayat keputusan</h2>
              <ol className="space-y-3">
                {konten.keputusan.map((k) => (
                  <li key={k.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-jingga-500" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-abu-800">
                        {k.aksi} <span className="font-normal text-abu-500">oleh {k.oleh.nama}</span>
                      </p>
                      <p className="text-[11px] tabular-nums text-abu-400">
                        {k.createdAt.toLocaleString('id-ID')}
                      </p>
                      {k.catatan && (
                        <p className="mt-1 whitespace-pre-line rounded bg-abu-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-abu-600">
                          {k.catatan}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* ===== kolom kanan ===== */}
          <div className="space-y-5">
            <section className="kartu p-5">
              <h2 className="mb-3 text-sm font-semibold text-abu-800">Tindakan</h2>
              <AksiKonten
                id={konten.id}
                status={status}
                pemilik={pemilik}
                penyetuju={penyetujuSaya}
                sudahPunyaBerkas={Boolean(konten.mediaData)}
              />
            </section>

            <section className="kartu p-5">
              <h2 className="mb-3 text-sm font-semibold text-abu-800">Tujuan</h2>
              <p className="text-xs text-abu-700">
                {konten.tujuan === 'KEDUANYA'
                  ? 'TikTok & Instagram'
                  : konten.tujuan === 'TIKTOK'
                    ? 'TikTok saja'
                    : 'Instagram saja'}
              </p>

              {masalah.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-bahaya">
                    Perlu diperhatikan sebelum dikirim:
                  </p>
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

              <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-abu-400">
                <li>Caption maksimal 2200 karakter</li>
                <li>Instagram feed: gambar harus JPEG</li>
                <li>TikTok: hanya video</li>
                <li>Jumlah revisi: {konten.jumlahRevisi}×</li>
              </ul>
            </section>

            {konten.alasanRevisi && (
              <section className="kartu border-l-[3px] border-bahaya p-5">
                <h2 className="mb-2 text-sm font-semibold text-bahaya">Alasan revisi</h2>
                <p className="whitespace-pre-line text-xs leading-relaxed text-abu-700">
                  {konten.alasanRevisi}
                </p>
              </section>
            )}

            {konten.catatanKreator && (
              <section className="kartu p-5">
                <h2 className="mb-2 text-sm font-semibold text-abu-800">Catatan kreator</h2>
                <p className="whitespace-pre-line text-xs leading-relaxed text-abu-700">
                  {konten.catatanKreator}
                </p>
              </section>
            )}

            {konten.catatanPenyetuju && (
              <section className="kartu p-5">
                <h2 className="mb-2 text-sm font-semibold text-abu-800">Catatan penyetuju</h2>
                <p className="whitespace-pre-line text-xs leading-relaxed text-abu-700">
                  {konten.catatanPenyetuju}
                </p>
              </section>
            )}

            {konten.status === 'DIKIRIM' && konten.terkirimAt && (
              <section className="kartu p-5">
                <h2 className="mb-2 text-sm font-semibold text-abu-800">Dikirim</h2>
                <p className="text-xs tabular-nums text-abu-700">
                  {konten.terkirimAt.toLocaleString('id-ID')}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </Kerangka>
  );
}
