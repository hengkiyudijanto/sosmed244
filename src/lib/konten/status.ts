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

// ===========================================================================
// Jenis postingan
// ===========================================================================

export const JENIS_POSTING = ['FEED', 'STORY', 'REELS', 'CAROUSEL'] as const;
export type JenisPosting = (typeof JENIS_POSTING)[number];

export const LABEL_JENIS_POSTING: Record<JenisPosting, string> = {
  FEED: 'Feed',
  STORY: 'Story',
  REELS: 'Reels',
  CAROUSEL: 'Carousel',
};

export const KETERANGAN_JENIS_POSTING: Record<JenisPosting, string> = {
  FEED: 'Unggahan biasa di beranda — satu gambar atau satu video.',
  STORY: 'Tampil 24 jam lalu hilang. Caption tidak ditampilkan. Boleh beberapa berkas sekaligus; Instagram menayangkannya satu per satu.',
  REELS: 'Video pendek vertikal. Hanya menerima video.',
  CAROUSEL: 'Beberapa berkas dalam satu unggahan — pengguna menggeser untuk melihat semuanya.',
};

/** Aturan per jenis postingan untuk setiap platform. */
export type AturanJenis = {
  /** jumlah berkas minimal yang masuk akal (0 = boleh tanpa berkas saat draft) */
  minBerkas: number;
  /** jumlah berkas maksimal, atau null kalau tidak dibatasi */
  maksBerkas: number | null;
  /** hanya menerima video? */
  wajibVideo: boolean;
  /** hanya menerima gambar? */
  wajibGambar: boolean;
  /** caption dipakai platform? kalau false, caption diabaikan saat kirim */
  captionDipakai: boolean;
  catatan: string;
};

export const ATURAN_JENIS_POSTING: Record<
  Platform,
  Partial<Record<JenisPosting, AturanJenis>>
> = {
  INSTAGRAM: {
    FEED: {
      minBerkas: 1,
      maksBerkas: 1,
      wajibVideo: false,
      wajibGambar: false,
      captionDipakai: true,
      catatan: 'Satu gambar (JPEG) atau satu video.',
    },
    REELS: {
      minBerkas: 1,
      maksBerkas: 1,
      wajibVideo: true,
      wajibGambar: false,
      captionDipakai: true,
      catatan: 'Reels hanya menerima video.',
    },
    STORY: {
      minBerkas: 1,
      maksBerkas: null,
      wajibVideo: false,
      wajibGambar: false,
      captionDipakai: false,
      catatan: 'Caption tidak ditampilkan pada story — Instagram mengabaikannya.',
    },
    CAROUSEL: {
      minBerkas: 2,
      maksBerkas: 10,
      wajibVideo: false,
      wajibGambar: false,
      captionDipakai: true,
      catatan:
        'Carousel berisi 2–10 berkas (boleh campur gambar & video). Semua gambar dipotong mengikuti rasio berkas pertama.',
    },
  },

  TIKTOK: {
    // TikTok Content Posting API tidak mengirim STORY sama sekali (story hanya
    // bisa dibuat di aplikasi TikTok, tidak lewat API). Karena itu STORY tidak
    // ada di daftar ini — dan permintaan story ke TikTok ditolak dengan pesan
    // yang menjelaskan sebabnya, bukan kegagalan tanpa keterangan.
    FEED: {
      minBerkas: 1,
      maksBerkas: 1,
      wajibVideo: true,
      wajibGambar: false,
      captionDipakai: true,
      catatan: 'TikTok hanya menerima video.',
    },
    REELS: {
      minBerkas: 1,
      maksBerkas: 1,
      wajibVideo: true,
      wajibGambar: false,
      captionDipakai: true,
      catatan: 'TikTok hanya menerima video.',
    },
  },
};

/** Kenapa jenis ini tidak tersedia di platform tersebut (null = tersedia). */
export function alasanJenisTidakAda(
  jenis: JenisPosting,
  platform: Platform
): string | null {
  if (ATURAN_JENIS_POSTING[platform][jenis]) return null;
  if (platform === 'TIKTOK' && jenis === 'STORY') {
    return 'TikTok tidak menerima story lewat API — story hanya bisa dibuat langsung di aplikasi TikTok.';
  }
  if (platform === 'TIKTOK' && jenis === 'CAROUSEL') {
    return 'TikTok tidak menerima carousel lewat API untuk saat ini.';
  }
  return `Jenis postingan ini belum didukung ${LABEL_PLATFORM[platform]}.`;
}

/** Apakah jenis postingan ini mungkin untuk seluruh tujuan yang dipilih? */
export function jenisCocokUntukTujuan(jenis: JenisPosting, tujuan: Tujuan): boolean {
  return platformDariTujuan(tujuan).every(
    (p) => ATURAN_JENIS_POSTING[p][jenis] !== undefined
  );
}

// ===========================================================================
// Masukan pemeriksaan kelayakan
// ===========================================================================

export type BerkasKonten = {
  jenis: 'GAMBAR' | 'VIDEO';
  mime: string;
  ukuranByte: number;
  durasiDetik?: number | null;
};

export type MasukanKelayakan = {
  tujuan: Tujuan;
  jenisPosting: JenisPosting;
  caption: string;
  berkas: BerkasKonten[];
};

/**
 * Periksa kelayakan kirim. Mengembalikan daftar masalah; KOSONG = aman dikirim.
 *
 * Dipakai TIGA tempat: form (memberi tahu sebelum menyimpan), halaman detail
 * (peringatan sebelum menekan Kirim), dan adapter pengiriman (menolak sebelum
 * memanggil API platform). Satu sumber kebenaran, jadi pesan yang dibaca
 * pengguna sama dengan yang dipakai mesin.
 *
 * Aturan yang TIDAK bisa ditawar:
 *  - sebuah konten hanya boleh dikirim kalau SELURUH berkasnya layak; carousel
 *    tidak boleh terkirim dengan 3 dari 5 berkas, karena di platform ia menjadi
 *    satu unggahan utuh.
 */
