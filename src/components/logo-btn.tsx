import Image from 'next/image';

/**
 * Logo Bank BTN — berkas yang sama dengan yang dipakai btn-sip
 * (huruf "btn" biru dengan aksen merah, latar transparan).
 *
 * RESOLUSI — jangan dikembalikan ke btn-logo.png (75×30 px):
 * berkas sekecil itu hanya tajam sampai ~30px, sedangkan sidebar menampilkan
 * logo 76px. Dipakai `btn-logo-hd.png` (780×440 px, dari berkas 1280×1280
 * kiriman pengguna, latar dipindahkan ke transparan) sehingga tajam sampai
 * tinggi ~440px — boleh diperbesar lagi tanpa alasan resolusi.
 * Rasio berkasnya 780:440 = 1,773 (BUKAN 2,5 seperti berkas lama).
 *
 * Catatan pemakaian di aplikasi ini:
 * Logonya berwarna korporat (biru + merah) dan itu memang dipertahankan — yang
 * memakai warna aksen tema hanya antarmukanya. Karena temanya gelap, logo
 * diletakkan di permukaan yang cukup terang (blok mint di sidebar, panel hijau
 * mint di halaman masuk) supaya tetap terbaca.
 *
 * `prioritas` dinyalakan secara bawaan karena logo selalu berada di layar pertama
 * (bilah atas / halaman masuk), jadi tidak boleh tertunda pemuatannya.
 */
export function LogoBTN({
  tinggi = 32,
  className = '',
  prioritas = true,
}: {
  tinggi?: number;
  className?: string;
  prioritas?: boolean;
}) {
  return (
    <Image
      src="/btn-logo-hd.png"
      alt="Bank BTN"
      // Ukuran ditulis lewat `style`, BUKAN hanya lewat atribut height/width:
      // preflight Tailwind memasang `img { max-width: 100%; height: auto }`, dan
      // di dalam flex yang menyusut aturan itu menang atas atribut — hasilnya
      // logo setinggi 76px hanya dirender ~44px. Style eksplisit mengunci
      // tingginya, sementara lebarnya mengikuti rasio asli berkas (75×30 = 2,5).
      height={tinggi}
      width={Math.round(tinggi * 1.773)}
      style={{ height: tinggi, width: 'auto' }}
      priority={prioritas}
      className={`object-contain ${className}`}
    />
  );
}
