'use client';

/**
 * Form unggah/ubah konten.
 *
 * Alur: pilih berkas -> diproses di peramban (src/lib/konten/media.ts) ->
 * data URL dikirim ke server lewat server action.
 * Video tidak dikompres; ukurannya dibatasi dan itu disebut apa adanya di UI.
 */

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { simpanKonten, hapusMedia, type HasilAksi } from '@/app/actions/konten';
import { useKirimForm } from '@/components/use-kirim-form';
import { BATAS_MEDIA, formatUkuran, siapkanMedia, type HasilMedia } from '@/lib/konten/media';
import { LABEL_TUJUAN, TUJUAN, type Tujuan } from '@/lib/konten/status';

type CalonPenyetuju = { id: string; nama: string; email: string };

export function FormKonten({
  konten,
  calonPenyetuju,
  sayaId,
}: {
  konten?: {
    id: string;
    judul: string;
    caption: string;
    tujuan: string;
    jenis: string;
    adaBerkas: boolean;
    mediaUrl: string | null;
    mediaByte: number | null;
    mediaLebar: number | null;
    mediaTinggi: number | null;
    durasiDetik: number | null;
    penyetujuId: string | null;
  };
  calonPenyetuju: CalonPenyetuju[];
  sayaId: string;
}) {
  const [state, aksi] = useActionState(simpanKonten, {} as HasilAksi);
  const [stateHapus, aksiHapus] = useActionState(hapusMedia, {} as HasilAksi);
  const [media, setMedia] = useState<HasilMedia | null>(null);
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [tujuan, setTujuan] = useState<Tujuan>((konten?.tujuan as Tujuan) ?? 'KEDUANYA');
  const [caption, setCaption] = useState(konten?.caption ?? '');
  const [adaBerkasLama, setAdaBerkasLama] = useState(Boolean(konten?.adaBerkas));
  const berkas = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const jenisTerpilih = media?.jenis ?? (konten?.jenis as 'GAMBAR' | 'VIDEO' | undefined) ?? null;
  const pratinjau = media?.dataUrl ?? (adaBerkasLama ? konten?.mediaUrl ?? null : null);

  // Setelah tersimpan, tarik ulang data dari server: URL media memuat penanda
  // versi, jadi tanpa refresh pratinjau menampilkan salinan dari memori peramban.
  useEffect(() => {
    if (state.sukses || stateHapus.sukses) {
      setMedia(null);
      if (stateHapus.sukses) setAdaBerkasLama(false);
      router.refresh();
    }
  }, [state.sukses, stateHapus.sukses, router]);

  const pilih = async (f: File) => {
    setGalat(null);
    setProses(true);
    try {
      const hasil = await siapkanMedia(f);
      setMedia(hasil);
      setAdaBerkasLama(false);
      // TikTok tidak menerima gambar — koreksi tujuan otomatis + beri tahu.
      if (hasil.jenis === 'GAMBAR' && tujuan === 'TIKTOK') {
        setTujuan('INSTAGRAM');
        setGalat(
          'Gambar tidak bisa dikirim ke TikTok (TikTok hanya menerima video). Tujuan diubah ke Instagram saja.'
        );
      }
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Berkas tidak dapat diproses.');
      setMedia(null);
    } finally {
      setProses(false);
    }
  };

  const captionTerlaluPanjang = caption.length > 2200;
  const tidakLayakKirim = !pratinjau || (jenisTerpilih === 'GAMBAR' && tujuan === 'TIKTOK');

  return (
    <div className="space-y-5">
      <form action={aksi} className="space-y-5">
        {konten?.id && <input type="hidden" name="id" value={konten.id} />}
        <input type="hidden" name="mediaData" value={media?.dataUrl ?? ''} />
        <input type="hidden" name="mediaMime" value={media?.mime ?? ''} />
        <input type="hidden" name="mediaByte" value={media?.byte ?? 0} />
        <input type="hidden" name="mediaLebar" value={media?.lebar ?? 0} />
        <input type="hidden" name="mediaTinggi" value={media?.tinggi ?? 0} />
        <input type="hidden" name="durasiDetik" value={media?.durasiDetik ?? 0} />
        <input type="hidden" name="jenis" value={jenisTerpilih ?? 'GAMBAR'} />

        {/* ===== 1. berkas ===== */}
        <section className="kartu p-5">
          <h2 className="text-sm font-semibold text-abu-800">1. Berkas konten</h2>
          <p className="mt-1 text-xs leading-relaxed text-abu-500">
            Gambar (JPG/PNG/WebP) dan video (MP4/MOV) hingga{' '}
            {formatUkuran(BATAS_MEDIA.videoMaksByte)}. Gambar dikecilkan dan dikonversi ke JPEG
            otomatis di peramban — Instagram feed hanya menerima JPEG, jadi konversi ini yang
            membuat unggahan tidak ditolak.
          </p>

          <div className="mt-4 flex flex-wrap gap-5">
            <div className="shrink-0">
              <div
                className="flex items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-abu-300 bg-abu-50"
                style={{ width: '170px', height: '212px' }}
              >
                {proses ? (
                  <svg className="h-6 w-6 animate-spin text-abu-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : pratinjau ? (
                  jenisTerpilih === 'VIDEO' ? (
                    <video src={pratinjau} controls className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pratinjau} alt="Pratinjau konten" className="h-full w-full object-cover" />
                  )
                ) : (
                  <span className="px-3 text-center text-[11px] text-abu-400">Belum ada berkas</span>
                )}
              </div>

              {media ? (
                <p className="mt-1.5 text-center text-[10px] tabular-nums text-abu-400">
                  {media.jenis === 'VIDEO' ? 'Video' : 'JPEG'} · {media.lebar}×{media.tinggi} ·{' '}
                  {formatUkuran(media.byte)}
                  {media.durasiDetik ? ` · ${Math.round(media.durasiDetik)} dtk` : ''}
                </p>
              ) : konten?.mediaByte ? (
                <p className="mt-1.5 text-center text-[10px] tabular-nums text-abu-400">
                  Tersimpan · {formatUkuran(konten.mediaByte)}
                  {konten.mediaLebar ? ` · ${konten.mediaLebar}×${konten.mediaTinggi}` : ''}
                </p>
              ) : null}
            </div>

            <div className="min-w-[240px] flex-1 space-y-3">
              <input
                ref={berkas}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void pilih(f);
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => berkas.current?.click()}
                disabled={proses}
                className="tombol tombol-sekunder"
              >
                {pratinjau ? 'Ganti berkas' : 'Pilih berkas gambar / video'}
              </button>

              {galat && (
                <p className="rounded-lg bg-bahaya-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-bahaya">
                  {galat}
                </p>
              )}
              {media && (
                <p className="rounded-lg bg-sukses-bg px-2.5 py-1.5 text-[11px] text-sukses">
                  Berkas siap ({formatUkuran(media.byte)}). Tekan Simpan di bawah.
                </p>
              )}
              {jenisTerpilih === 'VIDEO' && (
                <p className="text-[11px] leading-relaxed text-abu-400">
                  Video tidak dikompres agar kualitasnya tetap. Kalau terlalu besar, kecilkan dulu
                  di perangkat sebelum diunggah.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ===== 2. judul & caption ===== */}
        <section className="kartu space-y-4 p-5">
          <h2 className="text-sm font-semibold text-abu-800">2. Judul & caption</h2>

          <div>
            <label htmlFor="judul" className="mb-1.5 block text-xs font-medium text-abu-600">
              Judul internal{' '}
              <span className="text-abu-400">(tidak ikut terkirim ke platform)</span>
            </label>
            <input
              id="judul"
              name="judul"
              required
              minLength={3}
              maxLength={120}
              defaultValue={konten?.judul ?? ''}
              placeholder="Mis. Promo Oktober — potongan biaya transfer"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="caption" className="mb-1.5 block text-xs font-medium text-abu-600">
              Caption / keterangan
            </label>
            <textarea
              id="caption"
              name="caption"
              rows={4}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Tulis caption yang akan tampil di postingan…"
              className="input resize-y"
            />
            <p
              className={`mt-1 text-[11px] tabular-nums ${
                captionTerlaluPanjang ? 'font-semibold text-bahaya' : 'text-abu-400'
              }`}
            >
              {caption.length} / 2200 karakter
              {captionTerlaluPanjang && ' — melebihi batas TikTok & Instagram'}
            </p>
          </div>
        </section>

        {/* ===== 3. tujuan & penyetuju ===== */}
        <section className="kartu space-y-4 p-5">
          <h2 className="text-sm font-semibold text-abu-800">3. Tujuan & penyetuju</h2>

          <div>
            <span className="mb-2 block text-xs font-medium text-abu-600">Platform tujuan</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {TUJUAN.map((t) => {
                const mati = t === 'TIKTOK' && jenisTerpilih === 'GAMBAR';
                const aktif = tujuan === t;
                return (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                      aktif
                        ? 'border-biru-500 bg-biru-50 font-semibold text-biru-700'
                        : 'border-abu-300 bg-white text-abu-600 hover:bg-abu-50'
                    } ${mati ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <input
                      type="radio"
                      name="tujuan"
                      value={t}
                      checked={aktif}
                      disabled={mati}
                      onChange={() => setTujuan(t)}
                      className="accent-biru-600"
                    />
                    {LABEL_TUJUAN[t]}
                  </label>
                );
              })}
            </div>
            {jenisTerpilih === 'GAMBAR' && (
              <p className="mt-2 text-[11px] text-peringatan">
                Berkas ini gambar — TikTok tidak tersedia karena TikTok hanya menerima video.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="penyetujuId" className="mb-1.5 block text-xs font-medium text-abu-600">
              Penyetuju
            </label>
            <select
              id="penyetujuId"
              name="penyetujuId"
              defaultValue={konten?.penyetujuId ?? ''}
              className="input"
            >
              <option value="">— pilih penyetuju —</option>
              {calonPenyetuju
                .filter((p) => p.id !== sayaId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama} · {p.email}
                  </option>
                ))}
            </select>
            <p className="mt-1.5 text-[11px] leading-relaxed text-abu-400">
              Penyetuju ditentukan di sini dan <strong>dikunci saat konten diajukan</strong> — draf
              tidak bisa diarahkan ulang ke penyetuju lain setelah dikirim untuk diperiksa.
            </p>
          </div>
        </section>

        {state.error && (
          <p className="rounded-lg bg-bahaya-bg px-3 py-2 text-xs leading-relaxed text-bahaya">
            {state.error}
          </p>
        )}
        {state.sukses && (
          <p className="rounded-lg bg-sukses-bg px-3 py-2 text-xs text-sukses">{state.pesan}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <TombolSimpan label={konten?.id ? 'Simpan perubahan' : 'Simpan sebagai draft'} />
          {tidakLayakKirim && (
            <span className="text-[11px] text-abu-400">
              Setelah tersimpan, konten masih bisa diajukan untuk disetujui.
            </span>
          )}
        </div>
      </form>

      {/* hapus berkas dipisah: form bersarang tidak diperbolehkan HTML */}
      {adaBerkasLama && konten?.id && (
        <form action={aksiHapus} className="inline">
          <input type="hidden" name="id" value={konten.id} />
          <button type="submit" className="text-[11px] font-medium text-bahaya hover:underline">
            Hapus berkas yang tersimpan
          </button>
        </form>
      )}
      {stateHapus.error && (
        <p className="rounded-lg bg-bahaya-bg px-2.5 py-1.5 text-[11px] text-bahaya">
          {stateHapus.error}
        </p>
      )}
      {stateHapus.sukses && (
        <p className="rounded-lg bg-abu-100 px-2.5 py-1.5 text-[11px] text-abu-600">
          {stateHapus.pesan}
        </p>
      )}
    </div>
  );
}

function TombolSimpan({ label }: { label: string }) {
  const { sibuk, tandaiKirim } = useKirimForm();
  return (
    <button type="submit" disabled={sibuk} onClick={tandaiKirim} className="tombol tombol-utama">
      {sibuk && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {label}
    </button>
  );
}
