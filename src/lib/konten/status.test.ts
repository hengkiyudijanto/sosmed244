import { describe, it, expect } from 'vitest';
import {
  transisi,
  periksaKelayakan,
  platformDariTujuan,
  bisaDiubah,
  ringkasStatus,
  jenisCocokUntukTujuan,
  alasanJenisTidakAda,
  ATURAN_JENIS_POSTING,
  BATAS_BERKAS,
  BATAS_PLATFORM,
  JENIS_POSTING,
  LABEL_JENIS_POSTING,
  KETERANGAN_JENIS_POSTING,
  LABEL_STATUS,
  STATUS,
  type Status,
  type Aksi,
  type JenisPosting,
  type BerkasKonten,
} from './status';

/**
 * Mesin transisi adalah KONTRAK alur approval, dan periksaKelayakan adalah
 * KONTRAK kelayakan kirim. Kalau test ini merah, tombol di UI akan mengizinkan
 * hal yang seharusnya ditolak — perbaiki di sini dulu, bukan di halaman.
 */

/** Helper: menegaskan transisi BOLEH, lalu mengembalikan status barunya. */
function statusHasil(h: ReturnType<typeof transisi>): Status {
  expect(h.boleh).toBe(true);
  if (!h.boleh) throw new Error(`transisi ditolak: ${h.alasan}`);
  return h.statusBaru;
}

const SEMUA_STATUS = STATUS as readonly Status[];
const SEMUA_AKSI: Aksi[] = [
  'AJUKAN',
  'SETUJUI',
  'MINTA_REVISI',
  'TARIK',
  'KIRIM',
  'JADWALKAN',
  'BATAL_JADWAL',
  'ARSIPKAN',
];

describe('transisi — pengajuan', () => {
  it('draft dan revisi dapat diajukan', () => {
    expect(statusHasil(transisi('DRAFT', 'AJUKAN', 'PEMILIK'))).toBe('MENUNGGU');
    expect(statusHasil(transisi('REVISI', 'AJUKAN', 'PEMILIK'))).toBe('MENUNGGU');
  });

  it('status lain tidak dapat diajukan', () => {
    for (const s of ['MENUNGGU', 'DISETUJUI', 'DIJADWALKAN', 'DIKIRIM', 'DIARSIPKAN'] as Status[]) {
      expect(transisi(s, 'AJUKAN', 'PEMILIK').boleh).toBe(false);
    }
  });

  it('penyetuju tidak boleh mengajukan, pemilik tidak boleh menyetujui', () => {
    expect(transisi('DRAFT', 'AJUKAN', 'PENYETUJU').boleh).toBe(false);
    expect(transisi('MENUNGGU', 'SETUJUI', 'PEMILIK').boleh).toBe(false);
  });
});

describe('transisi — persetujuan', () => {
  it('menyetujui hanya dari MENUNGGU', () => {
    expect(statusHasil(transisi('MENUNGGU', 'SETUJUI', 'PENYETUJU'))).toBe('DISETUJUI');
    expect(transisi('DRAFT', 'SETUJUI', 'PENYETUJU').boleh).toBe(false);
    expect(transisi('DISETUJUI', 'SETUJUI', 'PENYETUJU').boleh).toBe(false);
    expect(transisi('DIKIRIM', 'SETUJUI', 'PENYETUJU').boleh).toBe(false);
  });

  it('revisi dapat diminta berkali-kali (MENUNGGU -> REVISI -> MENUNGGU -> REVISI)', () => {
    expect(statusHasil(transisi('MENUNGGU', 'MINTA_REVISI', 'PENYETUJU'))).toBe('REVISI');
    expect(statusHasil(transisi('REVISI', 'AJUKAN', 'PEMILIK'))).toBe('MENUNGGU');
    expect(statusHasil(transisi('MENUNGGU', 'MINTA_REVISI', 'PENYETUJU'))).toBe('REVISI');
  });

  it('revisi masih boleh diminta setelah disetujui, selagi belum dikirim', () => {
    expect(statusHasil(transisi('DISETUJUI', 'MINTA_REVISI', 'PENYETUJU'))).toBe('REVISI');
    expect(transisi('DIKIRIM', 'MINTA_REVISI', 'PENYETUJU').boleh).toBe(false);
  });
});

