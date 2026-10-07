import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Token media adalah SATU-SATUNYA jalan masuk berkas tanpa sesi. Karena itu
 * yang diuji di sini bukan "apakah token bisa dibuat", melainkan hal-hal yang
 * kalau salah akan membuka berkas organisasi ke publik:
 *
 *  - token kedaluwarsa DITOLAK;
 *  - token habis pemakaian DITOLAK (dan pemeriksaannya compare-and-swap,
 *    supaya dua permintaan bersamaan tidak sama-sama lolos);
 *  - token untuk SATU berkas tidak bisa dipakai mengambil berkas lain;
 *  - token untuk konten lain ditolak.
 *
 * Prisma di-mock karena aturannya ada di lapisan ini, bukan di database.
 */

const media = vi.fn();
const updateMany = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const deleteMany = vi.fn();
const count = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    tokenMedia: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      create: (...a: unknown[]) => create(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

const { pakaiTokenMedia, buatTokenMedia, UMUR_TOKEN_KIRIM_MENIT, MAKS_PAKAI_TOKEN, urlBerkasPublik } =
  await import('./token-media');

const TOKEN = 'token-rahasia-uji';

beforeEach(() => {
  findUnique.mockReset();
  updateMany.mockReset();
  create.mockReset();
  deleteMany.mockReset();
  count.mockReset();
  media.mockReset();
  deleteMany.mockResolvedValue({ count: 0 });
});

describe('pakaiTokenMedia — penolakan', () => {
  it('token tidak dikenal ditolak', async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await pakaiTokenMedia(TOKEN)).toEqual({ sah: false, alasan: 'tidak_ada' });
    // tidak boleh ada upaya menambah pemakaian untuk token yang tidak ada
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('token kedaluwarsa ditolak TANPA menambah pemakaian', async () => {
    findUnique.mockResolvedValueOnce({
      id: 't1',
      mediaId: 'm1',
      kontenId: 'k1',
      expiresAt: new Date(Date.now() - 1000),
      jumlahPakai: 0,
      maksPakai: 2,
    });
    expect(await pakaiTokenMedia(TOKEN)).toEqual({ sah: false, alasan: 'kedaluwarsa' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('token yang pemakaiannya sudah habis ditolak', async () => {
    findUnique.mockResolvedValueOnce({
      id: 't1',
      mediaId: 'm1',
      kontenId: 'k1',
      expiresAt: new Date(Date.now() + 60_000),
      jumlahPakai: 2,
      maksPakai: 2,
    });
    // updateMany mensyaratkan jumlahPakai < maksPakai, jadi tidak ada baris
    // yang terpengaruh
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await pakaiTokenMedia(TOKEN)).toEqual({ sah: false, alasan: 'habis' });
  });

  it('token untuk BERKAS LAIN ditolak, walau tokennya masih berlaku', async () => {
    findUnique.mockResolvedValueOnce({
      id: 't1',
      mediaId: 'm1',
      kontenId: 'k1',
      expiresAt: new Date(Date.now() + 60_000),
      jumlahPakai: 0,
      maksPakai: 2,
    });
    const hasil = await pakaiTokenMedia(TOKEN, { mediaId: 'm-LAIN' });
    expect(hasil).toEqual({ sah: false, alasan: 'tidak_ada' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('token untuk KONTEN LAIN ditolak', async () => {
    findUnique.mockResolvedValueOnce({
      id: 't1',
      mediaId: 'm1',
      kontenId: 'k1',
      expiresAt: new Date(Date.now() + 60_000),
      jumlahPakai: 0,
      maksPakai: 2,
    });
    expect(await pakaiTokenMedia(TOKEN, { kontenId: 'k-LAIN' })).toEqual({
      sah: false,
      alasan: 'tidak_ada',
    });
  });
});

describe('pakaiTokenMedia — pemakaian sah', () => {
  it('token sah dipakai dan mengembalikan mediaId-nya', async () => {
    findUnique.mockResolvedValueOnce({
      id: 't1',
      mediaId: 'm1',
      kontenId: 'k1',
      expiresAt: new Date(Date.now() + 60_000),
      jumlahPakai: 0,
      maksPakai: 2,
    });
    updateMany.mockResolvedValueOnce({ count: 1 });

    expect(await pakaiTokenMedia(TOKEN, { mediaId: 'm1', kontenId: 'k1' })).toEqual({
      sah: true,
      mediaId: 'm1',
    });
    // penambahan pemakaian HARUS ikut mensyaratkan sisa kuota di WHERE
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where.jumlahPakai).toEqual({ lt: 2 });
    expect(arg.data.jumlahPakai).toEqual({ increment: 1 });
  });

  it('token yang cocok untuk berkas yang diminta tetap sah', async () => {
    findUnique.mockResolvedValueOnce({
      id: 't1',
      mediaId: 'm1',
      kontenId: 'k1',
      expiresAt: new Date(Date.now() + 60_000),
      jumlahPakai: 1,
      maksPakai: 2,
    });
    updateMany.mockResolvedValueOnce({ count: 1 });
    expect((await pakaiTokenMedia(TOKEN, { mediaId: 'm1' })).sah).toBe(true);
  });
});

describe('buatTokenMedia', () => {
  it('membuat satu token per berkas dan TIDAK menyimpan token mentah', async () => {
    create.mockResolvedValue({});
    const hasil = await buatTokenMedia({
      kontenId: 'k1',
      media: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    });

    expect(hasil).toHaveLength(3);
    expect(new Set(hasil.map((h) => h.token)).size).toBe(3); // token berbeda semua
    expect(create).toHaveBeenCalledTimes(3);

    // yang dikirim ke database adalah HASH, bukan tokennya
    for (const [i, panggilan] of create.mock.calls.entries()) {
      const data = panggilan[0].data;
      expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
      expect(data.tokenHash).not.toBe(hasil[i].token);
      expect(JSON.stringify(data)).not.toContain(hasil[i].token);
      expect(data.maksPakai).toBe(MAKS_PAKAI_TOKEN);
    }
  });

  it('umur token pendek dan seragam untuk semua berkas', async () => {
    create.mockResolvedValue({});
    const hasil = await buatTokenMedia({ kontenId: 'k1', media: [{ id: 'm1' }, { id: 'm2' }] });
    const selisih = Math.round((hasil[0].expiresAt.getTime() - Date.now()) / 60000);
    expect(selisih).toBe(UMUR_TOKEN_KIRIM_MENIT);
    expect(hasil[0].expiresAt.getTime()).toBe(hasil[1].expiresAt.getTime());
  });

  it('membersihkan token kedaluwarsa milik konten itu lebih dulu', async () => {
    create.mockResolvedValue({});
    await buatTokenMedia({ kontenId: 'k1', media: [{ id: 'm1' }] });
    expect(deleteMany).toHaveBeenCalled();
    expect(deleteMany.mock.calls[0][0].where.kontenId).toBe('k1');
  });
});

describe('urlBerkasPublik', () => {
  it('menyusun URL lengkap dengan token dan penanda versi', () => {
    const url = urlBerkasPublik({
      basisUrl: 'https://contoh.test/',
      kontenId: 'k1',
      mediaId: 'm1',
      token: 'abc',
      versi: 3,
    });
    expect(url).toBe('https://contoh.test/media/k1/m1?v=3&t=abc');
  });

  it('token yang perlu di-escape tetap aman di URL', () => {
    const url = urlBerkasPublik({
      basisUrl: 'https://contoh.test',
      kontenId: 'k1',
      mediaId: 'm1',
      token: 'a+b/c=',
      versi: 1,
    });
    expect(url).toContain('t=a%2Bb%2Fc%3D');
  });
});
