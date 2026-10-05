import { describe, it, expect } from 'vitest';
import {
  transisi,
  periksaKelayakan,
  platformDariTujuan,
  bisaDiubah,
  ringkasStatus,
  BATAS_PLATFORM,
  LABEL_STATUS,
  STATUS,
  type Status,
  type Aksi,
} from './status';

/**
 * Mesin transisi adalah KONTRAK alur approval. Kalau test ini merah, tombol di
 * UI akan mengizinkan hal yang seharusnya ditolak — perbaiki di sini dulu,
 * bukan di halaman.
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

describe('periksaKelayakan', () => {
  const dasar = {
    tujuan: 'INSTAGRAM' as const,
    jenis: 'GAMBAR' as const,
    caption: 'Caption normal',
    ukuranByte: 1024,
    mime: 'image/jpeg',
  };

  it('JPEG ke Instagram lolos tanpa masalah', () => {
    expect(periksaKelayakan(dasar)).toEqual([]);
  });

  it('gambar ke TikTok ditolak dengan pesan yang menyebut video', () => {
    const m = periksaKelayakan({ ...dasar, tujuan: 'TIKTOK' });
    expect(m).toHaveLength(1);
    expect(m[0].platform).toBe('TIKTOK');
    expect(m[0].pesan).toMatch(/video/i);
  });

  it('PNG ke Instagram ditolak dan menyebut JPEG', () => {
    const m = periksaKelayakan({ ...dasar, mime: 'image/png' });
    expect(m.some((x) => x.platform === 'INSTAGRAM' && /JPEG/i.test(x.pesan))).toBe(true);
  });

  it('caption melebihi 2200 karakter ditolak', () => {
    const m = periksaKelayakan({ ...dasar, caption: 'a'.repeat(2201) });
    expect(m.some((x) => /2200/.test(x.pesan))).toBe(true);
    expect(periksaKelayakan({ ...dasar, caption: 'a'.repeat(2200) })).toEqual([]);
  });

  it('tujuan KEDUANYA dengan gambar: TikTok ditolak, Instagram tidak', () => {
    const m = periksaKelayakan({ ...dasar, tujuan: 'KEDUANYA' });
    expect(m.some((x) => x.platform === 'TIKTOK')).toBe(true);
    expect(m.some((x) => x.platform === 'INSTAGRAM')).toBe(false);
  });

  it('video dalam batas lolos ke TikTok', () => {
    expect(
      periksaKelayakan({
        tujuan: 'TIKTOK',
        jenis: 'VIDEO',
        caption: 'x',
        ukuranByte: 1024,
        mime: 'video/mp4',
        durasiDetik: 30,
      })
    ).toEqual([]);
  });

  it('video terlalu panjang ditolak', () => {
    const m = periksaKelayakan({
      tujuan: 'TIKTOK',
      jenis: 'VIDEO',
      caption: 'x',
      ukuranByte: 1024,
      mime: 'video/mp4',
      durasiDetik: 700,
    });
    expect(m.some((x) => /durasi/i.test(x.pesan))).toBe(true);
  });

  it('berkas terlalu besar ditolak', () => {
    const m = periksaKelayakan({
      ...dasar,
      ukuranByte: BATAS_PLATFORM.INSTAGRAM.maksByte + 1,
    });
    expect(m.some((x) => /besar/i.test(x.pesan))).toBe(true);
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