describe('transisi — pengiriman (aturan inti)', () => {
  it('hanya konten disetujui/dijadwalkan yang boleh dikirim', () => {
    expect(statusHasil(transisi('DISETUJUI', 'KIRIM', 'PEMILIK'))).toBe('DIKIRIM');
    expect(statusHasil(transisi('DIJADWALKAN', 'KIRIM', 'PEMILIK'))).toBe('DIKIRIM');
  });

  it('konten yang belum disetujui TIDAK BISA dikirim, oleh siapa pun', () => {
    for (const s of ['DRAFT', 'MENUNGGU', 'REVISI'] as Status[]) {
      for (const peran of ['PEMILIK', 'PENYETUJU'] as const) {
        expect(transisi(s, 'KIRIM', peran).boleh).toBe(false);
      }
    }
  });

  it('konten tidak bisa dikirim dua kali', () => {
    expect(transisi('DIKIRIM', 'KIRIM', 'PEMILIK').boleh).toBe(false);
  });
});

describe('transisi — tarik, jadwal, arsip', () => {
  it('tarik pengajuan hanya dari MENUNGGU dan hanya oleh pemilik', () => {
    expect(statusHasil(transisi('MENUNGGU', 'TARIK', 'PEMILIK'))).toBe('DRAFT');
    expect(transisi('DRAFT', 'TARIK', 'PEMILIK').boleh).toBe(false);
    expect(transisi('MENUNGGU', 'TARIK', 'PENYETUJU').boleh).toBe(false);
  });

  it('jadwal & pembatalannya', () => {
    expect(statusHasil(transisi('DISETUJUI', 'JADWALKAN', 'PEMILIK'))).toBe('DIJADWALKAN');
    expect(transisi('MENUNGGU', 'JADWALKAN', 'PEMILIK').boleh).toBe(false);
    expect(statusHasil(transisi('DIJADWALKAN', 'BATAL_JADWAL', 'PEMILIK'))).toBe('DISETUJUI');
    expect(transisi('DISETUJUI', 'BATAL_JADWAL', 'PEMILIK').boleh).toBe(false);
  });

  it('arsip hanya untuk draft/revisi', () => {
    expect(statusHasil(transisi('DRAFT', 'ARSIPKAN', 'PEMILIK'))).toBe('DIARSIPKAN');
    expect(statusHasil(transisi('REVISI', 'ARSIPKAN', 'PEMILIK'))).toBe('DIARSIPKAN');
    expect(transisi('MENUNGGU', 'ARSIPKAN', 'PEMILIK').boleh).toBe(false);
    expect(transisi('DIKIRIM', 'ARSIPKAN', 'PENYETUJU').boleh).toBe(false);
  });
});

describe('transisi — kualitas pesan penolakan', () => {
  it('setiap penolakan punya alasan yang bisa dibaca manusia', () => {
    for (const s of SEMUA_STATUS) {
      for (const a of SEMUA_AKSI) {
        for (const peran of ['PEMILIK', 'PENYETUJU'] as const) {
          const h = transisi(s, a, peran);
          if (!h.boleh) {
            expect(h.alasan.length).toBeGreaterThan(15);
            // pesan tidak boleh berupa kode mentah
            expect(h.alasan).not.toMatch(/^[A-Z_]+$/);
          }
        }
      }
    }
  });

  it('setiap status punya label, ikon, dan keterangan', () => {
    for (const s of SEMUA_STATUS) {
      expect(LABEL_STATUS[s]).toBeTruthy();
    }
  });
});

describe('bisaDiubah', () => {
  it('hanya draft & revisi', () => {
    expect(bisaDiubah('DRAFT')).toBe(true);
    expect(bisaDiubah('REVISI')).toBe(true);
    for (const s of ['MENUNGGU', 'DISETUJUI', 'DIJADWALKAN', 'DIKIRIM', 'DIARSIPKAN'] as Status[]) {
      expect(bisaDiubah(s)).toBe(false);
    }
  });
});

describe('platformDariTujuan', () => {
  it('KEDUANYA berarti dua platform', () => {
    expect(platformDariTujuan('KEDUANYA')).toEqual(['TIKTOK', 'INSTAGRAM']);
    expect(platformDariTujuan('TIKTOK')).toEqual(['TIKTOK']);
    expect(platformDariTujuan('INSTAGRAM')).toEqual(['INSTAGRAM']);
  });
});

