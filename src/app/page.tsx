import { redirect } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { boleh, whereCakupan, type Saya } from '@/lib/konten/akses';
import {
  ringkasStatus,
  IKON_STATUS,
  LABEL_JENIS_POSTING,
  LABEL_STATUS,
  LABEL_TUJUAN,
  WARNA_STATUS,
  type JenisPosting,
  type Status,
  type Tujuan,
} from '@/lib/konten/status';
import { ringkasHasilKirim } from '@/lib/konten/hasil';
import { bacaKonfig } from '@/lib/konten/konfig';

export const metadata = { title: 'Dasbor' };

export default async function Dasbor() {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');
  if (pengguna.harusGantiPassword) redirect('/ubah-password');

  const saya: Saya = { id: pengguna.id, peran: pengguna.peran };
  const cakupan = whereCakupan(saya);

  const [semua, terbaru] = await Promise.all([
    prisma.konten.findMany({ where: cakupan, select: { status: true } }),
    prisma.konten.findMany({
      where: cakupan,
      select: {
        id: true,
        judul: true,
        status: true,
        jenis: true,
        jenisPosting: true,
        tujuan: true,
        hasilKirim: true,
        createdAt: true,
        pembuat: { select: { nama: true } },
        _count: { select: { media: true } },
        media: { select: { jenis: true }, orderBy: { urutan: 'asc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
  ]);

  const jumlah: Partial<Record<Status, number>> = {};
  for (const k of semua) {
    const s = k.status as Status;
    jumlah[s] = (jumlah[s] ?? 0) + 1;
  }
  const r = ringkasStatus(jumlah);
  const konfig = bacaKonfig();

  // Tugas yang menunggu SAYA — dua hal berbeda, jangan digabung:
  const menungguKeputusanSaya = boleh(pengguna.peran, 'setujui_konten')
    ? await prisma.konten.count({ where: { status: 'MENUNGGU', penyetujuId: pengguna.id } })
    : 0;
  const revisiSaya = await prisma.konten.count({
    where: { status: 'REVISI', pembuatId: pengguna.id },
  });

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animasi-naik">
          <p className="label-kolom">Dasbor</p>
          <h1 className="huruf-judul mt-2 text-3xl text-mint sm:text-4xl">
            Halo, {pengguna.nama.split(' ')[0]}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-teks-2">
            Ringkasan konten yang sedang Anda kelola dan yang menunggu tindakan.
          </p>
        </div>

        {/* ===== tugas saya ===== */}
        {(menungguKeputusanSaya > 0 || revisiSaya > 0) && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {menungguKeputusanSaya > 0 && (
              <Link
                href="/persetujuan"
                className="kartu border-l-2 border-urgent bg-baik-bg p-5 transition-colors hover:bg-aksen-pudar"
              >
                <div className="label-kolom !text-mint">Menunggu keputusan Anda</div>
                <div className="mt-1.5 text-3xl font-extrabold tabular-nums text-mint">
                  {menungguKeputusanSaya}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-mint/75">
                  konten tidak akan terkirim sebelum Anda memutuskan
                </div>
              </Link>
            )}
            {revisiSaya > 0 && (
              <Link
                href="/konten?status=REVISI"
                className="kartu border-l-2 border-buruk p-5 transition-colors hover:bg-mint-panel"
              >
                <div className="label-kolom !text-buruk">Perlu Anda revisi</div>
                <div className="mt-1.5 text-3xl font-extrabold tabular-nums text-buruk">
                  {revisiSaya}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-teks-3">
                  dikembalikan penyetuju — baca alasannya
                </div>
              </Link>
            )}
          </div>
        )}

        {/* ===== ringkasan ===== */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Terkirim',
              nilai: r.terkirim,
              warna: 'text-aksen',
              ket: 'sudah dipublikasikan',
            },
            {
              label: 'Menunggu persetujuan',
              nilai: r.menunggu,
              warna: r.menunggu > 0 ? 'text-tunggu' : 'text-mint',
              ket: 'menunggu keputusan penyetuju',
            },
            {
              label: 'Siap dikirim',
              nilai: r.siapKirim,
              warna: 'text-mint',
              ket: 'sudah disetujui',
            },
            {
              label: 'Total konten',
              nilai: r.total,
              warna: 'text-mint-lembut',
              ket: 'dalam cakupan Anda',
            },
          ].map((k) => (
            <div key={k.label} className="kartu p-5">
              <div className="label-kolom">{k.label}</div>
              <div className={`mt-1.5 text-3xl font-extrabold tabular-nums ${k.warna}`}>
                {k.nilai}
              </div>
              <div className="mt-0.5 text-[11px] text-teks-3">{k.ket}</div>
            </div>
          ))}
        </div>

        {/* ===== peringatan modus simulasi ===== */}
        {konfig.modus === 'mock' && (
          <div className="mt-5 border-l-2 border-tunggu bg-tunggu-bg px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-tunggu">
              Modus simulasi
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-teks-2">
              Pengiriman ke Instagram saat ini <strong className="text-mint">disimulasikan</strong> —
              alur persetujuan berjalan sungguhan, tetapi tidak ada unggahan nyata.
              {boleh(pengguna.peran, 'kelola_pengaturan') && (
                <>
                  {' '}
                  Isi kredensial di{' '}
                  <Link href="/pengaturan" className="font-semibold text-aksen-teks underline">
                    Pengaturan
                  </Link>{' '}
                  kalau sudah siap ke API sungguhan.
                </>
              )}
            </p>
          </div>
        )}

        {/* ===== konten terbaru ===== */}
        <div className="mt-8 flex items-center justify-between border-b border-garis pb-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
            Konten terbaru
          </h2>
          <Link href="/konten" className="text-xs font-bold text-aksen-teks hover:underline">
            Lihat semua →
          </Link>
        </div>

        {terbaru.length === 0 ? (
          <div className="kartu mt-3 p-10 text-center">
            <p className="text-sm text-teks-2">Belum ada konten.</p>
            {boleh(pengguna.peran, 'kelola_konten') && (
              <Link
                href="/konten/baru"
                className="mt-4 inline-block text-xs font-bold text-aksen-teks hover:underline"
              >
                + Buat konten pertama
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {terbaru.map((k) => {
              const hasil = ringkasHasilKirim(k.hasilKirim);
              const status = k.status as Status;
              const jml = k._count.media;
              const utama = k.media[0];
              return (
                <Link
                  key={k.id}
                  href={`/konten/${k.id}`}
                  className="kartu overflow-hidden transition-colors hover:border-garis-kuat"
                >
                  <div className="relative aspect-video overflow-hidden bg-latar">
                    {jml > 0 && utama ? (
                      utama.jenis === 'VIDEO' ? (
                        <div className="flex h-full w-full items-center justify-center bg-biru-900">
                          <span className="text-xs font-bold uppercase tracking-[0.12em] text-aksen">
                            ▶ Video
                          </span>
                        </div>
                      ) : (
                        <img
                          src={`/media/${k.id}`}
                          alt={k.judul}
                          className="h-full w-full object-cover"
                        />
                      )
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-teks-3">
                        Tanpa berkas
                      </div>
                    )}
                    <span
                      className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${WARNA_STATUS[status]}`}
                    >
                      {IKON_STATUS[status]} {LABEL_STATUS[status]}
                    </span>
                    {jml > 1 && (
                      <span className="absolute right-2 top-2 rounded-full bg-latar/85 px-2 py-1 text-[10px] font-bold text-mint">
                        ⧉ {jml}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="baris-1 text-sm font-bold text-mint">{k.judul}</h3>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-aksen-teks">
                      {LABEL_JENIS_POSTING[k.jenisPosting as JenisPosting]}
                    </p>
                    <p className="mt-1 text-[11px] text-teks-3">
                      oleh {k.pembuat.nama} · {LABEL_TUJUAN[k.tujuan as Tujuan]}
                    </p>
                    {hasil && (
                      <p
                        className={`mt-1.5 text-[10px] font-semibold ${ hasil.adaGagal ? 'text-buruk' : 'text-aksen'
                        }`}
                      >
                        {hasil.teks}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Kerangka>
  );
}
