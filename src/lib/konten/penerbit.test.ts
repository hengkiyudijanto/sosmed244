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

const GAMBAR = { url: 'https://contoh.test/media/a.jpg', jenis: 'GAMBAR' as const, mime: 'image/jpeg' };
const VIDEO = { url: 'https://contoh.test/media/a.mp4', jenis: 'VIDEO' as const, mime: 'video/mp4' };

const permintaan: PermintaanKirim = {
  kontenId: 'ckonten123',
  tujuan: 'INSTAGRAM',
  jenisPosting: 'FEED',
  caption: 'Uji caption',
  berkas: [GAMBAR],
};

describe('penerbit mock', () => {
  it('menghasilkan hasil sukses dengan tautan simulasi yang jelas', async () => {
    const p = buatMock('INSTAGRAM');
    const h = await p.terbitkan(permintaan);
    expect(h.platform).toBe('INSTAGRAM');
    expect(h.pesan).toMatch(/SIMULASI/i);
    expect(p.modus).toBe('mock');
  });

  it('menyebut jenis postingan di pesannya', async () => {
    const p = buatMock('INSTAGRAM');
    const h = await p.terbitkan({ ...permintaan, jenisPosting: 'CAROUSEL', berkas: [GAMBAR, GAMBAR] });
    // mock punya jalur gagal acak; ulangi sampai berhasil supaya yang diuji
    // adalah ISI pesannya, bukan keberuntungan undian
    let berhasil = h;
    for (let i = 0; i < 20 && !berhasil.berhasil; i++) {
      berhasil = await p.terbitkan({
        ...permintaan,
        jenisPosting: 'CAROUSEL',
        berkas: [GAMBAR, GAMBAR],
      });
    }
    expect(berhasil.berhasil).toBe(true);
    expect(berhasil.pesan).toMatch(/Carousel/);
    expect(berhasil.pesan).toMatch(/2 berkas/);
  });

  it('story banyak berkas: dihitung sebagai beberapa unggahan', async () => {
    const p = buatMock('INSTAGRAM');
    let h = await p.terbitkan({
      ...permintaan,
      jenisPosting: 'STORY',
      berkas: [GAMBAR, GAMBAR, GAMBAR],
    });
    for (let i = 0; i < 20 && !h.berhasil; i++) {
      h = await p.terbitkan({
        ...permintaan,
        jenisPosting: 'STORY',
        berkas: [GAMBAR, GAMBAR, GAMBAR],
      });
    }
    expect(h.berhasil).toBe(true);
    expect(h.jumlahUnggahan).toBe(3);
    expect(h.urlPerUnggahan).toHaveLength(3);
  });

  it('TIDAK berpura-pura berhasil untuk jenis yang tidak didukung platform', async () => {
    // Tanpa aturan ini, simulasi "berhasil" untuk story TikTok — dan itu
    // menyesatkan saat uji coba, karena di produksi mustahil.
    const tiktok = buatMock(PLATFORM_TIKTOK);
    const story = await tiktok.terbitkan({
      ...permintaan,
      tujuan: 'TIKTOK',
      jenisPosting: 'STORY',
      berkas: [VIDEO],
    });
    expect(story.berhasil).toBe(false);
    expect(story.pesan).toMatch(/SIMULASI/i);
    expect(story.pesan).toMatch(/aplikasi TikTok/i);
  });

  it('menolak carousel dengan terlalu sedikit berkas', async () => {
    const p = buatMock('INSTAGRAM');
    const h = await p.terbitkan({ ...permintaan, jenisPosting: 'CAROUSEL', berkas: [GAMBAR] });
    expect(h.berhasil).toBe(false);
    expect(h.pesan).toMatch(/minimal 2 berkas/i);
  });

  it('punya jalur gagal, DAN percobaan ulang pada konten yang sama bisa berhasil', async () => {
    const p = buatMock(PLATFORM_TIKTOK);

    // Kegagalan harus MUNGKIN terjadi (jalur pemulihan perlu ada bahannya) …
    const banyak = [];
    for (let i = 0; i < 25; i++) {
      banyak.push(
        await p.terbitkan({
          ...permintaan,
          tujuan: 'TIKTOK',
          jenisPosting: 'REELS',
          berkas: [VIDEO],
          kontenId: `konten-${i}`,
        })
      );
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
      percobaan.push(
        await p.terbitkan({
          ...permintaan,
          tujuan: 'TIKTOK',
          jenisPosting: 'REELS',
          berkas: [VIDEO],
          kontenId: 'konten-tetap',
        })
      );
    }
    expect(percobaan.some((h) => h.berhasil)).toBe(true);
    expect(percobaan.some((h) => !h.berhasil)).toBe(true);
  }, 30000);
});

