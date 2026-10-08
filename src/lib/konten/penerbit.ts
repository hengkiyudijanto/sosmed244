/**
 * ADAPTER PENGIRIMAN — satu pintu untuk mengirim konten ke platform sosial.
 *
 * Kenapa berlapis:
 *   kode aplikasi -> Penerbit (antarmuka) -> mock | instagram | tiktok
 *
 * Integrasi nyata butuh kredensial developer + app review dari masing-masing
 * platform, dan itu tidak bisa ditunggu saat pengembangan. Modus dipilih dari
 * config/sosmed.json, jadi bisa berganti TANPA build ulang.
 *
 * ATURAN: berkas ini tidak menyentuh Prisma maupun halaman. Semua yang
 * dibutuhkan dikirim sebagai PermintaanKirim.
 *
 * Cara menambah platform baru:
 *   1. tambahkan namanya di src/lib/konten/status.ts (PLATFORM)
 *   2. tulis fungsi penerbitnya di sini
 *   3. daftarkan di REGISTRY_PENERBIT
 */

import {
  alasanJenisTidakAda,
  ATURAN_JENIS_POSTING,
  BATAS_PLATFORM,
  LABEL_JENIS_POSTING,
  LABEL_PLATFORM,
  platformDariTujuan,
  type JenisPosting,
  type Platform,
  type PlatformDikenal,
  type Tujuan,
} from './status';

export type BerkasKirim = {
  /** URL publik berkas ini */
  url: string;
  jenis: 'GAMBAR' | 'VIDEO';
  /** dipakai Instagram untuk menunggu pemrosesan video selesai */
  mime?: string;
};

export type PermintaanKirim = {
  /** id konten di database — dipakai sebagai kunci laporan hasil */
  kontenId: string;
  tujuan: Tujuan;
  /** jenis postingan: FEED | REELS | STORY | CAROUSEL */
  jenisPosting: JenisPosting;
  caption: string;
  /** berkas menurut URUTAN tampil (item pertama carousel menentukan potongan) */
  berkas: BerkasKirim[];
  sampulUrl?: string | null;
};

export type HasilPlatform = {
  /**
   * PlatformDikenal, bukan Platform: hasil kirim harus tetap bisa MENYEBUT
   * platform yang sedang dinonaktifkan (mis. jejak lama bertujuan TikTok),
   * supaya riwayat tidak kehilangan keterangan.
   */
  platform: PlatformDikenal;
  berhasil: boolean;
  /** id postingan di sisi platform (media id / publish id) */
  idPlatform?: string;
  /** tautan yang bisa diklik pemakai untuk memeriksa hasilnya */
  urlPublik?: string;
  /** pesan aman ditampilkan (tidak memuat token) */
  pesan: string;
  /** true bila platform masih memproses unggahan di belakang */
  perluPolling?: boolean;
  /** berapa unggahan yang benar-benar dibuat (story bisa lebih dari satu) */
  jumlahUnggahan?: number;
  /** URL publik tiap unggahan, bila platform mengembalikannya */
  urlPerUnggahan?: string[];
};


export type HasilKirim = {
  hasil: HasilPlatform[];
  /** true bila SEMUA platform berhasil */
  semuaBerhasil: boolean;
  modus: 'mock' | 'nyata';
};

export type Penerbit = {
  nama: string;
  modus: 'mock' | 'nyata';
  /** PlatformDikenal supaya penerbit TikTok tetap bisa ada walau dimatikan. */
  platform: PlatformDikenal;
  terbitkan(p: PermintaanKirim): Promise<HasilPlatform>;
};

// ===========================================================================
// MOCK — untuk demo & pengujian alur penuh tanpa app review
// ===========================================================================

/**
 * Mock sengaja TIDAK selalu berhasil, supaya jalur gagal ("coba kirim lagi")
 * benar-benar teruji, bukan hanya ada di kode.
 *
 * PENTING — jangan membuat kegagalannya deterministik per konten:
 * versi pertama memakai hash `kontenId`, sehingga konten yang gagal akan gagal
 * SELAMANYA. Akibatnya tombol "coba kirim lagi" tidak pernah bisa berhasil dan
 * jalur pemulihan justru tidak teruji. Kegagalan sekarang berbasis ACAK dengan
 * peluang ~1/5, jadi percobaan ulang punya kesempatan berhasil.
 */
