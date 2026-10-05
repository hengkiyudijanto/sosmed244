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
  BATAS_PLATFORM,
  platformDariTujuan,
  type Platform,
  type Tujuan,
} from './status';

export type PermintaanKirim = {
  /** id konten di database — dipakai sebagai kunci laporan hasil */
  kontenId: string;
  tujuan: Tujuan;
  caption: string;
  /** URL publik berkas media (harus bisa diakses platform, bukan localhost) */
  mediaUrl: string;
  jenis: 'GAMBAR' | 'VIDEO';
  sampulUrl?: string | null;
};

export type HasilPlatform = {
  platform: Platform;
  berhasil: boolean;
  /** id postingan di sisi platform (media id / publish id) */
  idPlatform?: string;
  /** tautan yang bisa diklik pemakai untuk memeriksa hasilnya */
  urlPublik?: string;
  /** pesan aman ditampilkan (tidak memuat token) */
  pesan: string;
  /** true bila platform masih memproses unggahan di belakang */
  perluPolling?: boolean;
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
  platform: Platform;
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

export function buatMock(platform: Platform): Penerbit {
  return {
    nama: `mock-${platform.toLowerCase()}`,
    modus: 'mock',
    platform,

    async terbitkan(p) {
      await new Promise((r) => setTimeout(r, 250)); // simulasi jeda jaringan

      const idPlatform = `${platform.toLowerCase()}_sim_${Date.now().toString(36)}`;

      if (Math.random() < PELUANG_GAGAL) {
        return {
          platform,
          berhasil: false,
          pesan:
            'SIMULASI: platform menolak unggahan. Coba kirim lagi untuk melihat jalur pemulihan.',
        };
      }

      return {
        platform,
        berhasil: true,
        idPlatform,
        urlPublik: `https://contoh.invalid/${platform.toLowerCase()}/${idPlatform}`,
        pesan: 'SIMULASI: berhasil dikirim (tidak ada unggahan nyata).',
      };
    },
  };
}

// ===========================================================================
// INSTAGRAM — Meta Graph API
// ===========================================================================

/**
 * Dua langkah: POST /{ig-user-id}/media (buat container), lalu
 * POST /{ig-user-id}/media_publish. Video memakai media_type=REELS dan
 * perlu waktu proses di sisi Meta (karena itu ditandai perluPolling).
 *
 * Syarat akun: Instagram Business/Creator yang terhubung ke Facebook Page.
 */
export function buatInstagram(kredensial: {
  igUserId: string;
  accessToken: string;
  apiVersi?: string;
}): Penerbit {
  const dasar = `https://graph.facebook.com/${kredensial.apiVersi ?? 'v21.0'}`;

  return {
    nama: 'instagram-graph',
    modus: 'nyata',
    platform: 'INSTAGRAM',

    async terbitkan(p) {
      try {
        const wadah = new URLSearchParams({ access_token: kredensial.accessToken });
        if (p.jenis === 'VIDEO') {
          wadah.set('media_type', 'REELS');
          wadah.set('video_url', p.mediaUrl);
          if (p.sampulUrl) wadah.set('cover_url', p.sampulUrl);
        } else {
          wadah.set('image_url', p.mediaUrl);
        }
        wadah.set('caption', p.caption);

        const r1 = await fetch(`${dasar}/${kredensial.igUserId}/media`, {
          method: 'POST',
          body: wadah,
        });
        const j1 = (await r1.json()) as { id?: string; error?: { message?: string } };
        if (!r1.ok || !j1.id) {
          return {
            platform: 'INSTAGRAM',
            berhasil: false,
            pesan: `Instagram menolak pembuatan media: ${j1.error?.message ?? r1.status}`,
          };
        }

        const r2 = await fetch(`${dasar}/${kredensial.igUserId}/media_publish`, {
          method: 'POST',
          body: new URLSearchParams({
            creation_id: j1.id,
            access_token: kredensial.accessToken,
          }),
        });
        const j2 = (await r2.json()) as { id?: string; error?: { message?: string } };
        if (!r2.ok || !j2.id) {
          return {
            platform: 'INSTAGRAM',
            berhasil: false,
            pesan: `Media dibuat tetapi gagal dipublikasikan: ${j2.error?.message ?? r2.status}`,
          };
        }

        return {
          platform: 'INSTAGRAM',
          berhasil: true,
          idPlatform: j2.id,
          urlPublik: `https://www.instagram.com/p/${j2.id}`,
          pesan: 'Terpublikasi ke Instagram.',
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
 * yang paling pasti adalah FILE_UPLOAD: berkas diambil dari mediaUrl lalu
 * diunggah sebagai satu chunk.
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
        // TikTok tidak menerima gambar sama sekali — jangan buang permintaan.
        if (p.jenis === 'GAMBAR') {
          return {
            platform: 'TIKTOK',
            berhasil: false,
            pesan: BATAS_PLATFORM.TIKTOK.catatan,
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
              source_info: { source: 'PULL_FROM_URL', video_url: p.mediaUrl },
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
            pesan:
              'Terkirim ke kotak masuk TikTok sebagai draft. Buka aplikasi TikTok untuk menekan Publish.',
          };
        }

        // ==== mode PUBLIK: unggah berkasnya sendiri ====
        const ambil = await fetch(p.mediaUrl);
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
};

type Pembuat = (k: KonfigSosmed) => Penerbit | null;

/** Registry: menambah platform = menambah satu baris di sini. */
const REGISTRY_PENERBIT: Record<Platform, Pembuat> = {
  INSTAGRAM: (k) => {
    const c = k.instagram;
    if (!c?.igUserId || !c.accessToken) return null;
    return buatInstagram({
      igUserId: c.igUserId,
      accessToken: c.accessToken,
      apiVersi: c.apiVersi,
    });
  },
  TIKTOK: (k) => {
    if (!k.tiktok?.accessToken) return null;
    return buatTikTok({ accessToken: k.tiktok.accessToken, mode: k.tiktok.mode });
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
  platform: Platform,
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