describe('pilihPenerbit', () => {
  it('modus mock selalu memakai mock, tanpa catatan', () => {
    const { penerbit, catatan } = pilihPenerbit(PLATFORM_TIKTOK, { modus: 'mock' });
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

    const tt = pilihPenerbit(PLATFORM_TIKTOK, { modus: 'nyata', tiktok: { accessToken: 'act.token' } });
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

  it('gambar feed: buat media lalu publish, dengan image_url + caption', async () => {
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
    expect(badan1.get('image_url')).toBe(GAMBAR.url);
    expect(badan1.get('caption')).toBe(permintaan.caption);
    expect(badan1.get('access_token')).toBe('tok');

    const [url2] = fetchMock.mock.calls[1];
    expect(url2).toContain('/ig1/media_publish');
  });

  it('video feed: memakai media_type=REELS dan video_url', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'c1' }) })
      // menunggu wadah video selesai diproses
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status_code: 'FINISHED' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'm1' }) });

    const p = buatInstagram({ igUserId: 'ig1', accessToken: 'tok' });
    await p.terbitkan({ ...permintaan, berkas: [VIDEO] });

    const badan = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(badan.get('media_type')).toBe('REELS');
    expect(badan.get('video_url')).toBe(VIDEO.url);
  });

  it('STORY: media_type=STORIES, dan caption TIDAK dikirim', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'c-story' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'm-story' }) });

    const p = buatInstagram({ igUserId: 'ig1', accessToken: 'tok' });
    const h = await p.terbitkan({ ...permintaan, jenisPosting: 'STORY' });

    expect(h.berhasil).toBe(true);
    const badan = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(badan.get('media_type')).toBe('STORIES');
    expect(badan.get('image_url')).toBe(GAMBAR.url);
    // caption diabaikan Instagram; mengirimnya hanya menambah permintaan gagal
    expect(badan.get('caption')).toBeNull();
  });

  it('STORY banyak berkas diterbitkan satu per satu, berurutan', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    // 3 berkas × (buat wadah + publish)
    for (let i = 1; i <= 3; i++) {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: `c${i}` }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: `m${i}` }) });
    }

    const p = buatInstagram({ igUserId: 'ig1', accessToken: 'tok' });
    const h = await p.terbitkan({
      ...permintaan,
      jenisPosting: 'STORY',
      berkas: [GAMBAR, { ...GAMBAR, url: 'https://contoh.test/media/b.jpg' }, GAMBAR],
    });

    expect(h.berhasil).toBe(true);
    expect(h.jumlahUnggahan).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    // urutan permintaan harus mengikuti urutan berkas
    const urlBerkas = fetchMock.mock.calls
      .filter(([, o]) => (o.body as URLSearchParams).get('image_url'))
      .map(([, o]) => (o.body as URLSearchParams).get('image_url'));
    expect(urlBerkas).toEqual([GAMBAR.url, 'https://contoh.test/media/b.jpg', GAMBAR.url]);
  });

  it('STORY: kalau berkas ke-2 gagal, hasilnya jujur menyebut berapa yang sudah terbit', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'c1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'm1' }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Media too large' } }),
      });

    const p = buatInstagram({ igUserId: 'ig1', accessToken: 'tok' });
    const h = await p.terbitkan({
      ...permintaan,
      jenisPosting: 'STORY',
      berkas: [GAMBAR, GAMBAR],
    });

    expect(h.berhasil).toBe(false);
    expect(h.jumlahUnggahan).toBe(1); // satu story sudah benar-benar terbit
    expect(h.pesan).toMatch(/ke-2/);
    expect(h.pesan).toContain('Media too large');
  });

  it('CAROUSEL: buat wadah anak tanpa caption, lalu wadah induk berisi children berurutan', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'anak-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'anak-2' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'anak-3' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'induk' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status_code: 'FINISHED' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'post-1' }) });

    const p = buatInstagram({ igUserId: 'ig1', accessToken: 'tok' });
    const h = await p.terbitkan({
      ...permintaan,
      jenisPosting: 'CAROUSEL',
      berkas: [GAMBAR, { ...GAMBAR, url: 'https://contoh.test/media/b.jpg' }, GAMBAR],
    });

    expect(h.berhasil).toBe(true);
    expect(h.idPlatform).toBe('post-1');

    // wadah anak: is_carousel_item=true dan TANPA caption
    for (const i of [0, 1, 2]) {
      const badan = fetchMock.mock.calls[i][1].body as URLSearchParams;
      expect(badan.get('is_carousel_item')).toBe('true');
      expect(badan.get('caption')).toBeNull();
    }

    const induk = fetchMock.mock.calls[3][1].body as URLSearchParams;
    expect(induk.get('media_type')).toBe('CAROUSEL');
    // children WAJIB string dipisah koma, bukan array JSON
    expect(induk.get('children')).toBe('anak-1,anak-2,anak-3');
    expect(induk.get('caption')).toBe(permintaan.caption);
  });

  it('CAROUSEL menolak jumlah berkas di luar 2–10 sebelum memanggil API', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const p = buatInstagram({ igUserId: 'ig1', accessToken: 'tok' });

    const satu = await p.terbitkan({ ...permintaan, jenisPosting: 'CAROUSEL', berkas: [GAMBAR] });
    expect(satu.berhasil).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    const sebelas = await p.terbitkan({
      ...permintaan,
      jenisPosting: 'CAROUSEL',
      berkas: Array.from({ length: 11 }, () => GAMBAR),
    });
    expect(sebelas.berhasil).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
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
    const h = await p.terbitkan({ ...permintaan, tujuan: 'TIKTOK', berkas: [GAMBAR] });

    expect(h.berhasil).toBe(false);
    expect(h.pesan).toMatch(/video/i);
    // tidak ada permintaan jaringan yang terbuang
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('menolak STORY dengan alasan yang jelas, tanpa memanggil API', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const p = buatTikTok({ accessToken: 'act.tok' });
    const h = await p.terbitkan({
      ...permintaan,
      tujuan: 'TIKTOK',
      jenisPosting: 'STORY',
      berkas: [VIDEO],
    });

    expect(h.berhasil).toBe(false);
    expect(h.pesan).toMatch(/aplikasi TikTok/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('menolak CAROUSEL dengan alasan yang jelas, tanpa memanggil API', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const p = buatTikTok({ accessToken: 'act.tok' });
    const h = await p.terbitkan({
      ...permintaan,
      tujuan: 'TIKTOK',
      jenisPosting: 'CAROUSEL',
      berkas: [VIDEO, VIDEO],
    });

    expect(h.berhasil).toBe(false);
    expect(h.pesan).toMatch(/carousel/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mode DRAFT (default) memakai endpoint inbox dengan PULL_FROM_URL', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { publish_id: 'pub-1' } }),
    });

    const p = buatTikTok({ accessToken: 'act.tok' });
    const h = await p.terbitkan({
      ...permintaan,
      tujuan: 'TIKTOK',
      jenisPosting: 'REELS',
      berkas: [VIDEO],
    });

    expect(h.berhasil).toBe(true);
    expect(h.pesan).toMatch(/draft/i);
    const [url, opsi] = fetchMock.mock.calls[0];
    expect(url).toContain('/post/publish/inbox/video/init/');
    expect(JSON.parse(opsi.body).source_info.source).toBe('PULL_FROM_URL');
    expect(JSON.parse(opsi.body).source_info.video_url).toBe(VIDEO.url);
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
    const h = await p.terbitkan({
      ...permintaan,
      tujuan: 'TIKTOK',
      jenisPosting: 'REELS',
      berkas: [VIDEO],
    });

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
  it('konten lama bertujuan KEDUANYA dikirim ke Instagram saja — tanpa error', async () => {
    // Selama TIKTOK_AKTIF=false, KEDUANYA tidak lagi berarti dua platform.
    // Konten yang sudah tersimpan dengan tujuan itu HARUS tetap terkirim dan
    // tidak boleh gagal hanya karena TikTok tidak dilayani.
    const hasil = await kirimKePlatform(
      { ...permintaan, tujuan: 'KEDUANYA', jenisPosting: 'REELS', berkas: [VIDEO] },
      { modus: 'mock' }
    );
    // Komposisinya deterministik: HANYA Instagram. `semuaBerhasil` TIDAK
    // diperiksa di sini karena mock sengaja gagal ~20% (acak) supaya jalur
    // "coba kirim lagi" teruji — lihat PELUANG_GAGAL di penerbit.ts.
    expect(hasil.hasil.map((h) => h.platform)).toEqual(['INSTAGRAM']);
    expect(hasil.hasil.every((h) => h.platform !== 'TIKTOK')).toBe(true);
    expect(hasil.modus).toBe('mock');
  });

  it('tujuan TIKTOK (data lama) tidak mengirim ke mana pun dan tidak melempar error', async () => {
    const hasil = await kirimKePlatform(
      { ...permintaan, tujuan: 'TIKTOK', jenisPosting: 'REELS', berkas: [VIDEO] },
      { modus: 'mock' }
    );
    expect(hasil.hasil).toEqual([]);
    expect(hasil.semuaBerhasil).toBe(true);
  });

  it('modus nyata tanpa kredensial tetap jujur menyebut simulasi di pesan hasil', async () => {
    const hasil = await kirimKePlatform(permintaan, { modus: 'nyata' });
    expect(hasil.hasil.every((h) => h.pesan.includes('simulasi'))).toBe(true);
    expect(hasil.modus).toBe('mock');
  });
});

/**
 * Konstanta platform TikTok khusus UJI. Jalur TikTok memang dimatikan di
 * antarmuka (TIKTOK_AKTIF=false), tetapi kodenya masih ada dan harus tetap
 * teruji — kalau tidak, saat dihidupkan nanti tidak ada yang menjaga.
 */
const PLATFORM_TIKTOK = 'TIKTOK' as const;
