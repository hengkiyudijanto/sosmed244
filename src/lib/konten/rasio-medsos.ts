/**
 * ATURAN RASIO INSTAGRAM — fungsi murni, tanpa Prisma/peramban.
 *
 * Kenapa dipisah: pratinjau HP harus memotong gambar PERSIS seperti Instagram,
 * dan peringatan di form harus memakai rentang yang sama. Kalau aturannya
 * ditulis dua kali, cepat atau lambat keduanya berbeda — dan bedanya muncul
 * sebagai "pratinjau bilang aman, ternyata di Instagram terpotong".
 *
 * Sumber: dokumentasi Meta (Instagram Content Publishing / IG User Media).
 *  - Foto Feed diterima dalam rentang 4:5 (potret) sampai 1.91:1 (lanskap).
 *    Di dalam rentang itu gambar TIDAK dipotong.
 *  - Di luar rentang, Instagram memotong ke batas terdekat, potongan TENGAH.
 *  - Story & Reels: dipotong tengah ke 9:16.
 *  - Carousel: SEMUA berkas dipotong mengikuti berkas pertama (1:1 default).
 *  - Video tidak dipotong oleh sistem kita; platform yang mengurusnya.
 */

/** Rentang rasio yang diterima Instagram untuk foto Feed. */
export const RASIO_IG = {
  /** potret terjangkau — 4:5 */
  min: 4 / 5,
  /** lanskap terjangkau — 1.91:1 */
  maks: 1.91,
} as const;

export type JenisRasio = 'FEED' | 'STORY' | 'REELS' | 'CAROUSEL';

/**
 * Rasio (lebar/tinggi) yang dipakai Instagram untuk MENAMPILKAN berkas ini.
 *
 * Feed/Carousel: rasio asli berkas, tetapi dijepit ke rentang 4:5–1.91:1 —
 * itulah bentuk yang benar-benar tayang. Carousel memakai berkas PERTAMA
 * sebagai acuan (berkas lain di dalam satu unggahan mengikutinya), dan berkas
 * pertama yang rasionya di luar rentang dijepit sama seperti feed biasa.
 *
 * Story/Reels: selalu 9/16.
 */
export function rasioTampil(
  jenis: JenisRasio,
  rasioAsli: number | null
): { lebar: number; tinggi: number; dijepit: boolean; rasio: number } {
  const diketahui = Boolean(rasioAsli && Number.isFinite(rasioAsli) && rasioAsli > 0);

  if (jenis === 'STORY' || jenis === 'REELS') {
    // Story/Reels SELALU 9:16. Kalau berkasnya bukan 9:16, isinya memang
    // terpotong — jadi `dijepit` harus true supaya peringatannya muncul.
    // (Dulu selalu false, dan itu membuat foto kotak di story dilaporkan
    // "aman" padahal 43% tingginya terbuang.)
    const sama = diketahui && Math.abs((rasioAsli as number) - 9 / 16) < 0.001;
    return { lebar: 9, tinggi: 16, dijepit: diketahui && !sama, rasio: 9 / 16 };
  }

  // rasio tidak diketahui: pakai 1:1 (perilaku bawaan Instagram untuk carousel)
  if (!diketahui) {
    return { lebar: 1, tinggi: 1, dijepit: false, rasio: 1 };
  }
  const r = rasioAsli as number;

  if (r < RASIO_IG.min) {
    return { lebar: 4, tinggi: 5, dijepit: true, rasio: RASIO_IG.min };
  }
  if (r > RASIO_IG.maks) {
    return { lebar: 191, tinggi: 100, dijepit: true, rasio: RASIO_IG.maks };
  }

  // di dalam rentang: pakai rasio asli apa adanya (tidak dipotong)
  return { lebar: 0, tinggi: 0, dijepit: false, rasio: r };
}

/**
 * Berapa bagian gambar yang HILANG karena dipotong. 0,25 = seperempat gambar
 * terbuang.
 *
 * Dipakai untuk memperingatkan: potongan kecil tidak perlu dikhawatirkan,
 * potongan besar perlu diperbaiki fotografernya.
 */
export function bagianTerpotong(jenis: JenisRasio, rasioAsli: number | null): number {
  if (!rasioAsli || !Number.isFinite(rasioAsli) || rasioAsli <= 0) return 0;
  const tampil = rasioTampil(jenis, rasioAsli);
  if (!tampil.dijepit) return 0;

  // potongan tengah: sisi yang lebih panjang dipangkas sampai muat
  if (rasioAsli > tampil.rasio) {
    // terlalu lebar -> lebar yang dipangkas
    return 1 - tampil.rasio / rasioAsli;
  }
  // terlalu tinggi -> tinggi yang dipangkas
  return 1 - rasioAsli / tampil.rasio;
}

/** Peringatan siap-tampil untuk sebuah berkas, atau null kalau rasio aman. */
export function peringatanRasio(
  jenis: JenisRasio,
  rasioAsli: number | null,
  namaBerkas: string
): string | null {
  if (!rasioAsli || !Number.isFinite(rasioAsli) || rasioAsli <= 0) return null;

  const bagian = bagianTerpotong(jenis, rasioAsli);
  // di bawah 2% tidak terlihat mata — jangan menakuti tanpa sebab
  if (bagian < 0.02) return null;

  const persen = Math.round(bagian * 100);
  const label = `${(rasioAsli).toFixed(2)}:1`;
  const arah = rasioAsli > rasioTampil(jenis, rasioAsli).rasio ? 'kiri-kanan' : 'atas-bawah';

  if (jenis === 'STORY' || jenis === 'REELS') {
    return `${namaBerkas} (${label}) dipotong ${persen}% di ${arah} agar pas 9:16.`;
  }
  return `${namaBerkas} (${label}) dipotong ${persen}% di ${arah} — di luar rentang 4:5 sampai 1.91:1 yang diterima Instagram.`;
}
