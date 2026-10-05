import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buatMock,
  buatInstagram,
  buatTikTok,
  pilihPenerbit,
  kirimKePlatform,
  type PermintaanKirim,
} from './penerbit';

/**
 * Adapter pengiriman adalah lapisan yang menyentuh API pihak ketiga. Yang diuji
 * di sini bukan koneksi internetnya, melainkan LOGIKA pemilihan adapter dan
 * bentuk permintaan yang dikirim — dua hal yang paling mudah salah tanpa
 * terlihat.
 */

const permintaan: PermintaanKirim = {
  kontenId: 'ckonten123',
  tujuan: 'INSTAGRAM',
  caption: 'Uji caption',
  mediaUrl: 'https://contoh.test/media/ckonten123',
  jenis: 'GAMBAR',
};

describe('penerbit mock', () => {
  it('menghasilkan hasil sukses dengan tautan simulasi yang jelas', async () => {
    const p = buatMock('INSTAGRAM');
    const h = await p.terbitkan(permintaan);
    expect(h.platform).toBe('INSTAGRAM');
    expect(h.pesan).toMatch(/SIMULASI/i);
    expect(p.modus).toBe('mock');
  });

  it('punya jalur gagal, DAN percobaan ulang pada konten yang sama bisa berhasil', async () => {
    const p = buatMock('TIKTOK');

    // Kegagalan harus MUNGKIN terjadi (jalur pemulihan perlu ada bahannya) …
    const banyak = [];
    for (let i = 0; i < 25; i++) {
      banyak.push(await p.terbitkan({ ...permintaan, kontenId: `konten-${i}` }));
    }
    const gagal = banyak.filter((h) => !h.berhasil);
    expect(gagal.length).toBeGreaterThan(0);
    expect(gagal.length).toBeLessThan(banyak.length);
    expect(gagal[0].pesan).toMatch(/SIMULASI/i);

    // … tetapi TIDAK boleh deterministik per konten: kalau konten yang gagal
    // selalu gagal, tombol "coba kirim lagi" tidak akan pernah berhasil dan
    // jalur pemulihan justru tidak teruji. (bug ini pernah terjadi: kegagalan
    // dihitung dari hash id sehingga hasilnya tetap untuk selamanya.)
    const percobaan: Awaited<ReturnType<typeof p.terbitkan>>[] = [];
    for (let i = 0; i < 25; i++) {
      percobaan.push(await p.terbitkan({ ...permintaan, kontenId: 'konten-tetap' }));
    }
    expect(percobaan.some((h) => h.berhasil)).toBe(true);
    expect(percobaan.some((h) => !h.berhasil)).toBe(true);
  }, 30000);
});

describe('pilihPenerbit', () => {
  it('modus mock selalu memakai mock, tanpa catatan', () => {
    const { penerbit, catatan } = pilihPenerbit('TIKTOK', { modus: 'mock' });
    expect(penerbit.modus).toBe('mock');
    expect(catatan).toBeUndefined();
  });

  it('modus nyata tanpa kredensial JATUH ke mock, dengan catatan sebabnya', () => {
    const { penerbit, catatan } = pilihPenerbit('INSTAGRAM', { modus: 'nyata' });
    expect(penerbit.modus).toBe('mock');
    expect(catatan).toMatch(/Instagram/i);
  });

  it('modus nyata dengan kredensial lengkap memakai adapter nyata', () => {
    const ig = pilihPenerbit('INSTAGRAM', {
      modus: 'nyata',
      instagram: { igUserId: '17841400000', accessToken: 'EAAGtoken' },
    });
    expect(ig.penerbit.modus).toBe('nyata');
    expect(ig.penerbit.nama).toBe('instagram-graph');

    const tt = pilihPenerbit('TIKTOK', { modus: 'nyata', tiktok: { accessToken: 'act.token' } });
    expect(tt.penerbit.modus).toBe('nyata');
    expect(tt.penerbit.nama).toBe('tiktok-content-posting');
  });

  it('kredensial sebagian tetap dianggap belum lengkap', () => {
    const { penerbit, catatan } = pilihPenerbit('INSTAGRAM', {
      modus: 'nyata',
      instagram: { accessToken: 'EAAGtoken' }, // igUserId belum diisi
    });
    expect(penerbit.modus).toBe('mock');
    expect(catatan).toBeTruthy();
  });
});

