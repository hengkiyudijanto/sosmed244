import { redirect } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { boleh, whereCakupan, type Saya } from '@/lib/konten/akses';
import {
  IKON_STATUS,
  LABEL_JENIS_POSTING,
  LABEL_STATUS,
  LABEL_TUJUAN,
  WARNA_STATUS,
  STATUS,
  type JenisPosting,
  type Status,
  type Tujuan,
} from '@/lib/konten/status';
import { ringkasHasilKirim } from '@/lib/konten/hasil';

export const metadata = { title: 'Konten' };

export default async function DaftarKonten({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>;
}) {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');
  if (pengguna.harusGantiPassword) redirect('/ubah-password');

  const sp = await searchParams;
  const status = STATUS.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const cari = (sp.cari ?? '').trim();

  const saya: Saya = { id: pengguna.id, peran: pengguna.peran };
  const cakupan = whereCakupan(saya);

  const [daftar, hitungSemua] = await Promise.all([
    prisma.konten.findMany({
      where: {
        ...cakupan,
        ...(status ? { status } : {}),
        ...(cari
          ? {
              AND: [
                {
                  OR: [
                    { judul: { contains: cari, mode: 'insensitive' } },
                    { caption: { contains: cari, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        judul: true,
        caption: true,
        jenis: true,
        jenisPosting: true,
        tujuan: true,
        status: true,
        jumlahRevisi: true,
        hasilKirim: true,
        updatedAt: true,
        pembuat: { select: { nama: true } },
        _count: { select: { media: true } },
        media: { select: { jenis: true, byte: true }, orderBy: { urutan: 'asc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 120,
    }),
    prisma.konten.findMany({ where: cakupan, select: { status: true } }),
  ]);

  const jumlah: Partial<Record<Status, number>> = {};
  for (const k of hitungSemua) {
    const s = k.status as Status;
    jumlah[s] = (jumlah[s] ?? 0) + 1;
  }

  const filter: { nilai?: Status; label: string }[] = [
    { label: 'Semua' },
    ...STATUS.map((s) => ({ nilai: s, label: LABEL_STATUS[s] })),
  ];

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animasi-naik flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-kolom">Konten</p>
            <h1 className="huruf-judul mt-2 text-3xl text-mint sm:text-4xl">Daftar konten</h1>
            <p className="mt-3 text-sm leading-relaxed text-teks-2">
              Buat, ajukan untuk disetujui, lalu kirim ke platform.
            </p>
          </div>
          {boleh(pengguna.peran, 'kelola_konten') && (
            <Link href="/konten/baru" className="tombol tombol-utama">
              + Buat Konten
            </Link>
          )}
        </div>

        {/* ===== filter ===== */}
        <div className="mt-7 flex flex-wrap items-center gap-2">
          {filter.map((f) => {
            const aktif = status === f.nilai;
            const n = f.nilai ? jumlah[f.nilai] ?? 0 : hitungSemua.length;
            return (
              <Link
                key={f.label}
                href={f.nilai ? `/konten?status=${f.nilai}` : '/konten'}
                className={`rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${ aktif
                    ? 'border-mint bg-mint text-teal'
                    : 'border-garis bg-transparent text-teks-2 hover:bg-mint-panel'
                }`}
              >
                {f.label} <span className="tabular-nums opacity-70">({n})</span>
              </Link>
            );
          })}

          <form action="/konten" className="ml-auto flex gap-2">
            {status && <input type="hidden" name="status" value={status} />}
            <input
              name="cari"
              defaultValue={cari}
              placeholder="Cari judul atau caption…"
              className="input w-56 text-xs"
            />
            <button type="submit" className="tombol tombol-sekunder text-xs">
              Cari
            </button>
          </form>
        </div>

        {/* ===== daftar ===== */}
        {daftar.length === 0 ? (
          <div className="kartu mt-4 p-10 text-center">
            <p className="text-sm text-teks-2">
              {cari || status
                ? 'Tidak ada konten yang cocok dengan filter ini.'
                : 'Belum ada konten.'}
            </p>
            {boleh(pengguna.peran, 'kelola_konten') && !cari && !status && (
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
            {daftar.map((k) => {
              const hasil = ringkasHasilKirim(k.hasilKirim);
              const st = k.status as Status;
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
                      className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${WARNA_STATUS[st]}`}
                    >
                      {IKON_STATUS[st]} {LABEL_STATUS[st]}
                    </span>
                    {/* penanda berkas banyak: supaya carousel/story tidak terlihat
                        seperti unggahan biasa di daftar */}
                    {jml > 1 && (
                      <span className="absolute right-2 top-2 rounded-full bg-latar/85 px-2 py-1 text-[10px] font-bold text-mint">
                        ⧉ {jml} berkas
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="baris-1 text-sm font-bold text-mint">{k.judul}</h3>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-aksen-teks">
                      {LABEL_JENIS_POSTING[k.jenisPosting as JenisPosting]}
                    </p>
                    <p className="baris-2 mt-1 text-[11px] leading-relaxed text-teks-2">
                      {k.caption || 'Tanpa caption'}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-teks-3">
                      <span>{LABEL_TUJUAN[k.tujuan as Tujuan]}</span>
                      <span>·</span>
                      <span className="truncate">oleh {k.pembuat.nama}</span>
                    </div>
                    {k.status === 'REVISI' && k.jumlahRevisi > 0 && (
                      <p className="mt-1.5 text-[10px] font-semibold text-buruk">
                        sudah {k.jumlahRevisi}× dikembalikan
                      </p>
                    )}
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
