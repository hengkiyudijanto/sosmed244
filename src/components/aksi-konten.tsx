'use client';

/**
 * Tombol & form aksi untuk satu konten: ajukan, setujui, minta revisi, tarik,
 * jadwalkan, arsipkan, dan kirim ke platform.
 *
 * Komponen ini HANYA menampilkan tombol yang relevan menurut status. Keputusan
 * sebenarnya tetap divalidasi ulang di server action (transisi + akses) —
 * menyembunyikan tombol bukan pengamanan.
 */

import { useActionState, useState } from 'react';
import { useKirimForm } from '@/components/use-kirim-form';
import { ubahStatus, kirimKonten, type HasilAksi } from '@/app/actions/konten';
import type { Status } from '@/lib/konten/status';
import { bacaHasilKirim } from '@/lib/konten/hasil';

function TombolKirim({
  children,
  variasi = 'utama',
  nama,
  nilai,
}: {
  children: React.ReactNode;
  variasi?: 'utama' | 'sekunder' | 'bahaya';
  nama: string;
  nilai: string;
}) {
  const { sibuk, tandaiKirim } = useKirimForm();
  const kelas =
    variasi === 'utama' ? 'tombol-utama' : variasi === 'bahaya' ? 'tombol-bahaya' : 'tombol-sekunder';

  return (
    <button
      type="submit"
      name={nama}
      value={nilai}
      disabled={sibuk}
      onClick={tandaiKirim}
      className={`tombol ${kelas}`}
    >
      {sibuk && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

function Pesan({ state }: { state: HasilAksi }) {
  if (state.error)
    return (
      <p className="mt-2 rounded-lg bg-bahaya-bg px-2.5 py-1.5 text-xs leading-relaxed text-bahaya">
        {state.error}
      </p>
    );
  if (state.sukses)
    return <p className="mt-2 rounded-lg bg-sukses-bg px-2.5 py-1.5 text-xs text-sukses">{state.pesan}</p>;
  return null;
}

export function AksiKonten({
  id,
  status,
  pemilik,
  penyetuju,
  jumlahBerkas,
  penghalang = [],
}: {
  id: string;
  status: Status;
  pemilik: boolean;
  penyetuju: boolean;
  /** jumlah berkas media — konten tanpa berkas tidak bisa diajukan */
  jumlahBerkas: number;
  /**
   * Masalah kelayakan yang menghalangi pengajuan/pengiriman (jenis postingan vs
   * platform, jumlah berkas, format). Dihitung di server dan dikirim ke sini
   * supaya tombolnya tidak menawarkan sesuatu yang pasti ditolak server action.
   */
  penghalang?: { platform: string; pesan: string }[];
}) {
  const [stateStatus, aksiStatus] = useActionState(ubahStatus, {} as HasilAksi);
  const [stateKirim, aksiKirim] = useActionState(kirimKonten, {} as HasilAksi);
  const [panelRevisi, setPanelRevisi] = useState(false);

  const adaPenghalang = penghalang.length > 0;
  const bisaAjukan =
    pemilik && (status === 'DRAFT' || status === 'REVISI') && jumlahBerkas > 0 && !adaPenghalang;
  const bisaTarik = pemilik && status === 'MENUNGGU';
  const bisaSetujui = penyetuju && status === 'MENUNGGU';
  const bisaRevisi = penyetuju && (status === 'MENUNGGU' || status === 'DISETUJUI');
  const bisaKirim =
    (status === 'DISETUJUI' || status === 'DIJADWALKAN') && jumlahBerkas > 0 && !adaPenghalang;
  const bisaArsip = pemilik && (status === 'DRAFT' || status === 'REVISI');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        {bisaAjukan && (
          <form action={aksiStatus}>
            <input type="hidden" name="id" value={id} />
            <TombolKirim nama="aksi" nilai="AJUKAN">
              ➤ Ajukan untuk disetujui
            </TombolKirim>
            <Pesan state={stateStatus} />
          </form>
        )}

        {bisaTarik && (
          <form action={aksiStatus}>
            <input type="hidden" name="id" value={id} />
            <TombolKirim nama="aksi" nilai="TARIK" variasi="sekunder">
              ↩ Tarik pengajuan
            </TombolKirim>
            <Pesan state={stateStatus} />
          </form>
        )}

        {bisaSetujui && (
          <form action={aksiStatus}>
            <input type="hidden" name="id" value={id} />
            <TombolKirim nama="aksi" nilai="SETUJUI">
              ✓ Setujui konten
            </TombolKirim>
            <Pesan state={stateStatus} />
          </form>
        )}

        {bisaRevisi && !panelRevisi && (
          <button type="button" onClick={() => setPanelRevisi(true)} className="tombol tombol-bahaya">
            ↩ Minta revisi
          </button>
        )}

        {bisaKirim && (
          <form action={aksiKirim}>
            <input type="hidden" name="id" value={id} />
            <TombolKirim nama="aksi" nilai="KIRIM">
              ⇪ Kirim ke platform
            </TombolKirim>
            <Pesan state={stateKirim} />
          </form>
        )}

        {bisaArsip && (
          <form action={aksiStatus}>
            <input type="hidden" name="id" value={id} />
            <TombolKirim nama="aksi" nilai="ARSIPKAN" variasi="sekunder">
              Arsipkan
            </TombolKirim>
            <Pesan state={stateStatus} />
          </form>
        )}
      </div>

      {pemilik && (status === 'DRAFT' || status === 'REVISI') && jumlahBerkas === 0 && (
        <p className="rounded-lg bg-peringatan-bg px-2.5 py-1.5 text-[11px] text-peringatan">
          Unggah berkas dulu — konten tanpa berkas tidak dapat diajukan.
        </p>
      )}

      {/* Tombolnya sengaja TIDAK ditampilkan saat ada penghalang: server action
          tetap memeriksa hal yang sama, ini hanya supaya pemakai tidak
          menekan tombol yang pasti ditolak tanpa penjelasan. */}
      {adaPenghalang && (status === 'DISETUJUI' || status === 'DIJADWALKAN') && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-bahaya">
            Belum bisa dikirim — perbaiki ini dulu:
          </p>
          {penghalang.map((m, i) => (
            <p
              key={i}
              className="rounded-lg bg-bahaya-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-bahaya"
            >
              <strong>{m.platform}:</strong> {m.pesan}
            </p>
          ))}
        </div>
      )}

      {/* ===== panel alasan revisi ===== */}
      {panelRevisi && bisaRevisi && (
        <form action={aksiStatus} className="animasi-naik rounded-lg border border-abu-200 bg-abu-50 p-3.5">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="aksi" value="MINTA_REVISI" />
          <label htmlFor={`alasan-${id}`} className="mb-1.5 block text-xs font-medium text-abu-600">
            Alasan revisi (wajib — kreator membacanya apa adanya)
          </label>
          <textarea
            id={`alasan-${id}`}
            name="catatan"
            rows={2}
            required
            placeholder="Mis. potongan video di detik ke-10 terlalu cepat"
            className="input resize-y text-xs"
          />
          <div className="mt-2 flex gap-2">
            <TombolKirim nama="aksi" nilai="MINTA_REVISI" variasi="bahaya">
              Kembalikan untuk revisi
            </TombolKirim>
            <button type="button" onClick={() => setPanelRevisi(false)} className="tombol tombol-sekunder">
              Batal
            </button>
          </div>
          <Pesan state={stateStatus} />
        </form>
      )}

      {/* ===== panel jadwal ===== */}
      {bisaKirim && (
        <details className="text-xs">
          <summary className="cursor-pointer text-abu-500 hover:text-abu-700">
            atau jadwalkan waktu pengiriman
          </summary>
          <form action={aksiStatus} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="aksi" value="JADWALKAN" />
            <div>
              <label htmlFor={`jadwal-${id}`} className="mb-1 block text-[11px] text-abu-500">
                Waktu kirim
              </label>
              <input
                id={`jadwal-${id}`}
                type="datetime-local"
                name="jadwalAt"
                required
                className="input text-xs"
              />
            </div>
            <TombolKirim nama="aksi" nilai="JADWALKAN" variasi="sekunder">
              Jadwalkan
            </TombolKirim>
            <Pesan state={stateStatus} />
          </form>
        </details>
      )}

      {status === 'DIJADWALKAN' && (
        <form action={aksiStatus} className="inline">
          <input type="hidden" name="id" value={id} />
          <button type="submit" name="aksi" value="BATAL_JADWAL" className="text-[11px] font-medium text-bahaya hover:underline">
            Batalkan jadwal
          </button>
          <Pesan state={stateStatus} />
        </form>
      )}
    </div>
  );
}

/** Panel hasil pengiriman (dibaca dari kolom JSON hasilKirim). */
export function HasilKirim({ hasil }: { hasil: unknown }) {
  const peta = bacaHasilKirim(hasil);
  if (!peta) return null;

  return (
    <div className="rounded-lg border border-abu-200 bg-abu-50 p-3.5">
      <p className="mb-2 text-[11px] font-semibold text-abu-600">Hasil pengiriman terakhir</p>
      <ul className="space-y-2">
        {Object.entries(peta).map(([platform, h]) => (
          <li key={platform} className="text-xs">
            <span className="font-semibold text-abu-800">{platform}</span>{' '}
            <span className={h.berhasil ? 'text-sukses' : 'text-bahaya'}>
              {h.berhasil ? 'berhasil' : 'GAGAL'}
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-abu-500">{h.pesan}</span>
            {h.urlPublik && (
              <a
                href={h.urlPublik}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-[11px] text-biru-600 hover:underline"
              >
                {h.urlPublik}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