const PELUANG_GAGAL = 0.2;

export function buatMock(platform: PlatformDikenal): Penerbit {
  return {
    nama: `mock-${platform.toLowerCase()}`,
    modus: 'mock',
    platform,

    async terbitkan(p) {
      await new Promise((r) => setTimeout(r, 250)); // simulasi jeda jaringan

      const idPlatform = `${platform.toLowerCase()}_sim_${Date.now().toString(36)}`;
      const ringkas = `${LABEL_JENIS_POSTING[p.jenisPosting]} · ${p.berkas.length} berkas`;

      // Jenis yang memang tidak didukung platform harus tetap ditolak di
      // simulasi — kalau tidak, alur simulasi "berhasil" untuk hal yang di
      // produksi mustahil, dan itu menyesatkan saat uji coba.
      const alasan = alasanJenisTidakAda(p.jenisPosting, platform);
      if (alasan) {
        return { platform, berhasil: false, pesan: `SIMULASI: ${alasan}` };
      }

      const aturan = ATURAN_JENIS_POSTING[platform][p.jenisPosting];
      if (!aturan) {
        return {
          platform,
          berhasil: false,
          pesan: `SIMULASI: jenis postingan ini tidak didukung ${LABEL_PLATFORM[platform]}.`,
        };
      }
      if (p.berkas.length < aturan.minBerkas) {
        return {
          platform,
          berhasil: false,
          pesan: `SIMULASI: ${LABEL_JENIS_POSTING[p.jenisPosting]} memerlukan minimal ${aturan.minBerkas} berkas.`,
        };
      }

      if (Math.random() < PELUANG_GAGAL) {
        return {
          platform,
          berhasil: false,
          pesan:
            'SIMULASI: platform menolak unggahan. Coba kirim lagi untuk melihat jalur pemulihan.',
        };
      }

      const jumlahUnggahan = p.jenisPosting === 'STORY' ? p.berkas.length : 1;
      const urlPerUnggahan = Array.from(
        { length: jumlahUnggahan },
        (_, i) => `https://contoh.invalid/${platform.toLowerCase()}/${idPlatform}-${i + 1}`
      );

      return {
        platform,
        berhasil: true,
        idPlatform,
        urlPublik: urlPerUnggahan[0],
        jumlahUnggahan,
        urlPerUnggahan,
        pesan:
          p.jenisPosting === 'STORY' && jumlahUnggahan > 1
            ? `SIMULASI: ${ringkas} — story diterbitkan satu per satu (${jumlahUnggahan} unggahan).`
            : `SIMULASI: ${ringkas} — berhasil dikirim (tidak ada unggahan nyata).`,
      };
    },
  };
}

// ===========================================================================
// INSTAGRAM — Meta Graph API
// ===========================================================================

/**
 * Instagram memakai model "container":
 *   1. POST /{ig-user-id}/media          — buat wadah (berisi URL berkas)
 *   2. POST /{ig-user-id}/media_publish  — terbitkan wadah
 *
 * Perbedaan per jenis postingan:
 *   FEED      gambar: image_url; video: media_type=REELS
 *   REELS     media_type=REELS + video_url
 *   STORY     media_type=STORIES (caption DIABAIKAN Instagram)
 *   CAROUSEL  buat wadah anak dengan is_carousel_item=true, lalu wadah induk
 *             media_type=CAROUSEL + children=<id,id,…> (maks 10, dipisah koma)
 *
 * Story BERDERET: Instagram tidak punya pengelompokan story — setiap berkas
 * diterbitkan satu per satu, berurutan, supaya urutannya seperti yang diharapkan.
 *
 * Syarat akun: Instagram Business/Creator yang terhubung ke Facebook Page.
 */
