import { describe, it, expect } from 'vitest';
import {
  boleh,
  bolehLihat,
  bolehAksi,
  peranTransisi,
  whereCakupan,
  wajibKemampuan,
  LABEL_PERAN,
  PERAN,
} from './akses';
import type { Status } from './status';

/**
 * Cakupan data adalah sumber bug yang paling sering terulang di proyek
 * sebelumnya (memakai nama peran untuk menentukan cakupan membuat satu peran
 * kehilangan datanya tanpa pesan error). Test ini mengunci aturannya.
 */

const KREATOR = { id: 'u-kreator', peran: 'KREATOR' };
const PENYETUJU = { id: 'u-penyetuju', peran: 'PENYETUJU' };
const ADMIN = { id: 'u-admin', peran: 'ADMIN' };
const ORANG_LAIN = { id: 'u-lain', peran: 'KREATOR' };

const konten = (pembuatId: string, penyetujuId: string | null, status: Status) => ({
  pembuatId,
  penyetujuId,
  status,
});

describe('kemampuan per peran', () => {
  it('kreator hanya boleh mengelola konten', () => {
    expect(boleh('KREATOR', 'kelola_konten')).toBe(true);
    expect(boleh('KREATOR', 'setujui_konten')).toBe(false);
    expect(boleh('KREATOR', 'lihat_semua_konten')).toBe(false);
    expect(boleh('KREATOR', 'kelola_pengguna')).toBe(false);
  });

  it('penyetuju boleh menyetujui & melihat semua, tapi tidak kelola pengguna', () => {
    expect(boleh('PENYETUJU', 'setujui_konten')).toBe(true);
    expect(boleh('PENYETUJU', 'lihat_semua_konten')).toBe(true);
    expect(boleh('PENYETUJU', 'kelola_pengguna')).toBe(false);
    expect(boleh('PENYETUJU', 'kelola_pengaturan')).toBe(false);
  });

  it('admin punya semua kemampuan', () => {
    expect(boleh('ADMIN', 'kelola_pengguna')).toBe(true);
    expect(boleh('ADMIN', 'kelola_master')).toBe(true);
    expect(boleh('ADMIN', 'kelola_pengaturan')).toBe(true);
    expect(boleh('ADMIN', 'setujui_konten')).toBe(true);
  });

  it('peran tak dikenal tidak mendapat apa pun', () => {
    expect(boleh('SUPERUSER', 'kelola_konten')).toBe(false);
    expect(boleh('', 'kelola_konten')).toBe(false);
  });

  it('setiap peran punya label yang bisa dibaca', () => {
    for (const p of PERAN) expect(LABEL_PERAN[p]).toBeTruthy();
  });
});

describe('wajibKemampuan', () => {
  it('menolak sesi kosong', () => {
    expect(wajibKemampuan(null, 'kelola_konten')).toMatch(/sesi/i);
  });

  it('menolak peran tanpa hak, dan menyebut alasannya', () => {
    const tolak = wajibKemampuan({ peran: 'KREATOR' }, 'kelola_pengguna');
    expect(tolak).toBeTruthy();
    expect(tolak).toMatch(/tidak berhak/i);
  });

  it('mengizinkan peran yang berhak', () => {
    expect(wajibKemampuan({ peran: 'ADMIN' }, 'kelola_pengguna')).toBeNull();
  });
});

describe('bolehLihat (cakupan baca)', () => {
  it('pembuat selalu melihat kontennya, apa pun statusnya', () => {
    for (const s of ['DRAFT', 'MENUNGGU', 'REVISI', 'DISETUJUI', 'DIKIRIM'] as Status[]) {
      expect(bolehLihat(konten(KREATOR.id, null, s), KREATOR)).toBe(true);
    }
  });

  it('penyetuju yang sah melihat konten yang ditugaskan kepadanya', () => {
    expect(bolehLihat(konten(KREATOR.id, PENYETUJU.id, 'MENUNGGU'), PENYETUJU)).toBe(true);
  });

  it('kreator lain tidak melihat konten orang lain', () => {
    expect(bolehLihat(konten(KREATOR.id, null, 'DRAFT'), ORANG_LAIN)).toBe(false);
  });

  it('admin melihat semuanya', () => {
    expect(bolehLihat(konten(KREATOR.id, null, 'DRAFT'), ADMIN)).toBe(true);
  });
});