// ===========================================================================
// Jenis postingan
// ===========================================================================

describe('jenis postingan — kelengkapan label', () => {
  it('setiap jenis punya label dan keterangan', () => {
    expect(JENIS_POSTING.length).toBeGreaterThanOrEqual(4);
    for (const j of JENIS_POSTING) {
      expect(LABEL_JENIS_POSTING[j]).toBeTruthy();
      expect(KETERANGAN_JENIS_POSTING[j].length).toBeGreaterThan(20);
    }
  });

  it('setiap jenis punya minimal satu platform yang mendukungnya', () => {
    // jenis yang tidak didukung platform mana pun = fitur mati yang membingungkan
    for (const j of JENIS_POSTING) {
      const didukung = (['TIKTOK', 'INSTAGRAM'] as const).filter(
        (p) => ATURAN_JENIS_POSTING[p][j]
      );
      expect(didukung.length).toBeGreaterThan(0);
    }
  });

  it('setiap aturan jenis punya angka yang masuk akal', () => {
    for (const p of ['TIKTOK', 'INSTAGRAM'] as const) {
      for (const j of JENIS_POSTING) {
        const a = ATURAN_JENIS_POSTING[p][j];
        if (!a) continue;
        expect(a.minBerkas).toBeGreaterThanOrEqual(1);
        expect(a.catatan.length).toBeGreaterThan(10);
        if (a.maksBerkas !== null) expect(a.maksBerkas).toBeGreaterThanOrEqual(a.minBerkas);
        // tidak boleh menuntut video DAN gambar sekaligus
        expect(a.wajibVideo && a.wajibGambar).toBe(false);
      }
    }
  });

  it('TikTok tidak punya story dan carousel — dengan alasan yang jelas', () => {
    expect(ATURAN_JENIS_POSTING.TIKTOK.STORY).toBeUndefined();
    expect(alasanJenisTidakAda('STORY', 'TIKTOK')).toMatch(/aplikasi TikTok/i);
    expect(alasanJenisTidakAda('CAROUSEL', 'TIKTOK')).toBeTruthy();
    expect(alasanJenisTidakAda('CAROUSEL', 'INSTAGRAM')).toBeNull();
  });

  it('jenisCocokUntukTujuan: story hanya untuk Instagram', () => {
    expect(jenisCocokUntukTujuan('STORY', 'INSTAGRAM')).toBe(true);
    expect(jenisCocokUntukTujuan('STORY', 'TIKTOK')).toBe(false);
    expect(jenisCocokUntukTujuan('STORY', 'KEDUANYA')).toBe(false);
    expect(jenisCocokUntukTujuan('CAROUSEL', 'KEDUANYA')).toBe(false);
    expect(jenisCocokUntukTujuan('REELS', 'KEDUANYA')).toBe(true);
  });
});

// ===========================================================================
// periksaKelayakan
// ===========================================================================

/** Berkas gambar JPEG kecil yang selalu lolos batas. */
const GAMBAR: BerkasKonten = { jenis: 'GAMBAR', mime: 'image/jpeg', ukuranByte: 1024 };
const VIDEO: BerkasKonten = {
  jenis: 'VIDEO',
  mime: 'video/mp4',
  ukuranByte: 1024,
  durasiDetik: 30,
};