export function buatInstagram(kredensial: {
  igUserId: string;
  accessToken: string;
  apiVersi?: string;
  /** tunggu wadah video selesai diproses (detik). Instagram butuh waktu. */
  tungguWadahMaks?: number;
}): Penerbit {
  const dasar = `https://graph.facebook.com/${kredensial.apiVersi ?? 'v26.0'}`;
  const tungguMaksDetik = kredensial.tungguWadahMaks ?? 60;

  /** Satu panggilan POST ke Graph API, mengembalikan {ok, data}. */
  async function post(
    jalur: string,
    isi: Record<string, string>
  ): Promise<{ ok: boolean; id?: string; pesan?: string }> {
    const r = await fetch(`${dasar}/${jalur}`, {
      method: 'POST',
      body: new URLSearchParams({ ...isi, access_token: kredensial.accessToken }),
    });
    const j = (await r.json()) as { id?: string; error?: { message?: string } };
    if (!r.ok || !j.id) {
      return { ok: false, pesan: j.error?.message ?? String(r.status) };
    }
    return { ok: true, id: j.id };
  }

  /**
   * Tunggu wadah selesai diproses. Video butuh waktu; gambar hampir seketika.
   * Kalau statusnya tidak diketahui, JANGAN menunggu selamanya — melanjutkan
   * publish dengan wadah yang belum siap hanya menghasilkan error yang lebih
   * membingungkan daripada pesan di sini.
   */
  async function tungguWadah(
    containerId: string
  ): Promise<{ siap: boolean; pesan?: string }> {
    const batas = Date.now() + tungguMaksDetik * 1000;
    while (Date.now() < batas) {
      const r = await fetch(
        `${dasar}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(
          kredensial.accessToken
        )}`
      );
      const j = (await r.json()) as {
        status_code?: string;
        status?: string;
        error?: { message?: string };
      };
      if (j.error) return { siap: false, pesan: j.error.message };
      if (j.status_code === 'FINISHED') return { siap: true };
      if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') {
        return { siap: false, pesan: j.status ?? j.status_code };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return {
      siap: false,
      pesan: `Instagram belum selesai memproses berkas setelah ${tungguMaksDetik} detik.`,
    };
  }

  /** Buat wadah anak carousel (tanpa caption — caption hanya di wadah induk). */
  async function buatWadahAnak(b: BerkasKirim): Promise<{ ok: boolean; id?: string; pesan?: string }> {
    const isi: Record<string, string> = { is_carousel_item: 'true' };
    if (b.jenis === 'VIDEO') {
      isi.media_type = 'VIDEO';
      isi.video_url = b.url;
    } else {
      isi.image_url = b.url;
    }
    return post(`${kredensial.igUserId}/media`, isi);
  }

  return {
    nama: 'instagram-graph',
    modus: 'nyata',
    platform: 'INSTAGRAM',

    async terbitkan(p) {
      try {
        const alasan = alasanJenisTidakAda(p.jenisPosting, 'INSTAGRAM');
        if (alasan) return { platform: 'INSTAGRAM', berhasil: false, pesan: alasan };

        const wadahSiap = async (id: string, jenis: 'GAMBAR' | 'VIDEO') => {
          // gambar siap seketika; hanya video yang perlu ditunggu
          if (jenis === 'GAMBAR') return { siap: true as const };
          return tungguWadah(id);
        };

        const terbitkan = async (wadahId: string) =>
          post(`${kredensial.igUserId}/media_publish`, { creation_id: wadahId });

        // ===== CAROUSEL =====
        if (p.jenisPosting === 'CAROUSEL') {
          const aturan = ATURAN_JENIS_POSTING.INSTAGRAM.CAROUSEL!;
          if (p.berkas.length < aturan.minBerkas || p.berkas.length > aturan.maksBerkas!) {
            return {
              platform: 'INSTAGRAM',
              berhasil: false,
              pesan: aturan.catatan,
            };
          }

          const idAnak: string[] = [];
          for (const [i, b] of p.berkas.entries()) {
            const anak = await buatWadahAnak(b);
            if (!anak.ok || !anak.id) {
              return {
                platform: 'INSTAGRAM',
                berhasil: false,
                pesan: `Gagal menyiapkan berkas ke-${i + 1} untuk carousel: ${anak.pesan ?? 'tidak diketahui'}`,
              };
            }
            const siap = await wadahSiap(anak.id, b.jenis);
            if (!siap.siap) {
              return {
                platform: 'INSTAGRAM',
                berhasil: false,
                pesan: `Berkas ke-${i + 1} gagal diproses Instagram: ${siap.pesan ?? 'tidak diketahui'}`,
              };
            }
            idAnak.push(anak.id);
          }

          const induk = await post(`${kredensial.igUserId}/media`, {
            media_type: 'CAROUSEL',
            children: idAnak.join(','),
            caption: p.caption,
          });
          if (!induk.ok || !induk.id) {
            return {
              platform: 'INSTAGRAM',
              berhasil: false,
              pesan: `Instagram menolak carousel: ${induk.pesan ?? 'tidak diketahui'}`,
            };
          }

          const siapInduk = await tungguWadah(induk.id);
          if (!siapInduk.siap) {
            return {
              platform: 'INSTAGRAM',
              berhasil: false,
              pesan: `Carousel gagal diproses: ${siapInduk.pesan ?? 'tidak diketahui'}`,
            };
          }

          const publik = await terbitkan(induk.id);
          if (!publik.ok || !publik.id) {
            return {
              platform: 'INSTAGRAM',
              berhasil: false,
              pesan: `Carousel dibuat tetapi gagal dipublikasikan: ${publik.pesan ?? 'tidak diketahui'}`,
            };
          }
          return {
            platform: 'INSTAGRAM',
            berhasil: true,
            idPlatform: publik.id,
            urlPublik: `https://www.instagram.com/p/${publik.id}`,
            jumlahUnggahan: 1,
            pesan: `Carousel ${idAnak.length} berkas terpublikasi ke Instagram.`,
          };
        }

        // ===== STORY (satu per berkas, berurutan) =====
        if (p.jenisPosting === 'STORY') {
          const idUnggahan: string[] = [];
          for (const [i, b] of p.berkas.entries()) {
            const isi: Record<string, string> = { media_type: 'STORIES' };
            if (b.jenis === 'VIDEO') isi.video_url = b.url;
            else isi.image_url = b.url;

            const wadah = await post(`${kredensial.igUserId}/media`, isi);
            if (!wadah.ok || !wadah.id) {
              return {
                platform: 'INSTAGRAM',
                berhasil: false,
                pesan: `Story berkas ke-${i + 1} ditolak Instagram: ${wadah.pesan ?? 'tidak diketahui'}`,
                jumlahUnggahan: idUnggahan.length,
              };
            }
            const siap = await wadahSiap(wadah.id, b.jenis);
            if (!siap.siap) {
              return {
                platform: 'INSTAGRAM',
                berhasil: false,
                pesan: `Story berkas ke-${i + 1} gagal diproses: ${siap.pesan ?? 'tidak diketahui'}`,
                jumlahUnggahan: idUnggahan.length,
              };
            }
            const publik = await terbitkan(wadah.id);
            if (!publik.ok || !publik.id) {
              return {
                platform: 'INSTAGRAM',
                berhasil: false,
                pesan: `Story berkas ke-${i + 1} gagal dipublikasikan: ${publik.pesan ?? 'tidak diketahui'}`,
                jumlahUnggahan: idUnggahan.length,
              };
            }
            idUnggahan.push(publik.id);
          }

          return {
            platform: 'INSTAGRAM',
            berhasil: true,
            idPlatform: idUnggahan[0],
            jumlahUnggahan: idUnggahan.length,
            urlPerUnggahan: idUnggahan.map((id) => `https://www.instagram.com/stories/${id}`),
            pesan:
              idUnggahan.length > 1
                ? `${idUnggahan.length} story diterbitkan berurutan ke Instagram. Caption tidak ditampilkan pada story.`
                : 'Story diterbitkan ke Instagram (tampil 24 jam). Caption tidak ditampilkan.',
          };
        }

        // ===== FEED & REELS (satu berkas) =====
        const b = p.berkas[0];
        if (!b) {
          return { platform: 'INSTAGRAM', berhasil: false, pesan: 'Tidak ada berkas untuk dikirim.' };
        }

        const isi: Record<string, string> = {};
        if (b.jenis === 'VIDEO') {
          isi.media_type = 'REELS';
          isi.video_url = b.url;
          if (p.sampulUrl) isi.cover_url = p.sampulUrl;
        } else {
          isi.image_url = b.url;
        }
        isi.caption = p.caption;

        const wadah = await post(`${kredensial.igUserId}/media`, isi);
        if (!wadah.ok || !wadah.id) {
          return {
            platform: 'INSTAGRAM',
            berhasil: false,
            pesan: `Instagram menolak pembuatan media: ${wadah.pesan ?? 'tidak diketahui'}`,
          };
        }

        const siap = await wadahSiap(wadah.id, b.jenis);
        if (!siap.siap) {
          return {
            platform: 'INSTAGRAM',
            berhasil: false,
            pesan: `Media dibuat tetapi gagal diproses: ${siap.pesan ?? 'tidak diketahui'}`,
          };
        }

        const publik = await terbitkan(wadah.id);
        if (!publik.ok || !publik.id) {
          return {
            platform: 'INSTAGRAM',
            berhasil: false,
            pesan: `Media dibuat tetapi gagal dipublikasikan: ${publik.pesan ?? 'tidak diketahui'}`,
          };
        }

        return {
          platform: 'INSTAGRAM',
          berhasil: true,
          idPlatform: publik.id,
          urlPublik: `https://www.instagram.com/p/${publik.id}`,
          jumlahUnggahan: 1,
          perluPolling: b.jenis === 'VIDEO',
          pesan: `Terpublikasi ke Instagram (${LABEL_JENIS_POSTING[p.jenisPosting]}).`,
        };
      } catch (e) {
        return {
          platform: 'INSTAGRAM',
          berhasil: false,
          pesan: `Gagal menghubungi Instagram: ${
            e instanceof Error ? e.message : 'kesalahan jaringan'
          }`,
        };
      }
    },
  };
}

// ===========================================================================
// TIKTOK — Content Posting API
// ===========================================================================

/**
 * TikTok menolak `video_url` dari domain yang belum diverifikasi, jadi jalur
 * yang paling pasti adalah FILE_UPLOAD: berkas diambil dari URL media lalu
 * diunggah sebagai satu chunk.
 *
 * Yang TIDAK bisa dilakukan lewat Content Posting API:
 *   - STORY: tidak ada di API sama sekali (hanya bisa dari aplikasi TikTok).
 *   - CAROUSEL: belum didukung API.
 * Keduanya ditolak lebih dulu dengan pesan yang menjelaskan sebabnya, bukan
 * dibiarkan gagal di tengah jalan.
 *
 * Selama app belum lolos review, TikTok hanya mengizinkan posting ke DRAFT
 * (pengguna masih menekan Publish di aplikasi TikTok).
 */
export function buatTikTok(kredensial: {
  accessToken: string;
  mode?: 'DRAFT' | 'PUBLIK';
}): Penerbit {
  const dasar = 'https://open.tiktokapis.com/v2';

  return {
    nama: 'tiktok-content-posting',
    modus: 'nyata',
    platform: 'TIKTOK',

    async terbitkan(p) {
      try {
        // Jenis yang tidak didukung API TikTok — jangan buang permintaan.
        const alasan = alasanJenisTidakAda(p.jenisPosting, 'TIKTOK');
        if (alasan) {
          return { platform: 'TIKTOK', berhasil: false, pesan: alasan };
        }

        const b = p.berkas[0];
        if (!b) {
          return { platform: 'TIKTOK', berhasil: false, pesan: 'Tidak ada berkas untuk dikirim.' };
        }
        if (b.jenis !== 'VIDEO') {
          return { platform: 'TIKTOK', berhasil: false, pesan: BATAS_PLATFORM.TIKTOK.catatan };
        }
        if (p.berkas.length > 1) {
          return {
            platform: 'TIKTOK',
            berhasil: false,
            pesan: 'TikTok hanya menerima satu berkas per unggahan.',
          };
        }

        const mode = kredensial.mode ?? 'DRAFT';

        if (mode === 'DRAFT') {
          const r = await fetch(`${dasar}/post/publish/inbox/video/init/`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${kredensial.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              source_info: { source: 'PULL_FROM_URL', video_url: b.url },
            }),
          });
          const j = (await r.json()) as {
            data?: { publish_id?: string };
            error?: { message?: string };
          };
          if (!r.ok || !j.data?.publish_id) {
            return {
              platform: 'TIKTOK',
              berhasil: false,
              pesan: `TikTok menolak unggahan draft: ${j.error?.message ?? r.status}`,
            };
          }
          return {
            platform: 'TIKTOK',
            berhasil: true,
            idPlatform: j.data.publish_id,
            jumlahUnggahan: 1,
            pesan:
              'Terkirim ke kotak masuk TikTok sebagai draft. Buka aplikasi TikTok untuk menekan Publish.',
          };
        }

        // ==== mode PUBLIK: unggah berkasnya sendiri ====
        const ambil = await fetch(b.url);
        if (!ambil.ok) {
          return {
            platform: 'TIKTOK',
            berhasil: false,
            pesan: `Berkas tidak dapat diambil dari server (${ambil.status}).`,
          };
        }
        const isi = Buffer.from(await ambil.arrayBuffer());
        const ukuran = isi.length;

        const init = await fetch(`${dasar}/post/publish/video/init/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${kredensial.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            post_info: { title: p.caption, privacy_level: 'PUBLIC_TO_EVERYONE' },
            source_info: {
              source: 'FILE_UPLOAD',
              video_size: ukuran,
              chunk_size: ukuran,
              total_chunk_count: 1,
            },
          }),
        });
        const j = (await init.json()) as {
          data?: { publish_id?: string; upload_url?: string };
          error?: { message?: string };
        };
        if (!init.ok || !j.data?.upload_url || !j.data.publish_id) {
          return {
            platform: 'TIKTOK',
            berhasil: false,
            pesan: `TikTok menolak inisialisasi unggahan: ${j.error?.message ?? init.status}`,
          };
        }

        const unggah = await fetch(j.data.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes 0-${ukuran - 1}/${ukuran}`,
          },
          body: new Uint8Array(isi),
        });
        if (!unggah.ok) {
          return {
            platform: 'TIKTOK',
            berhasil: false,
            pesan: `Unggahan video ke TikTok gagal (${unggah.status}).`,
          };
        }

        return {
          platform: 'TIKTOK',
          berhasil: true,
          idPlatform: j.data.publish_id,
          jumlahUnggahan: 1,
          pesan: 'Terkirim ke TikTok dan sedang diproses.',
          perluPolling: true,
        };
      } catch (e) {
        return {
          platform: 'TIKTOK',
          berhasil: false,
          pesan: `Gagal menghubungi TikTok: ${
            e instanceof Error ? e.message : 'kesalahan jaringan'
          }`,
        };
      }
    },
  };
}

