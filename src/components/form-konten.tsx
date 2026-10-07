'use client';

/**
 * Form unggah/ubah konten.
 *
 * Alur: pilih berkas (boleh banyak) -> diproses di peramban
 * (src/lib/konten/media.ts) -> data URL dikirim ke server lewat server action.
 * Video tidak dikompres; ukurannya dibatasi dan itu disebut apa adanya di UI.
 *
 * Kenapa berkas dikirim sebagai field bernomor (mediaData0, mediaData1, …):
 * FormData hanya membawa string/File. Mengirim satu JSON raksasa memaksa parsing
 * dan membuat batas ukuran tidak terlihat; dengan field bernomor, setiap berkas
 * tetap satu nilai dan urutannya mengikuti posisi di daftar.
 *
 * URUTAN PENTING: item pertama carousel menentukan potongan rasio semua gambar,
 * dan urutan story menentukan tampilannya. Karena itu daftar berkas bisa digeser.
 */

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { simpanKonten, type HasilAksi } from '@/app/actions/konten';
import { useKirimForm } from '@/components/use-kirim-form';
import { BATAS_MEDIA, formatUkuran, siapkanBanyakMedia } from '@/lib/konten/media';
import {
  ATURAN_JENIS_POSTING,
  JENIS_POSTING,
  KETERANGAN_JENIS_POSTING,
  LABEL_JENIS_POSTING,
  LABEL_TUJUAN,
  TUJUAN,
  periksaKelayakan,
  platformDariTujuan,
  type JenisPosting,
  type Tujuan,
} from '@/lib/konten/status';

type CalonPenyetuju = { id: string; nama: string; email: string };

