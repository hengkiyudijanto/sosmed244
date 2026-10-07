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
  LABEL_JENIS_POSTING,
  LABEL_STATUS,
  WARNA_STATUS,
  periksaKelayakan,
  type JenisPosting,
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
      media: { orderBy: { urutan: 'asc' } },
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
  const jenisPosting = konten.jenisPosting as JenisPosting;
  const masalah = periksaKelayakan({
    tujuan: konten.tujuan as Tujuan,
    jenisPosting,
    caption: konten.caption,
    berkas: konten.media.map((m) => ({
      jenis: m.jenis,
      mime: m.mime,
      ukuranByte: m.byte,
      durasiDetik: m.durasiDetik,
    })),
  });
  const peringatan = masalah.filter((m) => /akan diabaikan/i.test(m.pesan));
  const penghalang = masalah.filter((m) => !/akan diabaikan/i.test(m.pesan));
  const totalByte = konten.media.reduce((a, m) => a + m.byte, 0);

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/konten" className="text-xs text-abu-500 hover:text-abu-700">
          ← Kembali ke daftar konten
        </Link>

        {/* ===== kepala ===== */}
        <div className="animasi-naik mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-bold text-abu-900">{konten.judul}</h1>
              <span className="rounded-full bg-biru-100 px-2.5 py-1 text-[10px] font-semibold text-biru-700">
                {LABEL_JENIS_POSTING[jenisPosting]}
              </span>
            </div>
            <div className="mt-2 h-0.5 w-10 rounded-full bg-logo-merah" />
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
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-abu-800">Berkas</h2>
                {konten.media.length > 0 && (
                  <p className="text-[11px] tabular-nums text-abu-400">
                    {konten.media.length} berkas · {formatUkuran(totalByte)}
                  </p>
                )}
              </div>

              {konten.media.length === 0 ? (
                <p className="text-xs text-abu-400">Belum ada berkas.</p>
              ) : konten.media.length === 1 ? (
                (() => {
                  const m = konten.media[0];
                  const src = `/media/${konten.id}/${m.id}?v=${m.versi}`;
                  return (
                    <div>
                      {m.jenis === 'VIDEO' ? (
                        <video src={src} controls className="max-h-[60vh] w-full rounded-lg bg-abu-900" />
                      ) : (
                                                <img
                          src={src}
                          alt={konten.judul}
                          className="max-h-[60vh] w-full rounded-lg border border-abu-200 bg-abu-50 object-contain"
                        />
                      )}
                      <p className="mt-2 text-[11px] tabular-nums text-abu-400">
                        {m.jenis} · {formatUkuran(m.byte)}
                        {m.lebar ? ` · ${m.lebar}×${m.tinggi}` : ''}
                        {m.durasiDetik ? ` · ${Math.round(m.durasiDetik)} detik` : ''}
                        {m.mime ? ` · ${m.mime}` : ''}
                      </p>
                    </div>
                  );
                })()
              ) : (
                // Lebih dari satu berkas: ditampilkan berurutan seperti di
                // platform — carousel digeser mendatar, story satu per satu.
                <div className="space-y-3">
                  {konten.media.map((m, i) => {
                    const src = `/media/${konten.id}/${m.id}?v=${m.versi}`;
                    return (
                      <div
                        key={m.id}
                        className="flex flex-wrap gap-3 rounded-lg border border-abu-200 bg-abu-50 p-3"
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-biru-100 text-[11px] font-bold text-biru-700">
                          {i + 1}
                        </span>
                        <div className="min-w-[220px] flex-1">
                          {m.jenis === 'VIDEO' ? (
                            <video
                              src={src}
                              controls
                              className="max-h-[45vh] w-full rounded-lg bg-abu-900"
                            />
                          ) : (
                                                        <img
                              src={src}
                              alt={`${konten.judul} — berkas ${i + 1}`}
                              className="max-h-[45vh] w-full rounded-lg border border-abu-200 object-contain"
                            />
                          )}
                          <p className="mt-1.5 text-[10px] tabular-nums text-abu-400">
                            {m.jenis} · {formatUkuran(m.byte)}
                            {m.lebar ? ` · ${m.lebar}×${m.tinggi}` : ''}
                            {m.durasiDetik ? ` · ${Math.round(m.durasiDetik)} detik` : ''}
                            {i === 0 && jenisPosting === 'CAROUSEL'
                              ? ' · acuan potongan rasio'
                              : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ===== caption ===== */}
            <section className="kartu p-5">
              <h2 className="mb-2 text-sm font-semibold text-abu-800">
                Caption
                {jenisPosting === 'STORY' && (
                  <span className="ml-2 text-[11px] font-normal text-peringatan">
                    tidak ditampilkan pada story
                  </span>
                )}
              </h2>
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
                      jenisPosting: konten.jenisPosting,
                      penyetujuId: konten.penyetujuId,
                      berkas: konten.media.map((m) => ({
                        id: m.id,
                        nama: `Berkas ${m.urutan + 1}`,
                        jenis: m.jenis,
                        mime: m.mime,
                        byte: m.byte,
                        lebar: m.lebar,
                        tinggi: m.tinggi,
                        durasiDetik: m.durasiDetik,
                        url: `/media/${konten.id}/${m.id}?v=${m.versi}`,
                      })),
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
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-logo-merah" />
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
            {/* ===== tindakan ===== */}
            <section className="kartu p-5">
              <h2 className="mb-3 text-sm font-semibold text-abu-800">Tindakan</h2>
              <AksiKonten
                id={konten.id}
                status={status}
                pemilik={pemilik}
                penyetuju={penyetujuSaya}
                jumlahBerkas={konten.media.length}
                penghalang={penghalang}
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
              <p className="mt-1 text-[11px] text-abu-500">
                Jenis postingan: <strong>{LABEL_JENIS_POSTING[jenisPosting]}</strong>
              </p>

              {penghalang.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-bahaya">
                    Menghalangi pengajuan / pengiriman:
                  </p>
                  {penghalang.map((m, i) => (
                    <p
                      key={i}
                      className="rounded bg-bahaya-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-bahaya"
                    >
                      <strong>{m.platform}:</strong> {m.pesan}
                    </p>
                  ))}
                </div>
              )}

              {peringatan.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {peringatan.map((m, i) => (
                    <p
                      key={i}
                      className="rounded bg-peringatan-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-peringatan"
                    >
                      <strong>{m.platform}:</strong> {m.pesan}
                    </p>
                  ))}
                </div>
              )}

              <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-abu-400">
                <li>Caption maksimal 2200 karakter</li>
                <li>Instagram: gambar harus JPEG</li>
                <li>TikTok: hanya video, tanpa story</li>
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