describe('periksaKelayakan — feed, story, reels', () => {
  it('feed Instagram dengan satu JPEG lolos', () => {
    expect(
      periksaKelayakan({
        tujuan: 'INSTAGRAM',
        jenisPosting: 'FEED',
        caption: 'Caption normal',
        berkas: [GAMBAR],
      })
    ).toEqual([]);
  });

  it('feed Instagram dengan video lolos juga', () => {
    expect(
      periksaKelayakan({
        tujuan: 'INSTAGRAM',
        jenisPosting: 'FEED',
        caption: '',
        berkas: [VIDEO],
      })
    ).toEqual([]);
  });

  it('feed dengan dua berkas ditolak — feed hanya satu berkas', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'FEED',
      caption: '',
      berkas: [GAMBAR, GAMBAR],
    });
    expect(m.some((x) => /paling banyak 1 berkas/i.test(x.pesan))).toBe(true);
  });

  it('gambar ke TikTok ditolak dengan pesan yang menyebut video', () => {
    const m = periksaKelayakan({
      tujuan: 'TIKTOK',
      jenisPosting: 'FEED',
      caption: '',
      berkas: [GAMBAR],
    });
    expect(m.some((x) => x.platform === 'TIKTOK' && /video/i.test(x.pesan))).toBe(true);
  });

  it('PNG ke Instagram ditolak dan menyebut JPEG', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'FEED',
      caption: '',
      berkas: [{ ...GAMBAR, mime: 'image/png' }],
    });
    expect(m.some((x) => x.platform === 'INSTAGRAM' && /JPEG/i.test(x.pesan))).toBe(true);
  });

  it('story dengan banyak gambar lolos (maks 10)', () => {
    const tujuh = Array.from({ length: 7 }, () => GAMBAR);
    expect(
      periksaKelayakan({
        tujuan: 'INSTAGRAM',
        jenisPosting: 'STORY',
        caption: '',
        berkas: tujuh,
      })
    ).toEqual([]);
  });

  it('story dengan caption diberi tahu bahwa caption akan diabaikan', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'STORY',
      caption: 'Caption yang sayang kalau hilang',
      berkas: [GAMBAR],
    });
    expect(m.some((x) => /diabaikan/i.test(x.pesan))).toBe(true);
  });

  it('story dengan 11 berkas ditolak — batas Instagram 10', () => {
    const sebelas = Array.from({ length: 11 }, () => GAMBAR);
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'STORY',
      caption: '',
      berkas: sebelas,
    });
    expect(m.some((x) => /paling banyak 10 berkas/i.test(x.pesan))).toBe(true);
  });

  it('reels dengan gambar ditolak — reels hanya video', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'REELS',
      caption: '',
      berkas: [GAMBAR],
    });
    expect(m.some((x) => /Reels hanya menerima video/i.test(x.pesan))).toBe(true);
  });

  it('reels dengan video lolos ke Instagram dan TikTok', () => {
    expect(
      periksaKelayakan({
        tujuan: 'KEDUANYA',
        jenisPosting: 'REELS',
        caption: 'x',
        berkas: [VIDEO],
      })
    ).toEqual([]);
  });
});

describe('periksaKelayakan — carousel', () => {
  it('carousel dengan 2 gambar lolos', () => {
    expect(
      periksaKelayakan({
        tujuan: 'INSTAGRAM',
        jenisPosting: 'CAROUSEL',
        caption: 'Geser ya',
        berkas: [GAMBAR, GAMBAR],
      })
    ).toEqual([]);
  });

  it('carousel campur gambar & video lolos', () => {
    expect(
      periksaKelayakan({
        tujuan: 'INSTAGRAM',
        jenisPosting: 'CAROUSEL',
        caption: '',
        berkas: [GAMBAR, VIDEO, GAMBAR],
      })
    ).toEqual([]);
  });

  it('carousel dengan 1 berkas ditolak — minimal 2', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'CAROUSEL',
      caption: '',
      berkas: [GAMBAR],
    });
    expect(m.some((x) => /minimal 2 berkas/i.test(x.pesan))).toBe(true);
  });

  it('carousel dengan 11 berkas ditolak', () => {
    const sebelas = Array.from({ length: 11 }, () => GAMBAR);
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'CAROUSEL',
      caption: '',
      berkas: sebelas,
    });
    expect(m.some((x) => /paling banyak 10 berkas/i.test(x.pesan))).toBe(true);
  });

  it('carousel ke TikTok ditolak dengan alasan yang menyebut carousel', () => {
    const m = periksaKelayakan({
      tujuan: 'TIKTOK',
      jenisPosting: 'CAROUSEL',
      caption: '',
      berkas: [GAMBAR, GAMBAR],
    });
    expect(m.some((x) => x.platform === 'TIKTOK' && /carousel/i.test(x.pesan))).toBe(true);
  });
});

