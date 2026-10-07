import { describe, it, expect } from 'vitest';
import {
  jadwalCobaUlang,
  JEDA_COBA_ULANG_MENIT,
  MAKS_PERCOBAAN,
  MAKS_PER_JALAN,
} from './jadwal-angka';

/**
 * Yang diuji di sini adalah ATURAN WAKTU dan ANGKA BATAS pada pengiriman
 * terjadwal, bukan Prisma-nya. Sisi database (penguncian konten supaya tidak
 * terkirim dua kali, pengembalian status saat gagal) diuji di
 * `scripts/uji-jadwal.ts` terhadap database sungguhan — karena perilaku yang
 * dibuktikan di sana adalah perilaku database (compare-and-swap), yang tidak
 * bisa dipercaya kalau hanya di-mock.
 */

describe('jadwalCobaUlang', () => {
  it('menggeser jadwal ke depan sesuai jeda yang ditentukan', () => {
    const sekarang = new Date('2026-10-07T10:00:00.000Z');
    const berikut = jadwalCobaUlang(sekarang);
    expect(berikut.toISOString()).toBe('2026-10-07T10:05:00.000Z');
  });

  it('selalu di MASA DEPAN, bukan mundur', () => {
    const sekarang = new Date();
    expect(jadwalCobaUlang(sekarang).getTime()).toBeGreaterThan(sekarang.getTime());
  });

  it('jeda bisa diatur untuk pengujian', () => {
    const sekarang = new Date('2026-10-07T10:00:00.000Z');
    expect(jadwalCobaUlang(sekarang, 1).toISOString()).toBe('2026-10-07T10:01:00.000Z');
  });
});

describe('angka batas', () => {
  it('jeda percobaan ulang masuk akal (bukan nol, bukan berjam-jam)', () => {
    expect(JEDA_COBA_ULANG_MENIT).toBeGreaterThanOrEqual(1);
    expect(JEDA_COBA_ULANG_MENIT).toBeLessThanOrEqual(60);
  });

  it('batas percobaan lebih dari satu tetapi tidak berlebihan', () => {
    // satu percobaan = tidak ada toleransi gangguan sesaat;
    // terlalu banyak = konten yang selalu ditolak dicoba selamanya
    expect(MAKS_PERCOBAAN).toBeGreaterThan(1);
    expect(MAKS_PERCOBAAN).toBeLessThanOrEqual(10);
  });

  it('satu pemanggilan cron tidak mengirim terlalu banyak konten', () => {
    // cron dibatasi waktu eksekusi; mengirim puluhan video akan dipotong di tengah
    expect(MAKS_PER_JALAN).toBeGreaterThanOrEqual(1);
    expect(MAKS_PER_JALAN).toBeLessThanOrEqual(20);
  });

  it('total jendela percobaan tidak sampai berhari-hari', () => {
    const totalMenit = JEDA_COBA_ULANG_MENIT * MAKS_PERCOBAAN;
    expect(totalMenit).toBeLessThanOrEqual(120);
  });
});