// ===========================================================================
// Pemilihan penerbit
// ===========================================================================

export type KonfigSosmed = {
  modus: 'mock' | 'nyata';
  instagram?: { igUserId?: string; accessToken?: string; apiVersi?: string };
  tiktok?: { accessToken?: string; mode?: 'DRAFT' | 'PUBLIK' };
  /**
   * Kredensial yang berasal dari DATABASE (hasil pembaruan token), bukan dari
   * berkas nilai tetap. Diisi oleh `bacaKredensial()` di token-platform.ts.
   *
   * Dipisah dari `instagram`/`tiktok` supaya sumbernya jelas: kalau token di
   * sini ada, ia MENANG atas yang di berkas — token hasil pembaruan selalu lebih
   * baru daripada token yang ditulis tangan.
   */
  tokenTerbaru?: {
    INSTAGRAM?: string;
    TIKTOK?: string;
  };
};

type Pembuat = (k: KonfigSosmed) => Penerbit | null;

/**
 * Registry: menambah platform = menambah satu baris di sini.
 *
 * Tipenya Record<PlatformDikenal, …> supaya penerbit TikTok TETAP terdaftar
 * walau `TIKTOK_AKTIF` dimatikan — yang dimatikan adalah penawarannya di
 * antarmuka, bukan kemampuannya. Dengan begitu konten lama bertujuan TIKTOK
 * masih menghasilkan laporan yang benar ("TikTok: dinonaktifkan"), bukan
 * kegagalan tak dikenal.
 */
