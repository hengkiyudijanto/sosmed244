import { describe, expect, it } from 'vitest';
import { diubahSetelahDiajukan, perubahanOlehOrangLain, type BarisRiwayat } from './sengketa';

/**
 * Perubahan isi oleh orang lain TIDAK dilarang — dengan satu Admin, melarangnya
 * membuat pekerjaan berhenti. Yang diuji di sini adalah bahwa jalur itu
 * TERBACA, bukan bahwa ia tertutup.
 */

const PEMBUAT = 'kreator-1';
const ADMIN = 'admin-1';

function baris(
  aksi: string,
  olehId: string,
  nama: string,
  menit: number,
  catatan?: string
): BarisRiwayat {
  return {
    aksi,
    olehId,
    oleh: { nama },
    createdAt: new Date(2026, 9, 9, 10, menit),
    catatan,
  };
}

describe('perubahanOlehOrangLain', () => {
  it('mengembalikan kosong kalau tidak ada perubahan', () => {
    const riwayat = [
      baris('DIBUAT', PEMBUAT, 'Kreator', 0),
      baris('AJUKAN', PEMBUAT, 'Kreator', 5),
    ];
    expect(perubahanOlehOrangLain(riwayat, PEMBUAT)).toEqual([]);
  });

  it('mengabaikan perubahan oleh pembuat sendiri', () => {
    const riwayat = [
      baris('DIUBAH', PEMBUAT, 'Kreator', 3, 'Mengubah caption.'),
      baris('AJUKAN', PEMBUAT, 'Kreator', 5),
    ];
    expect(perubahanOlehOrangLain(riwayat, PEMBUAT)).toEqual([]);
  });

  it('menemukan perubahan oleh orang lain beserta apa yang diubah', () => {
    const riwayat = [
      baris('DIUBAH', ADMIN, 'Administrator', 7, 'Mengubah caption, 1 berkas dihapus. Konten ini dibuat orang lain.'),
    ];
    const hasil = perubahanOlehOrangLain(riwayat, PEMBUAT);
    expect(hasil).toHaveLength(1);
    expect(hasil[0].oleh).toBe('Administrator');
    expect(hasil[0].apa).toBe('caption, 1 berkas dihapus');
  });

  it('membuang keterangan "dibuat orang lain" dari tampilan', () => {
    const riwayat = [
      baris('DIUBAH', ADMIN, 'Admin', 7, 'Mengubah judul. Konten ini dibuat orang lain.'),
    ];
    expect(perubahanOlehOrangLain(riwayat, PEMBUAT)[0].apa).toBe('judul');
  });

  it('aksi lain (SETUJUI, KIRIM) tidak dihitung sebagai perubahan isi', () => {
    const riwayat = [
      baris('SETUJUI', ADMIN, 'Admin', 8, 'Disetujui.'),
      baris('KIRIM', ADMIN, 'Admin', 9),
    ];
    expect(perubahanOlehOrangLain(riwayat, PEMBUAT)).toEqual([]);
  });

  it('catatan kosong -> dianggap mengubah "isi konten"', () => {
    const riwayat = [baris('DIUBAH', ADMIN, 'Admin', 7, '')];
    expect(perubahanOlehOrangLain(riwayat, PEMBUAT)[0].apa).toBe('isi konten');
  });

  it('pengguna yang sudah dihapus tidak membuat fungsi meledak', () => {
    const riwayat: BarisRiwayat[] = [
      {
        aksi: 'DIUBAH',
        olehId: ADMIN,
        oleh: undefined as unknown as { nama: string },
        createdAt: new Date(),
        catatan: 'Mengubah caption.',
      },
    ];
    expect(() => perubahanOlehOrangLain(riwayat, PEMBUAT)).not.toThrow();
    expect(perubahanOlehOrangLain(riwayat, PEMBUAT)[0].oleh).toContain('dihapus');
  });
});

describe('diubahSetelahDiajukan', () => {
  it('false kalau perubahan terjadi SEBELUM pengajuan', () => {
    const riwayat = [
      baris('DIUBAH', ADMIN, 'Admin', 2, 'Mengubah caption.'),
      baris('AJUKAN', PEMBUAT, 'Kreator', 5),
    ];
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT)).toBe(false);
  });

  it('true kalau perubahan terjadi SETELAH pengajuan', () => {
    const riwayat = [
      baris('AJUKAN', PEMBUAT, 'Kreator', 5),
      baris('DIUBAH', ADMIN, 'Admin', 9, 'Mengubah caption.'),
    ];
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT)).toBe(true);
  });

  it('false kalau yang mengubah setelah pengajuan adalah pembuat sendiri', () => {
    const riwayat = [
      baris('AJUKAN', PEMBUAT, 'Kreator', 5),
      baris('DIUBAH', PEMBUAT, 'Kreator', 9, 'Mengubah caption.'),
    ];
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT)).toBe(false);
  });

  it('false kalau belum pernah diajukan', () => {
    const riwayat = [baris('DIUBAH', ADMIN, 'Admin', 3, 'Mengubah caption.')];
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT)).toBe(false);
  });

  it('memakai pengajuan TERAKHIR (kasus bolak-balik revisi)', () => {
    const riwayat = [
      baris('DIUBAH', ADMIN, 'Admin', 4, 'Mengubah caption.'),
      baris('AJUKAN', PEMBUAT, 'Kreator', 5),
      baris('MINTA_REVISI', ADMIN, 'Admin', 6),
      baris('DIUBAH', PEMBUAT, 'Kreator', 7, 'Mengubah caption.'),
      baris('AJUKAN', PEMBUAT, 'Kreator', 8),
    ];
    // perubahan Admin (menit 4) terjadi SEBELUM pengajuan terakhir (menit 8)
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT)).toBe(false);
  });

  it('menerima createdAt berupa string (hasil JSON), bukan hanya Date', () => {
    const riwayat: BarisRiwayat[] = [
      { aksi: 'AJUKAN', olehId: PEMBUAT, oleh: { nama: 'K' }, createdAt: '2026-10-09T10:05:00Z' },
      { aksi: 'DIUBAH', olehId: ADMIN, oleh: { nama: 'A' }, createdAt: '2026-10-09T10:09:00Z' },
    ];
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT)).toBe(true);
  });

  it('memakai kolom diajukanAt kalau riwayat tidak punya baris AJUKAN', () => {
    // kasus nyata: konten buatan skrip seed dibuat langsung MENUNGGU, jadi
    // tidak ada baris AJUKAN. Tanpa kolom ini, kasus itu dilaporkan "aman"
    // padahal jelas diubah setelah diajukan.
    const riwayat = [baris('DIUBAH', ADMIN, 'Admin', 9, 'Mengubah caption.')];
    const diajukanAt = new Date(2026, 9, 9, 10, 5);
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT, diajukanAt)).toBe(true);
  });

  it('kolom diajukanAt sebelum perubahan -> true; sesudah -> false', () => {
    const riwayat = [baris('DIUBAH', ADMIN, 'Admin', 9, 'Mengubah caption.')];
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT, new Date(2026, 9, 9, 10, 5))).toBe(true);
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT, new Date(2026, 9, 9, 10, 30))).toBe(false);
  });

  it('diajukanAt null tidak membuat fungsi meledak', () => {
    const riwayat = [baris('DIUBAH', ADMIN, 'Admin', 9, 'Mengubah caption.')];
    expect(() => diubahSetelahDiajukan(riwayat, PEMBUAT, null)).not.toThrow();
    expect(diubahSetelahDiajukan(riwayat, PEMBUAT, null)).toBe(false);
  });
});
