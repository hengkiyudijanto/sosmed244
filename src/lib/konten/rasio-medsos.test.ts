import { describe, expect, it } from 'vitest';
import { bagianTerpotong, peringatanRasio, rasioTampil, RASIO_IG } from './rasio-medsos';

/**
 * Aturan rasio harus SAMA dengan yang dipakai Instagram. Kalau angka di sini
 * berubah tanpa alasan, pratinjau akan berbohong kepada pengguna — dan
 * kebohongan itu baru ketahuan setelah konten terbit.
 */
describe('rasioTampil — Feed & Carousel', () => {
  it('foto kotak 1:1 tayang utuh', () => {
    const h = rasioTampil('FEED', 1);
    expect(h.dijepit).toBe(false);
    expect(h.rasio).toBe(1);
  });

  it('foto potret 4:5 tayang utuh (batas terjangkau Instagram)', () => {
    const h = rasioTampil('FEED', 4 / 5);
    expect(h.dijepit).toBe(false);
    expect(h.rasio).toBeCloseTo(0.8);
  });

  it('foto lanskap 1.91:1 tayang utuh (batas terjangkau Instagram)', () => {
    const h = rasioTampil('FEED', 1.91);
    expect(h.dijepit).toBe(false);
  });

  it('foto potret 9:16 DIPOTONG ke 4:5', () => {
    const h = rasioTampil('FEED', 9 / 16);
    expect(h.dijepit).toBe(true);
    expect(h.rasio).toBeCloseTo(RASIO_IG.min);
  });

  it('foto lanskap 3:1 (panorama) DIPOTONG ke 1.91:1', () => {
    const h = rasioTampil('FEED', 3);
    expect(h.dijepit).toBe(true);
    expect(h.rasio).toBeCloseTo(RASIO_IG.maks);
  });

  it('rasio tidak diketahui -> kotak 1:1 (bawaan carousel Instagram)', () => {
    const h = rasioTampil('CAROUSEL', null);
    expect(h.dijepit).toBe(false);
    expect(h.rasio).toBe(1);
  });

  it('rasio nol / negatif tidak membuat pembagian meledak', () => {
    expect(rasioTampil('FEED', 0).rasio).toBe(1);
    expect(rasioTampil('FEED', -2).rasio).toBe(1);
    expect(rasioTampil('FEED', NaN).rasio).toBe(1);
  });
});

describe('rasioTampil — Story & Reels', () => {
  it('story selalu 9:16', () => {
    expect(rasioTampil('STORY', 1).rasio).toBeCloseTo(9 / 16);
    expect(rasioTampil('STORY', 3).rasio).toBeCloseTo(9 / 16);
  });

  it('reels selalu 9:16', () => {
    expect(rasioTampil('REELS', 1).rasio).toBeCloseTo(9 / 16);
  });
});

describe('bagianTerpotong', () => {
  it('di dalam rentang -> tidak ada yang hilang', () => {
    expect(bagianTerpotong('FEED', 1)).toBe(0);
    expect(bagianTerpotong('FEED', 4 / 5)).toBe(0);
    expect(bagianTerpotong('FEED', 1.91)).toBe(0);
  });

  it('potret 9:16 di Feed kehilangan tinggi, bukan lebar', () => {
    // 0.5625 dipotong ke 0.8 -> tinggi dipangkas (1 - 0.5625/0.8) = 29.7%
    const bagian = bagianTerpotong('FEED', 9 / 16);
    expect(bagian).toBeGreaterThan(0.29);
    expect(bagian).toBeLessThan(0.30);
  });

  it('lanskap 2:1 di Feed kehilangan lebar sedikit saja', () => {
    const bagian = bagianTerpotong('FEED', 2);
    expect(bagian).toBeGreaterThan(0.04);
    expect(bagian).toBeLessThan(0.05);
  });

  it('foto kotak di Story kehilangan banyak (atas-bawah)', () => {
    const bagian = bagianTerpotong('STORY', 1);
    // 1 -> 0.5625 berarti tinggi dipangkas 1 - 0.5625/1 = 43.75%
    expect(bagian).toBeGreaterThan(0.43);
    expect(bagian).toBeLessThan(0.44);
  });

  it('tidak pernah negatif', () => {
    for (const r of [0.1, 0.5, 1, 2, 5]) {
      expect(bagianTerpotong('FEED', r)).toBeGreaterThanOrEqual(0);
      expect(bagianTerpotong('STORY', r)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('peringatanRasio', () => {
  it('rasio aman tidak memunculkan peringatan', () => {
    expect(peringatanRasio('FEED', 1, 'foto.jpg')).toBeNull();
    expect(peringatanRasio('FEED', 4 / 5, 'foto.jpg')).toBeNull();
  });

  it('potongan kecil (<2%) tidak diperingatkan — tidak terlihat mata', () => {
    // 1.93 sedikit di atas batas 1.91 -> potongan ~1%
    expect(peringatanRasio('FEED', 1.93, 'foto.jpg')).toBeNull();
  });

  it('potongan besar diperingatkan dengan angka persen dan arah', () => {
    const p = peringatanRasio('FEED', 9 / 16, 'potret.jpg');
    expect(p).toContain('potret.jpg');
    expect(p).toContain('30%');
    expect(p).toContain('atas-bawah');
  });

  it('lanskap lebar: peringatan menyebut kiri-kanan', () => {
    const p = peringatanRasio('FEED', 3, 'pano.jpg');
    expect(p).toContain('kiri-kanan');
    expect(p).toContain('1.91:1');
  });

  it('story memakai pesan 9:16, bukan rentang feed', () => {
    const p = peringatanRasio('STORY', 1, 'kotak.jpg');
    expect(p).toContain('9:16');
    expect(p).not.toContain('1.91:1');
  });

  it('rasio tidak diketahui tidak memunculkan peringatan palsu', () => {
    expect(peringatanRasio('FEED', null, 'x.jpg')).toBeNull();
  });
});
