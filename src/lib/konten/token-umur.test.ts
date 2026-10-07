import { describe, it, expect } from 'vitest';
import {
  perluPerbarui,
  rangkumSisa,
  AMBANG_SISA_PERSEN,
  MIN_UMUR_SEBELUM_PERBARUI_JAM,
} from './token-umur';

/**
 * Aturan "kapan token diperbarui" menentukan dua hal sekaligus:
 *  - kalau terlalu lambat, pengiriman gagal 401 di tengah jalan;
 *  - kalau terlalu agresif, token yang masih sehat bisa TERBUANG — pada TikTok
 *    setiap pembaruan menerbitkan refresh token baru dan yang lama langsung
 *    tidak berlaku.
 *
 * Karena itu yang diuji bukan hanya "apakah mendeteksi token menipis",
 * melainkan juga semua kondisi yang seharusnya TIDAK memicu pembaruan.
 */

const HARI = 24 * 60 * 60 * 1000;
const sekarang = new Date('2026-10-07T10:00:00.000Z');

/** Token long-lived Meta: 60 hari. */
const umur = (hari: number) => new Date(sekarang.getTime() + hari * HARI);

describe('perluPerbarui — tidak ada yang perlu dikerjakan', () => {
  it('token masih panjang umurnya TIDAK diperbarui', () => {
    const h = perluPerbarui({ accessExpiresAt: umur(50) }, sekarang);
    expect(h.perlu).toBe(false);
    expect(h.alasan).toMatch(/masih/i);
  });

  it('tepat di atas ambang masih TIDAK diperbarui', () => {
    // 60 hari × 20% = 12 hari; 13 hari masih di atas ambang
    const h = perluPerbarui({ accessExpiresAt: umur(13) }, sekarang);
    expect(h.perlu).toBe(false);
  });

  it('masa berlaku tidak diketahui: TIDAK diperbarui, tapi diberi tahu caranya', () => {
    const h = perluPerbarui({ accessExpiresAt: null }, sekarang);
    expect(h.perlu).toBe(false);
    // ini yang mencegah token manual (tanpa info kedaluwarsa) diperbarui
    // sembarangan lalu terbuang
    expect('tidakBisa' in h && h.tidakBisa).toBeTruthy();
  });

  it('token yang SUDAH kedaluwarsa tidak dicoba diperbarui', () => {
    const h = perluPerbarui({ accessExpiresAt: umur(-1) }, sekarang);
    expect(h.perlu).toBe(false);
    expect('tidakBisa' in h && /otorisasi/i.test(h.tidakBisa ?? '')).toBe(true);
  });

  it('baru diperbarui beberapa jam lalu: tidak diulang', () => {
    const h = perluPerbarui(
      {
        accessExpiresAt: umur(10), // sudah menipis
        diperbaruiAt: new Date(sekarang.getTime() - 3 * 60 * 60 * 1000), // 3 jam lalu
      },
      sekarang
    );
    expect(h.perlu).toBe(false);
    expect(h.alasan).toMatch(/baru diperbarui/i);
  });
});

describe('perluPerbarui — inilah saatnya memperbarui', () => {
  it('token tinggal di bawah ambang: diperbarui', () => {
    const h = perluPerbarui({ accessExpiresAt: umur(10) }, sekarang);
    expect(h.perlu).toBe(true);
    expect(h.alasan).toMatch(/sisa masa berlaku/i);
  });

  it('tepat di ambang: diperbarui', () => {
    const hariAmbang = (60 * AMBANG_SISA_PERSEN) / 100;
    const h = perluPerbarui({ accessExpiresAt: umur(hariAmbang) }, sekarang);
    expect(h.perlu).toBe(true);
  });

  it('token TikTok (24 jam) yang tinggal beberapa jam: diperbarui', () => {
    const h = perluPerbarui(
      { accessExpiresAt: new Date(sekarang.getTime() + 3 * 60 * 60 * 1000) },
      sekarang
    );
    expect(h.perlu).toBe(true);
  });

  it('sudah lewat 24 jam sejak pembaruan terakhir: boleh diperbarui lagi', () => {
    const h = perluPerbarui(
      {
        accessExpiresAt: umur(2),
        diperbaruiAt: new Date(sekarang.getTime() - (MIN_UMUR_SEBELUM_PERBARUI_JAM + 1) * 60 * 60 * 1000),
      },
      sekarang
    );
    expect(h.perlu).toBe(true);
  });
});

describe('perluPerbarui — refresh token habis', () => {
  it('access token menipis tapi refresh token sudah lewat: TIDAK dicoba', () => {
    const h = perluPerbarui(
      { accessExpiresAt: umur(2), refreshExpiresAt: new Date(sekarang.getTime() - HARI) },
      sekarang
    );
    expect(h.perlu).toBe(false);
    // percobaan hanya akan gagal dan mengotori catatan
    expect('tidakBisa' in h && /otorisasi ulang/i.test(h.tidakBisa ?? '')).toBe(true);
  });

  it('refresh token masih berlaku: tetap diperbarui', () => {
    const h = perluPerbarui(
      { accessExpiresAt: umur(2), refreshExpiresAt: umur(100) },
      sekarang
    );
    expect(h.perlu).toBe(true);
  });
});

describe('rangkumSisa', () => {
  it('menyebut hari kalau masih jauh', () => {
    const r = rangkumSisa(umur(30), sekarang);
    expect(r.teks).toBe('30 hari lagi');
    expect(r.mendesak).toBe(false);
  });

  it('menyebut jam dan menandai mendesak kalau tinggal sebentar', () => {
    const r = rangkumSisa(new Date(sekarang.getTime() + 5 * 60 * 60 * 1000), sekarang);
    expect(r.teks).toBe('5 jam lagi');
    expect(r.mendesak).toBe(true);
  });

  it('menandai token yang sudah lewat', () => {
    const r = rangkumSisa(umur(-1), sekarang);
    expect(r.lewat).toBe(true);
    expect(r.mendesak).toBe(true);
  });

  it('aman kalau masa berlaku tidak diketahui', () => {
    expect(rangkumSisa(null, sekarang).teks).toBe('tidak diketahui');
    expect(rangkumSisa(undefined, sekarang).mendesak).toBe(false);
  });
});

describe('angka aturan', () => {
  it('ambang wajar: tidak 0% (terlambat) dan tidak 100% (selalu memperbarui)', () => {
    expect(AMBANG_SISA_PERSEN).toBeGreaterThanOrEqual(5);
    expect(AMBANG_SISA_PERSEN).toBeLessThanOrEqual(50);
  });

  it('jeda minimum melindungi token dari pembaruan beruntun', () => {
    expect(MIN_UMUR_SEBELUM_PERBARUI_JAM).toBeGreaterThanOrEqual(12);
  });
});