describe('whereCakupan', () => {
  it('cakupan sempit: milik sendiri ATAU yang ditugaskan ke saya', () => {
    expect(whereCakupan(ORANG_LAIN)).toEqual({
      OR: [{ pembuatId: ORANG_LAIN.id }, { penyetujuId: ORANG_LAIN.id }],
    });
  });

  it('cakupan luas tidak menyaring apa pun', () => {
    expect(whereCakupan(ADMIN)).toEqual({});
    expect(whereCakupan(PENYETUJU)).toEqual({});
  });
});

describe('bolehAksi — ubah', () => {
  it('pemilik boleh mengubah draft & revisi', () => {
    expect(bolehAksi(konten(KREATOR.id, null, 'DRAFT'), KREATOR, 'ubah').boleh).toBe(true);
    expect(bolehAksi(konten(KREATOR.id, null, 'REVISI'), KREATOR, 'ubah').boleh).toBe(true);
  });

  it('konten yang MENUNGGU tidak boleh diubah pemiliknya (harus ditarik dulu)', () => {
    const h = bolehAksi(konten(KREATOR.id, PENYETUJU.id, 'MENUNGGU'), KREATOR, 'ubah');
    expect(h.boleh).toBe(false);
    expect(h.boleh === false && h.alasan).toMatch(/tarik|menunggu/i);
  });

  it('konten yang sudah disetujui/dikirim tidak boleh diubah', () => {
    for (const s of ['DISETUJUI', 'DIJADWALKAN', 'DIKIRIM'] as Status[]) {
      expect(bolehAksi(konten(KREATOR.id, PENYETUJU.id, s), KREATOR, 'ubah').boleh).toBe(false);
    }
  });

  it('penyetuju tidak boleh mengubah ISI konten orang lain', () => {
    expect(
      bolehAksi(konten(KREATOR.id, PENYETUJU.id, 'MENUNGGU'), PENYETUJU, 'ubah').boleh
    ).toBe(false);
  });

  it('admin boleh mengubah apa pun (jalan pemulihan darurat)', () => {
    expect(bolehAksi(konten(KREATOR.id, null, 'DIKIRIM'), ADMIN, 'ubah').boleh).toBe(true);
  });
});

describe('bolehAksi — hapus', () => {
  it('pemilik boleh menghapus draft/revisi', () => {
    expect(bolehAksi(konten(KREATOR.id, null, 'DRAFT'), KREATOR, 'hapus').boleh).toBe(true);
  });

  it('jejak konten yang sudah dikirim tidak bisa dihapus pemiliknya', () => {
    expect(bolehAksi(konten(KREATOR.id, PENYETUJU.id, 'DIKIRIM'), KREATOR, 'hapus').boleh).toBe(
      false
    );
  });

  it('orang lain tidak boleh menghapus konten siapa pun', () => {
    expect(bolehAksi(konten(KREATOR.id, null, 'DRAFT'), ORANG_LAIN, 'hapus').boleh).toBe(false);
  });
});

describe('peranTransisi (aturan "tidak menyetujui konten sendiri")', () => {
  it('pembuat SELALU dihitung PEMILIK, walau ia penyetuju atau admin', () => {
    expect(peranTransisi(konten(PENYETUJU.id, null, 'MENUNGGU'), PENYETUJU)).toBe('PEMILIK');
    expect(peranTransisi(konten(ADMIN.id, null, 'MENUNGGU'), ADMIN)).toBe('PEMILIK');
  });

  it('penyetuju sah dihitung PENYETUJU', () => {
    expect(peranTransisi(konten(KREATOR.id, PENYETUJU.id, 'MENUNGGU'), PENYETUJU)).toBe('PENYETUJU');
  });

  it('penyetuju yang sudah dikunci ke orang lain dihitung PEMILIK (tidak berwenang)', () => {
    const lain = { id: 'u-penyetuju-lain', peran: 'PENYETUJU' };
    expect(peranTransisi(konten(KREATOR.id, PENYETUJU.id, 'MENUNGGU'), lain)).toBe('PEMILIK');
  });

  it('kreator biasa tidak pernah jadi penyetuju', () => {
    expect(peranTransisi(konten(PENYETUJU.id, null, 'MENUNGGU'), KREATOR)).toBe('PEMILIK');
  });
});