export function periksaKelayakan(input: MasukanKelayakan): Masalah[] {
  const masalah: Masalah[] = [];
  const batasUmum = BATAS_BERKAS;
  const jumlah = input.berkas.length;

  // ==== batas jumlah berkas per platform ====
  for (const platform of platformDariTujuan(input.tujuan)) {
    const maksPlatform = batasUmum.maksBerkas[platform];

    if (jumlah > maksPlatform) {
      masalah.push({
        platform,
        pesan: `Terlalu banyak berkas: ${jumlah}. ${LABEL_PLATFORM[platform]} menerima paling banyak ${maksPlatform} berkas dalam satu unggahan.`,
      });
    }

    const aturan = ATURAN_JENIS_POSTING[platform][input.jenisPosting];
    if (!aturan) {
      const alasan = alasanJenisTidakAda(input.jenisPosting, platform);
      if (alasan) masalah.push({ platform, pesan: alasan });
      continue;
    }

    // ==== jumlah berkas ====
    if (jumlah > 0 && jumlah < aturan.minBerkas) {
      masalah.push({
        platform,
        pesan: `${LABEL_JENIS_POSTING[input.jenisPosting]} memerlukan minimal ${aturan.minBerkas} berkas (sekarang ${jumlah}).`,
      });
    }
    if (aturan.maksBerkas !== null && jumlah > aturan.maksBerkas) {
      masalah.push({
        platform,
        pesan: `${LABEL_JENIS_POSTING[input.jenisPosting]} di ${LABEL_PLATFORM[platform]} paling banyak ${aturan.maksBerkas} berkas (sekarang ${jumlah}).`,
      });
    }

    // ==== caption ====
    if (input.caption.length > batasUmum.maksCaption[platform]) {
      masalah.push({
        platform,
        pesan: `Caption ${input.caption.length} karakter, melebihi batas ${batasUmum.maksCaption[platform]}.`,
      });
    }
    if (!aturan.captionDipakai && input.caption.trim().length > 0) {
      masalah.push({
        platform,
        pesan: `${aturan.catatan} Caption akan diabaikan.`,
      });
    }

    // ==== satu per satu berkas ====
    for (const [i, b] of input.berkas.entries()) {
      const sebut = jumlah > 1 ? `Berkas ke-${i + 1}: ` : '';
      const mimeSah = b.jenis === 'VIDEO' ? BATAS_PLATFORM[platform].mimeVideo : BATAS_PLATFORM[platform].mimeGambar;

      if (b.jenis === 'VIDEO' && aturan.wajibGambar) {
        masalah.push({ platform, pesan: `${sebut}${aturan.catatan}` });
        continue;
      }
      if (b.jenis === 'GAMBAR' && aturan.wajibVideo) {
        masalah.push({ platform, pesan: `${sebut}${aturan.catatan}` });
        continue;
      }

      if (b.ukuranByte > batasUmum.maksByte[platform]) {
        masalah.push({
          platform,
          pesan: `${sebut}ukuran berkas terlalu besar (maks ${Math.round(batasUmum.maksByte[platform] / 1024 / 1024)} MB).`,
        });
      }

      if (b.mime && mimeSah.length > 0 && !mimeSah.includes(b.mime)) {
        masalah.push({
          platform,
          pesan:
            b.jenis === 'VIDEO'
              ? `${sebut}format video ${b.mime} tidak didukung.`
              : `${sebut}Instagram feed/story hanya menerima gambar JPEG. Berkas ini ${b.mime}.`,
        });
      }

      if (
        b.jenis === 'VIDEO' &&
        batasUmum.maksDurasiDetik[platform] &&
        (b.durasiDetik ?? 0) > batasUmum.maksDurasiDetik[platform]!
      ) {
        masalah.push({
          platform,
          pesan: `${sebut}durasi video melebihi batas ${Math.round(
            batasUmum.maksDurasiDetik[platform]! / 60
          )} menit.`,
        });
      }
    }
  }

  return unikkan(masalah);
}

/** Buang masalah yang persis sama (mis. batas yang sama dilaporkan dua kali). */
function unikkan(daftar: Masalah[]): Masalah[] {
  const terlihat = new Set<string>();
  return daftar.filter((m) => {
    const kunci = `${m.platform}|${m.pesan}`;
    if (terlihat.has(kunci)) return false;
    terlihat.add(kunci);
    return true;
  });
}

/**
 * Batas yang berlaku untuk SEMUA jenis postingan, per platform.
 * Dipisah dari aturan jenis supaya tidak ada angka yang ditulis dua kali.
 */
export const BATAS_BERKAS = {
  /** caption maksimum per platform */
  maksCaption: {
    TIKTOK: 2200,
    INSTAGRAM: 2200,
  } as Record<Platform, number>,
  /** ukuran satu berkas maksimum */
  maksByte: {
    TIKTOK: 4 * 1024 * 1024 * 1024,
    INSTAGRAM: 100 * 1024 * 1024,
  } as Record<Platform, number>,
  /** durasi video maksimum (detik) */
  maksDurasiDetik: {
    TIKTOK: 600,
    INSTAGRAM: 900,
  } as Record<Platform, number | null>,
  /** jumlah berkas maksimum dalam SATU unggahan (feed/carousel/story) */
  maksBerkas: {
    TIKTOK: 1,
    INSTAGRAM: 10,
  } as Record<Platform, number>,
};

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