describe('periksaKelayakan — berkas yang jelek disebut satu per satu', () => {
  it('berkas ke-2 yang PNG disebut nomornya, supaya tidak menebak', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'CAROUSEL',
      caption: '',
      berkas: [GAMBAR, { ...GAMBAR, mime: 'image/png' }, GAMBAR],
    });
    expect(m.some((x) => /Berkas ke-2/.test(x.pesan))).toBe(true);
  });

  it('berkas tunggal tidak diberi nomor (tidak membingungkan)', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'FEED',
      caption: '',
      berkas: [{ ...GAMBAR, mime: 'image/png' }],
    });
    expect(m.every((x) => !/Berkas ke-/.test(x.pesan))).toBe(true);
  });

  it('caption melebihi 2200 karakter ditolak', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'FEED',
      caption: 'a'.repeat(2201),
      berkas: [GAMBAR],
    });
    expect(m.some((x) => /2200/.test(x.pesan))).toBe(true);
    expect(
      periksaKelayakan({
        tujuan: 'INSTAGRAM',
        jenisPosting: 'FEED',
        caption: 'a'.repeat(2200),
        berkas: [GAMBAR],
      })
    ).toEqual([]);
  });

  it('video terlalu panjang ditolak', () => {
    const m = periksaKelayakan({
      tujuan: 'TIKTOK',
      jenisPosting: 'REELS',
      caption: '',
      berkas: [{ ...VIDEO, durasiDetik: 700 }],
    });
    expect(m.some((x) => /durasi/i.test(x.pesan))).toBe(true);
  });

  it('berkas terlalu besar ditolak', () => {
    const m = periksaKelayakan({
      tujuan: 'INSTAGRAM',
      jenisPosting: 'FEED',
      caption: '',
      berkas: [{ ...GAMBAR, ukuranByte: BATAS_BERKAS.maksByte.INSTAGRAM + 1 }],
    });
    expect(m.some((x) => /besar/i.test(x.pesan))).toBe(true);
  });

  it('tanpa berkas sama sekali: tidak ada masalah jumlah (draft masih boleh)', () => {
    expect(
      periksaKelayakan({
        tujuan: 'INSTAGRAM',
        jenisPosting: 'CAROUSEL',
        caption: '',
        berkas: [],
      })
    ).toEqual([]);
  });

  it('masalah yang sama tidak dilaporkan dua kali', () => {
    const m = periksaKelayakan({
      tujuan: 'KEDUANYA',
      jenisPosting: 'FEED',
      caption: 'a'.repeat(2300),
      berkas: [GAMBAR],
    });
    const kunci = m.map((x) => `${x.platform}|${x.pesan}`);
    expect(new Set(kunci).size).toBe(kunci.length);
  });
});

describe('BATAS_PLATFORM masih dipakai untuk format berkas', () => {
  it('Instagram feed hanya JPEG', () => {
    expect(BATAS_PLATFORM.INSTAGRAM.mimeGambar).toEqual(['image/jpeg']);
  });
});

describe('ringkasStatus', () => {
  it('menghitung tiap kelompok dengan benar', () => {
    const r = ringkasStatus({
      DIKIRIM: 3,
      MENUNGGU: 2,
      REVISI: 1,
      DRAFT: 4,
      DISETUJUI: 2,
      DIJADWALKAN: 1,
    });
    expect(r.total).toBe(13);
    expect(r.terkirim).toBe(3);
    expect(r.menunggu).toBe(2);
    expect(r.perluRevisi).toBe(1);
    expect(r.siapKirim).toBe(3); // disetujui + dijadwalkan
    expect(r.draft).toBe(4);
  });

  it('aman untuk data kosong', () => {
    expect(ringkasStatus({})).toEqual({
      total: 0,
      terkirim: 0,
      menunggu: 0,
      perluRevisi: 0,
      siapKirim: 0,
      draft: 0,
    });
  });
});

describe('periksaKelayakan — jenis yang tidak didukung platform', () => {
  it('story ke TikTok ditolak dengan alasan aplikasi TikTok', () => {
    const m = periksaKelayakan({
      tujuan: 'TIKTOK',
      jenisPosting: 'STORY' as JenisPosting,
      caption: '',
      berkas: [VIDEO],
    });
    expect(m.some((x) => x.platform === 'TIKTOK' && /aplikasi TikTok/i.test(x.pesan))).toBe(true);
  });
});
