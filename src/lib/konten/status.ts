/**
 * ATURAN STATUS & VALIDASI PLATFORM — fungsi murni, tanpa Prisma.
 *
 * Berkas ini TIDAK boleh mengimpor Prisma: komponen klien ikut memakainya, dan
 * kalau driver `pg` ikut ke bundel browser, build gagal dengan pesan
 * "Can't resolve 'dns'" yang tidak menyebut Prisma sama sekali.
 *
 * Semua keputusan transisi status hidup DI SINI (dengan unit test), bukan
 * tersebar di halaman. Kalau aturannya berubah, ubah di satu tempat.
 */

// ===========================================================================
// Platform
// ===========================================================================

export const PLATFORM = ['TIKTOK', 'INSTAGRAM'] as const;
export type Platform = (typeof PLATFORM)[number];

export const LABEL_PLATFORM: Record<Platform, string> = {
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
};

export const TUJUAN = ['TIKTOK', 'INSTAGRAM', 'KEDUANYA'] as const;
export type Tujuan = (typeof TUJUAN)[number];

export const LABEL_TUJUAN: Record<Tujuan, string> = {
  TIKTOK: 'TikTok saja',
  INSTAGRAM: 'Instagram saja',
  KEDUANYA: 'TikTok & Instagram',
};

/** Satu tujuan bisa berarti dua platform. */
export function platformDariTujuan(t: Tujuan): Platform[] {
  return t === 'KEDUANYA' ? ['TIKTOK', 'INSTAGRAM'] : [t];
}

// ===========================================================================
// Batasan platform — divalidasi SEBELUM kirim, bukan sesudah ditolak
// ===========================================================================

export type BatasPlatform = {
  maksCaption: number;
  maksByte: number;
  mimeGambar: string[];
  mimeVideo: string[];
  maksDurasiDetik: number | null;
  /** Instagram feed menolak selain JPEG. */
  wajibJpeg: boolean;
  catatan: string;
};

export const BATAS_PLATFORM: Record<Platform, BatasPlatform> = {
  TIKTOK: {
    maksCaption: 2200,
    maksByte: 4 * 1024 * 1024 * 1024,
    mimeGambar: [],
    mimeVideo: ['video/mp4', 'video/quicktime', 'video/webm'],
    maksDurasiDetik: 600,
    wajibJpeg: false,
    catatan: 'TikTok hanya menerima video — gambar tidak dapat diposting langsung.',
  },
  INSTAGRAM: {
    maksCaption: 2200,
    maksByte: 100 * 1024 * 1024,
    mimeGambar: ['image/jpeg'],
    mimeVideo: ['video/mp4', 'video/quicktime'],
    maksDurasiDetik: 900,
    wajibJpeg: true,
    catatan: 'Instagram feed hanya menerima gambar JPEG (bukan PNG/WebP).',
  },
};

export type Masalah = { platform: Platform; pesan: string };

/**
 * Periksa kelayakan kirim. Mengembalikan daftar masalah; KOSONG = aman dikirim.
 *
 * Dipakai dua tempat: form (memberi tahu sebelum menekan Simpan) dan adapter
 * pengiriman (menolak sebelum memanggil API platform). Satu sumber kebenaran,
 * jadi pesan yang dibaca pengguna sama dengan yang dipakai mesin.
 */
export function periksaKelayakan(input: {
  tujuan: Tujuan;
  jenis: 'GAMBAR' | 'VIDEO';
  caption: string;
  ukuranByte: number;
  mime: string;
  durasiDetik?: number | null;
}): Masalah[] {
  const masalah: Masalah[] = [];

  for (const platform of platformDariTujuan(input.tujuan)) {
    const batas = BATAS_PLATFORM[platform];

    if (platform === 'TIKTOK' && input.jenis === 'GAMBAR') {
      masalah.push({
        platform,
        pesan: `${batas.catatan} Pilih tujuan Instagram saja, atau unggah video.`,
      });
      continue; // batas lain tidak relevan kalau platformnya memang tidak menerima
    }

    if (input.caption.length > batas.maksCaption) {
      masalah.push({
        platform,
        pesan: `Caption ${input.caption.length} karakter, melebihi batas ${batas.maksCaption}.`,
      });
    }

    if (input.ukuranByte > batas.maksByte) {
      masalah.push({
        platform,
        pesan: `Ukuran berkas terlalu besar (maks ${Math.round(batas.maksByte / 1024 / 1024)} MB).`,
      });
    }

    const mimeSah =
      input.jenis === 'VIDEO' ? batas.mimeVideo : batas.mimeGambar;
    if (input.mime && mimeSah.length > 0 && !mimeSah.includes(input.mime)) {
      masalah.push({
        platform,
        pesan:
          input.jenis === 'VIDEO'
            ? `Format video ${input.mime} tidak didukung.`
            : `${batas.catatan} Berkas ini ${input.mime}.`,
      });
    }

    if (
      input.jenis === 'VIDEO' &&
      batas.maksDurasiDetik &&
      (input.durasiDetik ?? 0) > batas.maksDurasiDetik
    ) {
      masalah.push({
        platform,
        pesan: `Durasi video melebihi batas ${Math.round(batas.maksDurasiDetik / 60)} menit.`,
      });
    }
  }

  return masalah;
}

