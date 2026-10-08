import Image from 'next/image';

/**
 * Logo Bank BTN — berkas yang sama dengan yang dipakai btn-sip
 * (public/btn-logo.png: huruf "btn" biru dengan aksen merah, latar transparan).
 *
 * Catatan pemakaian di aplikasi ini:
 * Logonya berwarna korporat (biru + merah) dan itu memang dipertahankan — yang
 * memakai warna aksen tema hanya antarmukanya. Karena temanya gelap, logo
 * diletakkan di permukaan yang cukup terang (kartu hijau mint di halaman masuk,
 * atau lewat kelas tambahan di pemanggilnya) supaya tetap terbaca.
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
      src="/btn-logo.png"
      alt="Bank BTN"
      height={tinggi}
      // rasio asli berkas 75×30 ≈ 1,6
      width={Math.round(tinggi * 1.6)}
      priority={prioritas}
      className={`object-contain ${className}`}
    />
  );
}