/** Berkas yang sudah ada di server (belum diubah) atau baru dipilih di peramban. */
type BerkasForm = {
  /** id baris Media yang sudah ada; kosong kalau berkas baru dipilih */
  id?: string;
  nama: string;
  jenis: 'GAMBAR' | 'VIDEO';
  mime: string;
  byte: number;
  lebar: number | null;
  tinggi: number | null;
  durasiDetik: number | null;
  /** data URL untuk berkas baru; berkas lama memakai url pratinjau */
  data?: string;
  /** URL pratinjau untuk berkas yang sudah tersimpan */
  url?: string;
};

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
    jenisPosting: string;
    penyetujuId: string | null;
    berkas: {
      id: string;
      nama: string;
      jenis: string;
      mime: string;
      byte: number;
      lebar: number | null;
      tinggi: number | null;
      durasiDetik: number | null;
      url: string;
    }[];
  };
  calonPenyetuju: CalonPenyetuju[];
  sayaId: string;
}) {
  const [state, aksi] = useActionState(simpanKonten, {} as HasilAksi);
  const [berkas, setBerkas] = useState<BerkasForm[]>(() =>
    (konten?.berkas ?? []).map((b) => ({
      id: b.id,
      nama: b.nama,
      jenis: b.jenis as 'GAMBAR' | 'VIDEO',
      mime: b.mime,
      byte: b.byte,
      lebar: b.lebar,
      tinggi: b.tinggi,
      durasiDetik: b.durasiDetik,
      url: b.url,
    }))
  );
  const [proses, setProses] = useState(false);
  const [kemajuan, setKemajuan] = useState<{ selesai: number; total: number } | null>(null);
  const [galat, setGalat] = useState<string[]>([]);
  const [tujuan, setTujuan] = useState<Tujuan>((konten?.tujuan as Tujuan) ?? 'KEDUANYA');
  const [jenisPosting, setJenisPosting] = useState<JenisPosting>(
    (konten?.jenisPosting as JenisPosting) ?? 'FEED'
  );
  const [caption, setCaption] = useState(konten?.caption ?? '');
  const masukan = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Setelah tersimpan, tarik ulang data dari server: URL media memuat penanda
  // versi, jadi tanpa refresh daftar berkas menampilkan salinan dari memori.
  useEffect(() => {
    if (state.sukses) router.refresh();
  }, [state.sukses, router]);

  // ==== kelayakan dihitung di peramban supaya pengguna tahu SEBELUM menyimpan ====
  const masalah = periksaKelayakan({
    tujuan,
    jenisPosting,
    caption,
    berkas: berkas.map((b) => ({
      jenis: b.jenis,
      mime: b.mime,
      ukuranByte: b.byte,
      durasiDetik: b.durasiDetik,
    })),
  });

  // Keterangan (mis. caption story diabaikan) dipisahkan dari yang benar-benar
  // menghalangi pengiriman, supaya peringatan tidak menenggelamkan masalah.
  const peringatan = masalah.filter((m) => /akan diabaikan/i.test(m.pesan));
  const penghalang = masalah.filter((m) => !/akan diabaikan/i.test(m.pesan));

  const aturanIG = ATURAN_JENIS_POSTING.INSTAGRAM[jenisPosting];
  const aturanTT = ATURAN_JENIS_POSTING.TIKTOK[jenisPosting];

  const maksBerkasJenis = Math.min(
    ...platformDariTujuan(tujuan).map((p) => {
      const a = ATURAN_JENIS_POSTING[p][jenisPosting];
      return a?.maksBerkas ?? BATAS_MEDIA.maksBerkasSekaliUnggah;
    })
  );

  const pentingnya: string[] = [];
  if (aturanIG?.catatan) pentingnya.push(`Instagram: ${aturanIG.catatan}`);
  if (aturanTT?.catatan) pentingnya.push(`TikTok: ${aturanTT.catatan}`);

  const pilihBerkas = async (daftar: FileList) => {
    setGalat([]);
    const arr = Array.from(daftar);

    if (berkas.length + arr.length > BATAS_MEDIA.maksBerkasSekaliUnggah) {
      setGalat([`Maksimum ${BATAS_MEDIA.maksBerkasSekaliUnggah} berkas dalam satu unggahan.`]);
      if (masukan.current) masukan.current.value = '';
      return;
    }

    setProses(true);
    setKemajuan({ selesai: 0, total: arr.length });
    try {
      // Berurutan, bukan paralel: kompresi gambar & pembacaan video sekaligus
      // membuat peramban HP kelebihan memori dan seluruh proses bisa gagal.
      const { hasil, gagal } = await siapkanBanyakMedia(arr, {
        onProgres: (selesai, total) => setKemajuan({ selesai, total }),
      });

      const baru: BerkasForm[] = hasil.map((h) => ({
        nama: h.nama ?? 'berkas',
        jenis: h.jenis,
        mime: h.mime,
        byte: h.byte,
        lebar: h.lebar,
        tinggi: h.tinggi,
        durasiDetik: h.durasiDetik,
        data: h.dataUrl,
      }));

      const semua = [...berkas, ...baru];
      setBerkas(semua);

      const catatan: string[] = gagal.map((g) => `${g.nama}: ${g.pesan}`);

      // Kombinasi yang tidak mungkin dikoreksi otomatis + diberi tahu, supaya
      // kesalahannya ketemu di form, bukan nanti saat mengirim.
      const adaVideo = semua.some((b) => b.jenis === 'VIDEO');
      const adaGambar = semua.some((b) => b.jenis === 'GAMBAR');

      if (!adaVideo && adaGambar) {
        if (jenisPosting === 'REELS') {
          setJenisPosting('FEED');
          catatan.push('Reels memerlukan video — jenis postingan diubah ke Feed.');
        }
        if (tujuan === 'TIKTOK') {
          setTujuan('INSTAGRAM');
          catatan.push('TikTok tidak menerima gambar — tujuan diubah ke Instagram saja.');
        }
      }

      if (catatan.length > 0) setGalat(catatan);
    } catch (e) {
      setGalat([e instanceof Error ? e.message : 'Berkas tidak dapat diproses.']);
    } finally {
      setProses(false);
      setKemajuan(null);
      if (masukan.current) masukan.current.value = '';
    }
  };

  const geser = (i: number, arah: -1 | 1) => {
    const j = i + arah;
    if (j < 0 || j >= berkas.length) return;
    const salinan = [...berkas];
    [salinan[i], salinan[j]] = [salinan[j], salinan[i]];
    setBerkas(salinan);
  };

  const buang = (i: number) => setBerkas(berkas.filter((_, x) => x !== i));

  const totalByte = berkas.reduce((a, b) => a + b.byte, 0);
  const totalData = berkas.reduce((a, b) => a + (b.data ? b.data.length : 0), 0);
  const terlaluBesarTotal = totalData > BATAS_MEDIA.maksTotalDataUrl;

  // jenis berkas utama untuk kolom ringkasan di tabel Konten
  const jenisUtama: 'GAMBAR' | 'VIDEO' = berkas.some((b) => b.jenis === 'VIDEO')
    ? 'VIDEO'
    : 'GAMBAR';

  return (
    <div className="space-y-5">
      <form action={aksi} className="space-y-5">
        {konten?.id && <input type="hidden" name="id" value={konten.id} />}
        <input type="hidden" name="jenis" value={jenisUtama} />

        {/* setiap berkas dikirim sebagai field bernomor, urut sesuai daftar */}
        {berkas.map((b, i) => (
          <div key={b.id ?? `baru-${i}`}>
            {b.id && <input type="hidden" name={`mediaId${i}`} value={b.id} />}
            <input type="hidden" name={`mediaData${i}`} value={b.data ?? ''} />
            <input type="hidden" name={`mediaMime${i}`} value={b.mime} />
            <input type="hidden" name={`mediaByte${i}`} value={b.byte} />
            <input type="hidden" name={`mediaLebar${i}`} value={b.lebar ?? 0} />
            <input type="hidden" name={`mediaTinggi${i}`} value={b.tinggi ?? 0} />
            <input type="hidden" name={`durasiDetik${i}`} value={b.durasiDetik ?? 0} />
            <input type="hidden" name={`jenisBerkas${i}`} value={b.jenis} />
          </div>
        ))}

        {/* ===== 1. berkas ===== */}
        <section className="kartu p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-abu-800">1. Berkas konten</h2>
            <p className="text-[11px] tabular-nums text-abu-400">
              {berkas.length} berkas · {formatUkuran(totalByte)}
              {maksBerkasJenis < BATAS_MEDIA.maksBerkasSekaliUnggah &&
                ` · maks ${maksBerkasJenis} untuk ${LABEL_JENIS_POSTING[jenisPosting]}`}
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-abu-500">
            Gambar (JPG/PNG/WebP) dan video (MP4/MOV) hingga{' '}
            {formatUkuran(BATAS_MEDIA.videoMaksByte)} per berkas. Gambar dikecilkan dan dikonversi
            ke JPEG otomatis di peramban — Instagram hanya menerima JPEG, jadi konversi ini yang
            membuat unggahan tidak ditolak. Boleh pilih beberapa berkas sekaligus.
          </p>

          <div className="mt-4 space-y-2.5">
            {berkas.map((b, i) => (
              <div
                key={b.id ?? `tampil-${i}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-abu-200 bg-abu-50 p-2.5"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-biru-100 text-[11px] font-bold text-biru-700">
                  {i + 1}
                </span>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-abu-200 bg-white">
                  {b.jenis === 'VIDEO' ? (
                    <video src={b.url ?? b.data} className="h-full w-full object-cover" muted />
                  ) : b.url ?? b.data ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.url ?? b.data} alt={b.nama} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-[160px] flex-1">
                  <p className="baris-1 text-xs font-medium text-abu-800">{b.nama}</p>
                  <p className="text-[10px] tabular-nums text-abu-400">
                    {b.jenis === 'VIDEO' ? 'Video' : 'JPEG'}
                    {b.lebar ? ` · ${b.lebar}×${b.tinggi}` : ''} · {formatUkuran(b.byte)}
                    {b.durasiDetik ? ` · ${Math.round(b.durasiDetik)} dtk` : ''}
                    {b.id ? ' · tersimpan' : ' · baru'}
                  </p>
                  {i === 0 && (
                    <p className="text-[10px] font-medium text-biru-600">
                      berkas utama — tampil sebagai thumbnail di daftar
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => geser(i, -1)}
                    disabled={i === 0}
                    title="Naikkan urutan"
                    className="rounded border border-abu-300 bg-white px-2 py-1 text-[11px] text-abu-600 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => geser(i, 1)}
                    disabled={i === berkas.length - 1}
                    title="Turunkan urutan"
                    className="rounded border border-abu-300 bg-white px-2 py-1 text-[11px] text-abu-600 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => buang(i)}
                    className="rounded border border-bahaya/40 bg-white px-2 py-1 text-[11px] text-bahaya"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}

            {berkas.length === 0 && (
              <p className="rounded-lg border-2 border-dashed border-abu-300 bg-abu-50 px-4 py-8 text-center text-xs text-abu-400">
                Belum ada berkas. Pilih{jenisPosting === 'CAROUSEL' ? ' 2–10' : ''} berkas di bawah.
              </p>
            )}
          </div>

          <input
            ref={masukan}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={(e) => {
              if (e.target.files?.length) void pilihBerkas(e.target.files);
            }}
            className="hidden"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => masukan.current?.click()}
              disabled={proses || berkas.length >= BATAS_MEDIA.maksBerkasSekaliUnggah}
              className="tombol tombol-sekunder"
            >
              {proses
                ? `Memproses… ${kemajuan ? `${kemajuan.selesai}/${kemajuan.total}` : ''}`
                : berkas.length > 0
                  ? '+ Tambah berkas'
                  : 'Pilih berkas gambar / video'}
            </button>
            {berkas.length > 0 && (
              <span className="text-[11px] tabular-nums text-abu-400">
                Total data {formatUkuran(totalData)}
              </span>
            )}
          </div>

          {galat.length > 0 && (
            <div className="mt-3 space-y-1">
              {galat.map((g, i) => (
                <p
                  key={i}
                  className="rounded-lg bg-bahaya-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-bahaya"
                >
                  {g}
                </p>
              ))}
            </div>
          )}
          {terlaluBesarTotal && (
            <p className="mt-3 rounded-lg bg-bahaya-bg px-2.5 py-1.5 text-[11px] text-bahaya">
              Total berkas melebihi batas satu unggahan (
              {formatUkuran(BATAS_MEDIA.maksTotalDataUrl)}). Kurangi jumlah atau ukuran berkasnya.
            </p>
          )}
        </section>

        {/* ===== 2. jenis postingan ===== */}
        <section className="kartu space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold text-abu-800">2. Jenis postingan</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-abu-500">
              Menentukan bagaimana konten tampil di platform. Jenis yang tidak didukung platform
              tujuan ditandai dan tidak bisa dipilih.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {JENIS_POSTING.map((j) => {
              const didukung = platformDariTujuan(tujuan).every(
                (p) => ATURAN_JENIS_POSTING[p][j] !== undefined
              );
              const aktif = jenisPosting === j;
              return (
                <label
                  key={j}
                  className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 text-xs transition-colors ${
                    aktif ? 'border-biru-500 bg-biru-50' : 'border-abu-300 bg-white hover:bg-abu-50'
                  } ${didukung ? '' : 'cursor-not-allowed opacity-50'}`}
                >
                  <input
                    type="radio"
                    name="jenisPosting"
                    value={j}
                    checked={aktif}
                    disabled={!didukung}
                    onChange={() => setJenisPosting(j)}
                    className="mt-0.5 accent-biru-600"
                  />
                  <span className="min-w-0">
                    <span
                      className={`block font-semibold ${aktif ? 'text-biru-700' : 'text-abu-800'}`}
                    >
                      {LABEL_JENIS_POSTING[j]}
                    </span>
                    <span className="mt-0.5 block leading-relaxed text-abu-500">
                      {KETERANGAN_JENIS_POSTING[j]}
                    </span>
                    {!didukung && (
                      <span className="mt-1 block font-medium text-peringatan">
                        Tidak tersedia untuk tujuan yang dipilih.
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {pentingnya.length > 0 && (
            <ul className="space-y-1 text-[11px] leading-relaxed text-abu-500">
              {pentingnya.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          )}
        </section>

        {/* ===== 3. judul & caption ===== */}
        <section className="kartu space-y-4 p-5">
          <h2 className="text-sm font-semibold text-abu-800">3. Judul & caption</h2>

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
              {jenisPosting === 'STORY' && (
                <span className="ml-2 font-normal text-peringatan">
                  tidak ditampilkan pada story
                </span>
              )}
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
                caption.length > 2200 ? 'font-semibold text-bahaya' : 'text-abu-400'
              }`}
            >
              {caption.length} / 2200 karakter
              {caption.length > 2200 && ' — melebihi batas TikTok & Instagram'}
            </p>
          </div>
        </section>

        {/* ===== 4. tujuan & penyetuju ===== */}
        <section className="kartu space-y-4 p-5">
          <h2 className="text-sm font-semibold text-abu-800">4. Tujuan & penyetuju</h2>

          <div>
            <span className="mb-2 block text-xs font-medium text-abu-600">Platform tujuan</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {TUJUAN.map((t) => {
                const alasanMati = alasanTujuanMati(t, jenisPosting);
                const aktif = tujuan === t;
                return (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                      aktif
                        ? 'border-biru-500 bg-biru-50 font-semibold text-biru-700'
                        : 'border-abu-300 bg-white text-abu-600 hover:bg-abu-50'
                    } ${alasanMati ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <input
                      type="radio"
                      name="tujuan"
                      value={t}
                      checked={aktif}
                      disabled={Boolean(alasanMati)}
                      onChange={() => setTujuan(t)}
                      className="accent-biru-600"
                    />
                    {LABEL_TUJUAN[t]}
                  </label>
                );
              })}
            </div>
            {alasanTujuanMati(tujuan, jenisPosting) && (
              <p className="mt-2 text-[11px] leading-relaxed text-peringatan">
                {alasanTujuanMati(tujuan, jenisPosting)}
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

        {/* ===== hasil pemeriksaan ===== */}
        {penghalang.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-bahaya">
              Tidak bisa diajukan / dikirim sebelum ini dibereskan:
            </p>
            {penghalang.map((m, i) => (
              <p
                key={i}
                className="rounded-lg bg-bahaya-bg px-3 py-2 text-[11px] leading-relaxed text-bahaya"
              >
                <strong>{m.platform}:</strong> {m.pesan}
              </p>
            ))}
          </div>
        )}
        {peringatan.length > 0 && (
          <div className="space-y-1.5">
            {peringatan.map((m, i) => (
              <p
                key={i}
                className="rounded-lg bg-peringatan-bg px-3 py-2 text-[11px] leading-relaxed text-peringatan"
              >
                <strong>{m.platform}:</strong> {m.pesan}
              </p>
            ))}
          </div>
        )}

        {state.error && (
          <p className="rounded-lg bg-bahaya-bg px-3 py-2 text-xs leading-relaxed text-bahaya">
            {state.error}
          </p>
        )}
        {state.sukses && (
          <p className="rounded-lg bg-sukses-bg px-3 py-2 text-xs text-sukses">{state.pesan}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <TombolSimpan
            label={konten?.id ? 'Simpan perubahan' : 'Simpan sebagai draft'}
            disabled={proses || terlaluBesarTotal}
          />
          <span className="text-[11px] text-abu-400">
            Draft boleh disimpan belum lengkap; kelengkapannya diperiksa saat diajukan.
          </span>
        </div>
      </form>
    </div>
  );
}

/**
 * Pesan mengapa sebuah tujuan tidak bisa dipakai untuk jenis postingan ini.
 * Dipakai dua tempat (menonaktifkan pilihan + menjelaskan), jadi ditulis sekali.
 */
function alasanTujuanMati(tujuan: Tujuan, jenisPosting: JenisPosting): string | null {
  const tidakDidukung = platformDariTujuan(tujuan).filter(
    (p) => ATURAN_JENIS_POSTING[p][jenisPosting] === undefined
  );
  if (tidakDidukung.length === 0) return null;

  return tidakDidukung
    .map((p) =>
      p === 'TIKTOK' && jenisPosting === 'STORY'
        ? 'TikTok tidak menerima story lewat API — story hanya bisa dibuat di aplikasi TikTok. Pilih "Instagram saja".'
        : `${p === 'TIKTOK' ? 'TikTok' : 'Instagram'} belum mendukung jenis "${
            LABEL_JENIS_POSTING[jenisPosting]
          }".`
    )
    .join(' ');
}

function TombolSimpan({ label, disabled }: { label: string; disabled?: boolean }) {
  const { sibuk, tandaiKirim } = useKirimForm();
  return (
    <button
      type="submit"
      disabled={sibuk || disabled}
      onClick={tandaiKirim}
      className="tombol tombol-utama"
    >
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