const REGISTRY_PENERBIT: Record<PlatformDikenal, Pembuat> = {
  INSTAGRAM: (k) => {
    const c = k.instagram;
    // token dari database menang atas yang di berkas
    const accessToken = k.tokenTerbaru?.INSTAGRAM ?? c?.accessToken;
    if (!c?.igUserId || !accessToken) return null;
    return buatInstagram({
      igUserId: c.igUserId,
      accessToken,
      apiVersi: c.apiVersi,
    });
  },
  TIKTOK: (k) => {
    const accessToken = k.tokenTerbaru?.TIKTOK ?? k.tiktok?.accessToken;
    if (!accessToken) return null;
    return buatTikTok({ accessToken, mode: k.tiktok?.mode });
  },
};


/**
 * Pilih penerbit per platform.
 *
 * Kalau modus 'nyata' tetapi kredensial belum lengkap, JATUH KEMBALI ke mock
 * dengan catatan yang menyebut sebabnya — supaya alur tidak mati diam-diam dan
 * hasil simulasi tidak dikira hasil nyata.
 */
export function pilihPenerbit(
  /**
   * PlatformDikenal: uji dan pemanggil internal masih boleh menunjuk TikTok
   * walau jalurnya dimatikan (kodenya harus tetap teruji). Yang membatasi
   * pemakaian TikTok adalah antarmuka + platformDariTujuan(), bukan fungsi ini.
   */
  platform: PlatformDikenal,
  konfig: KonfigSosmed
): { penerbit: Penerbit; catatan?: string } {
  if (konfig.modus === 'mock') return { penerbit: buatMock(platform) };

  const penerbit = REGISTRY_PENERBIT[platform](konfig);
  if (penerbit) return { penerbit };

  const namaKredensial = platform === 'INSTAGRAM' ? 'Instagram (igUserId/accessToken)' : 'TikTok (accessToken)';
  return {
    penerbit: buatMock(platform),
    catatan: `Kredensial ${namaKredensial} belum diisi — pengiriman memakai simulasi.`,
  };
}