// ===========================================================================
// Status & mesin transisi
// ===========================================================================

export const STATUS = [
  'DRAFT',
  'MENUNGGU',
  'REVISI',
  'DISETUJUI',
  'DIJADWALKAN',
  'DIKIRIM',
  'DIARSIPKAN',
] as const;
export type Status = (typeof STATUS)[number];

export const LABEL_STATUS: Record<Status, string> = {
  DRAFT: 'Draft',
  MENUNGGU: 'Menunggu persetujuan',
  REVISI: 'Perlu revisi',
  DISETUJUI: 'Disetujui',
  DIJADWALKAN: 'Dijadwalkan',
  DIKIRIM: 'Terkirim',
  DIARSIPKAN: 'Diarsipkan',
};

/**
 * Kelas Tailwind untuk lencana status.
 * Ditulis sebagai string literal utuh (bukan gabungan) supaya Tailwind
 * benar-benar menemukan kelasnya saat memindai berkas.
 */
export const WARNA_STATUS: Record<Status, string> = {
  DRAFT: 'bg-abu-100 text-abu-600',
  MENUNGGU: 'bg-peringatan-bg text-peringatan',
  REVISI: 'bg-bahaya-bg text-bahaya',
  DISETUJUI: 'bg-biru-100 text-biru-700',
  DIJADWALKAN: 'bg-biru-100 text-biru-700',
  DIKIRIM: 'bg-sukses-bg text-sukses',
  DIARSIPKAN: 'bg-abu-100 text-abu-400',
};

export const IKON_STATUS: Record<Status, string> = {
  DRAFT: '✎',
  MENUNGGU: '⧗',
  REVISI: '↩',
  DISETUJUI: '✓',
  DIJADWALKAN: '⌚',
  DIKIRIM: '⇪',
  DIARSIPKAN: '🗄',
};

/** Apa arti status ini bagi pemakai — satu baris, tanpa istilah teknis. */
export const KETERANGAN_STATUS: Record<Status, string> = {
  DRAFT: 'Masih bisa diubah bebas. Belum dilihat siapa pun.',
  MENUNGGU:
    'Sudah diajukan. Menunggu keputusan penyetuju — isi tidak bisa diubah sampai ditarik.',
  REVISI: 'Dikembalikan penyetuju. Baca alasannya, perbaiki, lalu ajukan ulang.',
  DISETUJUI: 'Sudah lolos approval. Siap dikirim ke platform.',
  DIJADWALKAN: 'Akan dikirim pada waktu yang ditentukan.',
  DIKIRIM: 'Sudah dipublikasikan ke platform.',
  DIARSIPKAN: 'Disimpan sebagai arsip dan tidak akan dikirim.',
};

export type Aksi =
  | 'AJUKAN'
  | 'SETUJUI'
  | 'MINTA_REVISI'
  | 'TARIK'
  | 'KIRIM'
  | 'JADWALKAN'
  | 'BATAL_JADWAL'
  | 'ARSIPKAN';

/// Peran dalam konteks transisi: apakah pelakunya pembuat konten atau penyetuju.
export type PeranTransisi = 'PEMILIK' | 'PENYETUJU';

export type HasilTransisi =
  | { boleh: true; statusBaru: Status }
  | { boleh: false; alasan: string };

/**
 * TABEL TRANSISI STATUS — kontrak alur approval.
 *
 *   DRAFT ──ajukan──► MENUNGGU ──setujui──► DISETUJUI ──kirim──► DIKIRIM
 *     ▲                  │                     │  ▲
 *     └────tarik──── REVISI ◄──minta revisi─────┘  └──jadwalkan──► DIJADWALKAN
 */