describe('adapter Instagram (Meta Graph API)', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('gambar: buat media lalu publish, dengan image_url + caption', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'creation-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'media-99' }) });

    const p = buatInstagram({ igUserId: 'ig1', accessToken: 'tok' });
    const h = await p.terbitkan(permintaan);

    expect(h.berhasil).toBe(true);
    expect(h.idPlatform).toBe('media-99');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url1, opsi1] = fetchMock.mock.calls[0];
    expect(url1).toContain('/ig1/media');
    const badan1 = opsi1.body as URLSearchParams;
    expect(badan1.get('image_url')).toBe(permintaan.mediaUrl);
    expect(badan1.get('caption')).toBe(permintaan.caption);
    expect(badan1.get('access_token')).toBe('tok');

    const [url2] = fetchMock.mock.calls[1];
    expect(url2).toContain('/ig1/media_publish');
  });

  it('video: memakai media_type=REELS dan video_url', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'c1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'm1' }) });

    const p = buatInstagram({ igUserId: 'ig1', accessToken: 'tok' });
    await p.terbitkan({ ...permintaan, jenis: 'VIDEO' });

    const badan = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(badan.get('media_type')).toBe('REELS');
    expect(badan.get('video_url')).toBe(permintaan.mediaUrl);
  });

  it('gagal di langkah media: pesannya menyebut platform, dan TIDAK membocorkan token', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid image format' } }),
    });

    const RAHASIA = 'EAAGrahasia123';
    const p = buatInstagram({ igUserId: 'ig1', accessToken: RAHASIA });
    const h = await p.terbitkan(permintaan);

    expect(h.berhasil).toBe(false);
    expect(h.pesan).toMatch(/Instagram/i);
    expect(h.pesan).toContain('Invalid image format');
    expect(h.pesan).not.toContain(RAHASIA);
  });
});

describe('adapter TikTok (Content Posting API)', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('menolak gambar sebelum memanggil API — TikTok hanya menerima video', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const p = buatTikTok({ accessToken: 'act.tok' });
    const h = await p.terbitkan({ ...permintaan, tujuan: 'TIKTOK', jenis: 'GAMBAR' });

    expect(h.berhasil).toBe(false);
    expect(h.pesan).toMatch(/video/i);
    // tidak ada permintaan jaringan yang terbuang
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mode DRAFT (default) memakai endpoint inbox dengan PULL_FROM_URL', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { publish_id: 'pub-1' } }),
    });

    const p = buatTikTok({ accessToken: 'act.tok' });
    const h = await p.terbitkan({ ...permintaan, tujuan: 'TIKTOK', jenis: 'VIDEO' });

    expect(h.berhasil).toBe(true);
    expect(h.pesan).toMatch(/draft/i);
    const [url, opsi] = fetchMock.mock.calls[0];
    expect(url).toContain('/post/publish/inbox/video/init/');
    expect(JSON.parse(opsi.body).source_info.source).toBe('PULL_FROM_URL');
  });

  it('mode PUBLIK mengunggah berkasnya sendiri (FILE_UPLOAD) dalam satu chunk', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const byte = new Uint8Array([1, 2, 3, 4, 5]);
    fetchMock
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => byte.buffer, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { publish_id: 'pub-2', upload_url: 'https://upload.test/x' } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 201 });

    const p = buatTikTok({ accessToken: 'act.tok', mode: 'PUBLIK' });
    const h = await p.terbitkan({ ...permintaan, tujuan: 'TIKTOK', jenis: 'VIDEO' });

    expect(h.berhasil).toBe(true);
    expect(h.perluPolling).toBe(true);

    const initCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/video/init/'));
    const badan = JSON.parse(initCall![1].body);
    expect(badan.source_info.source).toBe('FILE_UPLOAD');
    expect(badan.source_info.video_size).toBe(5);
    expect(badan.source_info.total_chunk_count).toBe(1);

    const unggah = fetchMock.mock.calls.find(([u]) => String(u) === 'https://upload.test/x');
    expect(unggah![1].headers['Content-Range']).toBe('bytes 0-4/5');
  });
});

describe('kirimKePlatform', () => {
  it('tujuan KEDUANYA mengirim ke dua platform', async () => {
    const hasil = await kirimKePlatform(
      { ...permintaan, tujuan: 'KEDUANYA', jenis: 'VIDEO' },
      { modus: 'mock' }
    );
    expect(hasil.hasil.map((h) => h.platform).sort()).toEqual(['INSTAGRAM', 'TIKTOK']);
    expect(hasil.modus).toBe('mock');
  });

  it('modus nyata tanpa kredensial tetap jujur menyebut simulasi di pesan hasil', async () => {
    const hasil = await kirimKePlatform(permintaan, { modus: 'nyata' });
    expect(hasil.hasil.every((h) => h.pesan.includes('simulasi'))).toBe(true);
    expect(hasil.modus).toBe('mock');
  });
});
