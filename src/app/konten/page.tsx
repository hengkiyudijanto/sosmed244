import { redirect } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { boleh, whereCakupan, type Saya } from '@/lib/konten/akses';
import {
  IKON_STATUS,
  LABEL_STATUS,
  WARNA_STATUS,
  STATUS,
  type Status,
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
        tujuan: true,
        status: true,
        jumlahRevisi: true,
        mediaByte: true,
        hasilKirim: true,
        updatedAt: true,
        pembuat: { select: { nama: true } },
        penyetuju: { select: { nama: true } },
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
            <h1 className="text-2xl font-bold text-abu-900">Konten</h1>
            <div className="mt-2 h-0.5 w-10 rounded-full bg-jingga-500" />
            <p className="mt-3 text-sm text-abu-500">
              Buat, ajukan untuk disetujui, lalu kirim ke TikTok & Instagram.
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
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  aktif
                    ? 'bg-biru-600 text-white'
                    : 'border border-abu-200 bg-white text-abu-600 hover:bg-abu-50'
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
            <p className="text-sm text-abu-500">
              {cari || status
                ? 'Tidak ada konten yang cocok dengan filter ini.'
                : 'Belum ada konten.'}
            </p>
            {boleh(pengguna.peran, 'kelola_konten') && !cari && !status && (
              <Link href="/konten/baru" className="mt-4 inline-block text-xs font-semibold text-biru-600 hover:underline">
                + Buat konten pertama
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {daftar.map((k) => {
              const hasil = ringkasHasilKirim(k.hasilKirim);
              const st = k.status as Status;
              return (
                <Link
                  key={k.id}
                  href={`/konten/${k.id}`}
                  className="kartu overflow-hidden transition-colors hover:border-biru-400"
                >
                  <div className="relative aspect-video overflow-hidden bg-abu-100">
                    {k.mediaByte ? (
                      k.jenis === 'VIDEO' ? (
                        <div className="flex h-full w-full items-center justify-center bg-biru-900">
                          <span className="text-xs font-medium text-white/90">▶ Video</span>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/media/${k.id}`} alt={k.judul} className="h-full w-full object-cover" />
                      )
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-abu-400">
                        Tanpa berkas
                      </div>
                    )}
                    <span
                      className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-semibold ${WARNA_STATUS[st]}`}
                    >
                      {IKON_STATUS[st]} {LABEL_STATUS[st]}
                    </span>
                  </div>

                  <div className="p-4">
                    <h3 className="baris-1 text-sm font-semibold text-abu-900">{k.judul}</h3>
                    <p className="baris-2 mt-1 text-[11px] leading-relaxed text-abu-500">
                      {k.caption || 'Tanpa caption'}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-abu-400">
                      <span>{k.tujuan === 'KEDUANYA' ? 'TikTok & Instagram' : k.tujuan}</span>
                      <span>·</span>
                      <span className="truncate">oleh {k.pembuat.nama}</span>
                      {k.penyetuju && (
                        <>
                          <span>·</span>
                          <span className="truncate">penyetuju {k.penyetuju.nama}</span>
                        </>
                      )}
                    </div>
                    {k.status === 'REVISI' && k.jumlahRevisi > 0 && (
                      <p className="mt-1.5 text-[10px] font-medium text-bahaya">
                        sudah {k.jumlahRevisi}× dikembalikan
                      </p>
                    )}
                    {hasil && (
                      <p className={`mt-1.5 text-[10px] font-medium ${hasil.adaGagal ? 'text-bahaya' : 'text-sukses'}`}>
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