export function transisi(
  status: Status,
  aksi: Aksi,
  peran: PeranTransisi
): HasilTransisi {
  const tolak = (alasan: string): HasilTransisi => ({ boleh: false, alasan });
  const boleh = (s: Status): HasilTransisi => ({ boleh: true, statusBaru: s });
  const label = (s: Status) => LABEL_STATUS[s].toLowerCase();

  switch (aksi) {
    case 'AJUKAN':
      if (peran !== 'PEMILIK') return tolak('Hanya pembuat konten yang dapat mengajukan.');
      return status === 'DRAFT' || status === 'REVISI'
        ? boleh('MENUNGGU')
        : tolak(
            `Konten berstatus ${label(status)} tidak dapat diajukan. Hanya draft atau konten yang perlu revisi.`
          );

    case 'TARIK':
      if (peran !== 'PEMILIK') return tolak('Hanya pembuat konten yang dapat menarik pengajuan.');
      return status === 'MENUNGGU'
        ? boleh('DRAFT')
        : tolak(`Konten berstatus ${label(status)} tidak sedang menunggu persetujuan.`);

    case 'SETUJUI':
      if (peran !== 'PENYETUJU') return tolak('Hanya penyetuju yang dapat menyetujui.');
      return status === 'MENUNGGU'
        ? boleh('DISETUJUI')
        : tolak(`Hanya konten yang menunggu persetujuan dapat disetujui (sekarang ${label(status)}).`);

    case 'MINTA_REVISI':
      if (peran !== 'PENYETUJU') return tolak('Hanya penyetuju yang dapat meminta revisi.');
      return status === 'MENUNGGU' || status === 'DISETUJUI'
        ? boleh('REVISI')
        : tolak(`Konten berstatus ${label(status)} tidak dapat diminta revisi.`);

    case 'KIRIM':
      if (peran !== 'PEMILIK' && peran !== 'PENYETUJU') return tolak('Tidak berwenang.');
      return status === 'DISETUJUI' || status === 'DIJADWALKAN'
        ? boleh('DIKIRIM')
        : tolak(
            `Hanya konten yang sudah disetujui yang boleh dikirim ke platform (sekarang ${label(status)}).`
          );

    case 'JADWALKAN':
      if (peran !== 'PEMILIK' && peran !== 'PENYETUJU') return tolak('Tidak berwenang.');
      return status === 'DISETUJUI'
        ? boleh('DIJADWALKAN')
        : tolak(`Hanya konten yang disetujui dapat dijadwalkan (sekarang ${label(status)}).`);

    case 'BATAL_JADWAL':
      if (peran !== 'PEMILIK' && peran !== 'PENYETUJU') return tolak('Tidak berwenang.');
      return status === 'DIJADWALKAN'
        ? boleh('DISETUJUI')
        : tolak('Konten ini tidak sedang dijadwalkan.');

    case 'ARSIPKAN':
      if (peran !== 'PEMILIK' && peran !== 'PENYETUJU') return tolak('Tidak berwenang.');
      return status === 'DRAFT' || status === 'REVISI'
        ? boleh('DIARSIPKAN')
        : tolak(
            `Konten berstatus ${label(status)} tidak dapat diarsipkan. Tarik dulu pengajuannya.`
          );
  }
}

/** Status yang masih boleh diubah pemiliknya (judul, media, caption). */
export function bisaDiubah(status: Status): boolean {
  return status === 'DRAFT' || status === 'REVISI';
}

/**
 * Ringkasan untuk dasbor. Dipisah dari halaman supaya hitungannya bisa diuji
 * dan tidak berbeda antara dasbor dan daftar.
 */
export function ringkasStatus(jumlah: Partial<Record<Status, number>>) {
  return {
    total: STATUS.reduce((a, s) => a + (jumlah[s] ?? 0), 0),
    terkirim: jumlah.DIKIRIM ?? 0,
    menunggu: jumlah.MENUNGGU ?? 0,
    perluRevisi: jumlah.REVISI ?? 0,
    siapKirim: (jumlah.DISETUJUI ?? 0) + (jumlah.DIJADWALKAN ?? 0),
    draft: jumlah.DRAFT ?? 0,
  };
}
