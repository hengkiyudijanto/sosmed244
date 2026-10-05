/**
 * Konfigurasi PostCSS.
 *
 * WAJIB ADA. Tanpa berkas ini, `@import "tailwindcss"` di globals.css tidak
 * pernah diproses: hasil build hanya memuat aturan CSS yang ditulis manual
 * (kelas .kartu, .tombol) sementara SEMUA utility Tailwind hilang. Gejalanya
 * menipu — halaman tetap tampil, tetapi tanpa tata letak: navigasi berantakan,
 * kartu bertumpuk vertikal, tombol kembali ke gaya bawaan peramban.
 *
 * Cara memeriksa kalau ragu: hitung aturan di CSS hasil build.
 *   grep -c "" .next/static/chunks/*.css   → ratusan aturan = benar,
 *   belasan = Tailwind tidak jalan.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
