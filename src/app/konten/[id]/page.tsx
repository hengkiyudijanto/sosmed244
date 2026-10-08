import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { FormKonten } from '@/components/form-konten';
import { AksiKonten, HasilKirim } from '@/components/aksi-konten';
import { boleh, bolehAksi, bolehLihat, type Saya } from '@/lib/konten/akses';
import {
  KETERANGAN_STATUS,
  IKON_STATUS,
  LABEL_JENIS_POSTING,
  LABEL_STATUS,
  LABEL_TUJUAN,
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
  // Penyetujuan berbasis PERAN: siapa pun yang berkemampuan setujui_konten sah
  // memutuskan (pembuat sendiri tetap tidak bisa — lihat peranTransisi).
  const penyetujuSaya = boleh(pengguna.peran, 'setujui_konten');
  const bolehUbah = bolehAksi(ringkas, saya, 'ubah').boleh;

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
        <Link href="/konten" className="text-xs font-semibold text-teks-3 hover:text-mint">
          ← Kembali ke daftar konten
        </Link>

        {/* ===== kepala ===== */}
        <div className="animasi-naik mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label-kolom">Detail konten</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="break-words font-extrabold uppercase leading-tight tracking-[-0.02em] text-mint text-2xl sm:text-3xl">
                {konten.judul}
              </h1>
              <span className="rounded-full bg-aksen-pudar px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-aksen">
                {LABEL_JENIS_POSTING[jenisPosting]}
              </span>
            </div>
            {/* Tidak ada lagi label "penyetuju" di kepala konten: penyetujuan
                berbasis peran, dan WHO yang memutuskan sudah tercatat apa adanya
                di riwayat keputusan di bawah. */}
            <p className="mt-3 text-xs text-teks-3">
              Dibuat oleh {konten.pembuat.nama} · {konten.createdAt.toLocaleString('id-ID')}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${WARNA_STATUS[status]}`}
          >
            {IKON_STATUS[status]} {LABEL_STATUS[status]}
          </span>
        </div>

        <p className="mt-3 border-l-2 border-garis-kuat bg-mint-panel px-3.5 py-2.5 text-xs leading-relaxed text-teks-2">
          {KETERANGAN_STATUS[status]}
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="space-y-5">
            {/* ===== berkas ===== */}
            <section className="kartu p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-garis pb-2">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-teks-3">Berkas</h2>
                {konten.media.length > 0 && (
                  <p className="text-[11px] tabular-nums text-teks-3">
                    {konten.media.length} berkas · {formatUkuran(totalByte)}
                  </p>
                )}
              </div>

              {konten.media.length === 0 ? (
                <p className="text-xs text-teks-3">Belum ada berkas.</p>
              ) : konten.media.length === 1 ? (
                (() => {
                  const m = konten.media[0];
                  const src = `/media/${konten.id}/${m.id}?v=${m.versi}`;
                  return (
                    <div>
                      {m.jenis === 'VIDEO' ? (
                        <video src={src} controls className="max-h-[60vh] w-full bg-black" />
                      ) : (
                        <img
                          src={src}
                          alt={konten.judul}
                          className="max-h-[60vh] w-full border border-garis-kuat bg-latar object-contain"
                        />
                      )}
                      <p className="mt-2 text-[11px] tabular-nums text-teks-3">
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
                        className="flex flex-wrap gap-3 border border-garis-kuat bg-mint-panel p-3"
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-aksen text-[11px] font-bold text-latar">
                          {i + 1}
                        </span>
                        <div className="min-w-[220px] flex-1">
                          {m.jenis === 'VIDEO' ? (
                            <video src={src} controls className="max-h-[45vh] w-full bg-black" />
                          ) : (
                            <img
                              src={src}
                              alt={`${konten.judul} — berkas ${i + 1}`}
                              className="max-h-[45vh] w-full border border-garis-kuat object-contain"
                            />
                          )}
                          <p className="mt-1.5 text-[10px] tabular-nums text-teks-3">
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
              <h2 className="mb-2 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
                Caption
                {jenisPosting === 'STORY' && (
                  <span className="ml-2 text-[11px] font-semibold normal-case tracking-normal text-tunggu">
                    tidak ditampilkan pada story
                  </span>
                )}
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-teks-2">
                {konten.caption || <span className="text-teks-3">Tanpa caption.</span>}
              </p>
              <p className="mt-2 text-[11px] tabular-nums text-teks-3">
                {konten.caption.length} / 2200 karakter
              </p>
            </section>

            {konten.hasilKirim && (
              <section className="kartu p-5">
                <h2 className="mb-3 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
                  Hasil pengiriman
                </h2>
                <HasilKirim hasil={konten.hasilKirim} />
              </section>
            )}

            {bolehUbah && (
              <details className="kartu p-5">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
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
                  />
                </div>
              </details>
            )}

            {/* ===== riwayat ===== */}
            <section className="kartu p-5">
              <h2 className="mb-3 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
                Riwayat keputusan
              </h2>
              <ol className="space-y-3">
                {konten.keputusan.map((k) => (
                  <li key={k.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-aksen" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-mint">
                        {k.aksi} <span className="font-normal text-teks-2">oleh {k.oleh.nama}</span>
                      </p>
                      <p className="text-[11px] tabular-nums text-teks-3">
                        {k.createdAt.toLocaleString('id-ID')}
                      </p>
                      {k.catatan && (
                        <p className="mt-1 whitespace-pre-line border-l-2 border-garis-kuat bg-mint-panel px-2.5 py-1.5 text-[11px] leading-relaxed text-teks-2">
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
              <h2 className="mb-3 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
                Tindakan
              </h2>
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
              <h2 className="mb-3 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
                Tujuan
              </h2>
              <p className="text-xs text-teks-2">{LABEL_TUJUAN[konten.tujuan as Tujuan]}</p>
              <p className="mt-1 text-[11px] text-teks-3">
                Jenis postingan: <strong className="text-mint">{LABEL_JENIS_POSTING[jenisPosting]}</strong>
              </p>

              {penghalang.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-buruk">
                    Menghalangi pengajuan / pengiriman:
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

              {peringatan.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {peringatan.map((m, i) => (
                    <p
                      key={i}
                      className="border-l-2 border-tunggu bg-tunggu-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-tunggu"
                    >
                      <strong>{m.platform}:</strong> {m.pesan}
                    </p>
                  ))}
                </div>
              )}

              <ul className="mt-3 space-y-1 border-t border-garis pt-3 text-[11px] leading-relaxed text-teks-3">
                <li>Caption maksimal 2200 karakter</li>
                <li>Instagram: gambar harus JPEG</li>
                <li>Instagram: story tidak memakai caption</li>
                <li>Jumlah revisi: {konten.jumlahRevisi}×</li>
              </ul>
            </section>

            {konten.alasanRevisi && (
              <section className="kartu border-l-2 border-buruk p-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-buruk">
                  Alasan revisi
                </h2>
                <p className="whitespace-pre-line text-xs leading-relaxed text-teks-2">
                  {konten.alasanRevisi}
                </p>
              </section>
            )}

            {konten.catatanKreator && (
              <section className="kartu p-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
                  Catatan kreator
                </h2>
                <p className="whitespace-pre-line text-xs leading-relaxed text-teks-2">
                  {konten.catatanKreator}
                </p>
              </section>
            )}

            {konten.catatanPenyetuju && (
              <section className="kartu p-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
                  Catatan penyetuju
                </h2>
                <p className="whitespace-pre-line text-xs leading-relaxed text-teks-2">
                  {konten.catatanPenyetuju}
                </p>
              </section>
            )}

            {konten.status === 'DIKIRIM' && konten.terkirimAt && (
              <section className="kartu p-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-aksen">
                  Dikirim
                </h2>
                <p className="text-xs tabular-nums text-teks-2">
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
