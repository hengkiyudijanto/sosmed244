/**
 * Membaca riwayat keputusan konten untuk menjawab satu pertanyaan:
 * "apakah isi konten ini pernah diubah orang lain selain pembuatnya?"
 *
 * Kenapa perlu: aturan menolak "menyetujui konten sendiri" melindungi dari
 * penilaian yang tidak jernih. Tetapi ada jalur yang tidak tertutup oleh aturan
 * itu — seseorang (biasanya Admin) mengubah ISI konten orang lain, lalu
 * menyetujuinya. Dia bukan pemiliknya, jadi aturan itu tidak berlaku untuknya.
 *
 * Jalur itu TIDAK dilarang, dan itu disengaja: dengan satu Admin, melarangnya
 * membuat pekerjaan berhenti tanpa orang lain yang bisa menggantikan. Yang
 * dilakukan di sini adalah membuat jalur itu TERBACA — penyetuju/pemeriksa
 * diberi tahu apa adanya, lalu menilai sendiri.
 *
 * Fungsi murni (tanpa Prisma) supaya bisa diuji tanpa database.
 */

export type BarisRiwayat = {
  aksi: string;
  catatan?: string | null;
  olehId: string;
  oleh: { nama: string };
  createdAt: Date | string;
};

export type PerubahanOrangLain = {
  /** nama orang yang mengubah, atau 'sistem' kalau pengguna sudah dihapus */
  oleh: string;
  /** apa yang diubah, dari catatan barisnya */
  apa: string;
  kapan: Date | string;
};

/**
 * Daftar perubahan isi oleh orang selain pembuat konten, terbaru dulu.
 *
 * `pembuatId` dibutuhkan karena baris riwayat tidak menyimpan siapa pemilik
 * kontennya — hanya siapa yang melakukan aksi.
 */
export function perubahanOlehOrangLain(
  riwayat: BarisRiwayat[],
  pembuatId: string
): PerubahanOrangLain[] {
  return riwayat
    .filter((r) => r.aksi === 'DIUBAH' && r.olehId !== pembuatId)
    .map((r) => {
      const catatan = (r.catatan ?? '').trim();
      // buang keterangan "Konten ini dibuat orang lain." dari tampilan: yang
      // dibutuhkan pemeriksa adalah APA yang berubah, bukan pengulangan fakta
      // bahwa kontennya bukan milik pengubah.
      const apa = catatan
        .replace(/\s*Konten ini dibuat orang lain\.\s*$/, '')
        .replace(/^Mengubah\s+/, '')
        .trim()
        // titik terakhir ikut terbuang bersama kalimat yang dibuang
        .replace(/\.\s*$/, '')
        .trim();
      return {
        oleh: r.oleh?.nama ?? 'pengguna yang sudah dihapus',
        apa: apa || 'isi konten',
        kapan: r.createdAt,
      };
    });
}

/**
 * Apakah perubahan orang lain terjadi SETELAH konten diajukan?
 *
 * Ini yang paling perlu disorot: kalau Admin mengubah isi setelah kreator
 * mengajukannya, maka yang sedang diperiksa penyetuju BUKAN lagi isi yang
 * diajukan kreator. Perubahan sebelum pengajuan tidak sepenting itu.
 *
 * Patokan waktu diambil dari `diajukanAt` (kolom Konten) kalau ada, dan baru
 * jatuh ke baris AJUKAN di riwayat. Alasannya nyata: konten buatan skrip seed
 * dibuat langsung berstatus MENUNGGU tanpa baris AJUKAN, sehingga versi yang
 * hanya membaca riwayat melaporkan "aman" untuk konten yang jelas-jelas
 * diubah setelah diajukan.
 */
export function diubahSetelahDiajukan(
  riwayat: BarisRiwayat[],
  pembuatId: string,
  diajukanAt?: Date | string | null
): boolean {
  const dariKolom = diajukanAt ? new Date(diajukanAt).getTime() : undefined;
  const dariRiwayat = riwayat
    .filter((r) => r.aksi === 'AJUKAN')
    .map((r) => new Date(r.createdAt).getTime())
    .sort((a, b) => b - a)[0];

  // ambil yang TERBARU di antara keduanya: kalau konten diajukan ulang setelah
  // revisi, kolom diajukanAt diperbarui dan itu yang berlaku
  const patokan =
    dariKolom !== undefined && dariRiwayat !== undefined
      ? Math.max(dariKolom, dariRiwayat)
      : (dariKolom ?? dariRiwayat);

  if (patokan === undefined || Number.isNaN(patokan)) return false;

  return riwayat.some(
    (r) =>
      r.aksi === 'DIUBAH' &&
      r.olehId !== pembuatId &&
      new Date(r.createdAt).getTime() > patokan
  );
}