/** Jalankan pengiriman ke semua platform tujuan, kumpulkan hasilnya. */
export async function kirimKePlatform(
  permintaan: PermintaanKirim,
  konfig: KonfigSosmed
): Promise<HasilKirim> {
  const catatan: string[] = [];

  // Dijalankan paralel: kegagalan satu platform tidak menunda yang lain, dan
  // hasilnya dikumpulkan apa adanya (sukses sebagian mungkin terjadi).
  const hasil = await Promise.all(
    platformDariTujuan(permintaan.tujuan).map(async (platform) => {
      // Jenis yang tidak didukung platform ini ditolak SEBELUM memilih penerbit,
      // supaya di modus simulasi pun hasilnya jujur (tidak "berhasil" untuk hal
      // yang di produksi mustahil).
      const alasan = alasanJenisTidakAda(permintaan.jenisPosting, platform);
      if (alasan) {
        return { platform, berhasil: false, pesan: alasan };
      }

      const { penerbit, catatan: c } = pilihPenerbit(platform, konfig);
      if (c) catatan.push(c);
      const r = await penerbit.terbitkan(permintaan);
      return c ? { ...r, pesan: `${r.pesan} (${c})` } : r;
    })
  );

  const semuaBerhasil = hasil.every((h) => h.berhasil);
  // "nyata" hanya kalau modus nyata DAN tidak ada satu pun yang jatuh ke mock
  const modus: 'mock' | 'nyata' = konfig.modus === 'nyata' && catatan.length === 0 ? 'nyata' : 'mock';

  return { hasil, semuaBerhasil, modus };
}
