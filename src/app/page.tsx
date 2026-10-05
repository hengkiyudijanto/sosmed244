import { redirect } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { boleh, whereCakupan, type Saya } from '@/lib/konten/akses';
import { ringkasStatus, IKON_STATUS, LABEL_STATUS, WARNA_STATUS, type Status } from '@/lib/konten/status';
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
        tujuan: true,
        mediaByte: true,
        hasilKirim: true,
        createdAt: true,
        pembuat: { select: { nama: true } },
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
          <h1 className="text-2xl font-bold text-abu-900">
            Halo, {pengguna.nama.split(' ')[0]}
          </h1>
          <div className="mt-2 h-0.5 w-10 rounded-full bg-jingga-500" />
          <p className="mt-3 text-sm text-abu-500">
            Ringkasan konten yang sedang Anda kelola dan yang menunggu tindakan.
          </p>
        </div>

        {/* ===== tugas saya ===== */}
        {(menungguKeputusanSaya > 0 || revisiSaya > 0) && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {menungguKeputusanSaya > 0 && (
              <Link
                href="/persetujuan"
                className="kartu border-l-[3px] border-peringatan p-5 transition-colors hover:bg-abu-50"
              >
                <div className="label-kolom">Menunggu keputusan Anda</div>
                <div className="mt-1.5 text-2xl font-bold text-peringatan">
                  {menungguKeputusanSaya}
                </div>
                <div className="mt-0.5 text-xs text-abu-400">
                  konten tidak akan terkirim sebelum Anda memutuskan
                </div>
              </Link>
            )}
            {revisiSaya > 0 && (
              <Link
                href="/konten?status=REVISI"
                className="kartu border-l-[3px] border-bahaya p-5 transition-colors hover:bg-abu-50"
              >
                <div className="label-kolom">Perlu Anda revisi</div>
                <div className="mt-1.5 text-2xl font-bold text-bahaya">{revisiSaya}</div>
                <div className="mt-0.5 text-xs text-abu-400">
                  dikembalikan penyetuju — baca alasannya
                </div>
              </Link>
            )}
          </div>
        )}

        {/* ===== ringkasan ===== */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Terkirim', nilai: r.terkirim, warna: 'text-sukses', ket: 'sudah dipublikasikan' },
            {
              label: 'Menunggu persetujuan',
              nilai: r.menunggu,
              warna: r.menunggu > 0 ? 'text-peringatan' : 'text-abu-900',
              ket: 'menunggu keputusan penyetuju',
            },
            {
              label: 'Siap dikirim',
              nilai: r.siapKirim,
              warna: 'text-biru-600',
              ket: 'sudah disetujui',
            },
            { label: 'Total konten', nilai: r.total, warna: 'text-abu-900', ket: 'dalam cakupan Anda' },
          ].map((k) => (
            <div key={k.label} className="kartu p-5">
              <div className="label-kolom">{k.label}</div>
              <div className={`mt-1.5 text-2xl font-bold ${k.warna}`}>{k.nilai}</div>
              <div className="mt-0.5 text-xs text-abu-400">{k.ket}</div>
            </div>
          ))}
        </div>

        {/* ===== peringatan modus simulasi ===== */}
        {konfig.modus === 'mock' && (
          <div className="mt-5 rounded-lg border-l-[3px] border-peringatan bg-peringatan-bg px-4 py-3">
            <p className="text-xs font-semibold text-peringatan">Modus simulasi</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-abu-700">
              Pengiriman ke TikTok/Instagram saat ini <strong>disimulasikan</strong> — alur
              persetujuan berjalan sungguhan, tetapi tidak ada unggahan nyata.
              {boleh(pengguna.peran, 'kelola_pengaturan') && (
                <>
                  {' '}
                  Isi kredensial di{' '}
                  <Link href="/pengaturan" className="font-semibold underline">
                    Pengaturan
                  </Link>{' '}
                  kalau sudah siap ke API sungguhan.
                </>
              )}
            </p>
          </div>
        )}

        {/* ===== konten terbaru ===== */}
        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-abu-700">Konten terbaru</h2>
          <Link href="/konten" className="text-xs font-semibold text-biru-600 hover:underline">
            Lihat semua →
          </Link>
        </div>

        {terbaru.length === 0 ? (
          <div className="kartu mt-3 p-10 text-center">
            <p className="text-sm text-abu-500">Belum ada konten.</p>
            {boleh(pengguna.peran, 'kelola_konten') && (
              <Link href="/konten/baru" className="mt-4 inline-block text-xs font-semibold text-biru-600 hover:underline">
                + Buat konten pertama
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {terbaru.map((k) => {
              const hasil = ringkasHasilKirim(k.hasilKirim);
              const status = k.status as Status;
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
                      className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-semibold ${WARNA_STATUS[status]}`}
                    >
                      {IKON_STATUS[status]} {LABEL_STATUS[status]}
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="baris-1 text-sm font-semibold text-abu-900">{k.judul}</h3>
                    <p className="mt-1 text-[11px] text-abu-500">
                      oleh {k.pembuat.nama} · {k.tujuan === 'KEDUANYA' ? 'TikTok & Instagram' : k.tujuan}
                    </p>
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
