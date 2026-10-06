import Image from 'next/image';

/**
 * Logo Bank BTN — berkas yang sama dengan yang dipakai btn-sip
 * (public/btn-logo.png: huruf "btn" biru dengan aksen merah, latar transparan).
 *
 * Catatan pemakaian di aplikasi ini:
 * Logo aslinya BIRU, sedangkan bilah atas sosmed244 berlatar biru tua — logo biru
 * di atas biru tidak terbaca. Karena itu di latar gelap dipakai
 * `className="brightness-0 invert"` yang membuatnya menjadi putih solid (pola yang
 * sama dipakai btn-sip). Warna korporat BTN tetap terlihat di halaman berlatar
 * terang seperti kartu masuk.
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
