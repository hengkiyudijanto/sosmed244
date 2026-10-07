/**
 * PEMBARUAN TOKEN PLATFORM.
 *
 * Masalahnya: token Instagram (long-lived) berlaku 60 hari dan token TikTok
 * hanya 24 jam. Tanpa pembaru, pengiriman berhenti dengan 401 begitu tokennya
 * habis — dan itu terjadi tanpa peringatan, biasanya tepat saat ada konten yang
 * harus segera terkirim.
 *
 * CARA KERJA
 *  - Kredensial awal dibaca dari config/sosmed.json atau environment variable
 *    (client key/secret, ig user id). Berkas/env tidak pernah berubah.
 *  - Token hasil pembaruan disimpan di tabel TokenPlatform, karena nilainya
 *    BERUBAH dan Vercel tidak punya filesystem permanen.
 *  - `bacaKredensial()` mengembalikan token TERBARU: dari database kalau ada,
 *    kalau tidak dari berkas/env.
 *
 * ATURAN YANG DIPEGANG
 *  1. **TikTok menerbitkan refresh token BARU setiap kali diperbarui, dan yang
 *     lama langsung tidak berlaku.** Karena itu token baru disimpan SEBELUM
 *     apa pun yang lain; kalau gagal menyimpan, token yang baru terbit akan
 *     hilang dan akun tidak bisa diperbarui lagi.
 *  2. **Kegagalan pembaruan tidak boleh menggagalkan pengiriman.** Token lama
 *     mungkin masih berlaku; galatnya dicatat, pengiriman tetap dicoba.
 *  3. **Tanpa masa berlaku yang diketahui, token TIDAK diperbarui** (lihat
 *     `perluPerbarui`) — pada TikTok, memperbarui dengan alasan yang salah bisa
 *     membuang token yang masih panjang umurnya.
 */

import { prisma } from '@/lib/db';
import { bacaKonfig } from './konfig';
import { perluPerbarui, type StatusToken } from './token-umur';
import type { Platform } from './status';

/** Umur token TikTok dari dokumentasi: access 24 jam, refresh 365 hari. */
const TIKTOK_ACCESS_DETIK = 24 * 60 * 60;
const TIKTOK_REFRESH_DETIK = 365 * 24 * 60 * 60;

/** Kredensial lengkap untuk satu platform — sudah memakai token TERBARU. */
export type KredensialPlatform = {
  accessToken?: string;
  igUserId?: string;
  apiVersi?: string;
  tiktokMode?: 'DRAFT' | 'PUBLIK';
  /** dari mana token ini berasal — untuk halaman pengaturan & penelusuran */
  sumber: 'database' | 'konfigurasi';
  /** masa berlaku token yang sedang dipakai */
  accessExpiresAt?: Date | null;
};

/**
 * Ambil kredensial yang akan DIPAKAI mengirim: token terbaru dari database,
 * dengan kredensial statis (client key/secret, user id) dari berkas/env.
 */
export async function bacaKredensial(platform: Platform): Promise<KredensialPlatform> {
  const konfig = bacaKonfig();

  const tersimpan = await prisma.tokenPlatform
    .findUnique({ where: { platform } })
    .catch(() => null);

  if (platform === 'INSTAGRAM') {
    const dariKonfig = konfig.instagram;
    return {
      igUserId: dariKonfig?.igUserId,
      apiVersi: dariKonfig?.apiVersi,
      accessToken: tersimpan?.accessToken ?? dariKonfig?.accessToken,
      sumber: tersimpan ? 'database' : 'konfigurasi',
      accessExpiresAt: tersimpan?.accessExpiresAt ?? null,
    };
  }

  const dariKonfig = konfig.tiktok;
  return {
    accessToken: tersimpan?.accessToken ?? dariKonfig?.accessToken,
    tiktokMode: dariKonfig?.mode,
    sumber: tersimpan ? 'database' : 'konfigurasi',
    accessExpiresAt: tersimpan?.accessExpiresAt ?? null,
  };
}

export type HasilPerbarui =
  | { diperbarui: true; pesan: string; expiresAt: Date }
  | { diperbarui: false; pesan: string; galat?: string };

/**
 * Perbarui token satu platform, tanpa memeriksa apakah memang perlu.
 * Dipakai oleh tombol "Perbarui sekarang" di halaman pengaturan.
 */
export async function perbaruiTokenSekarang(
  platform: Platform,
  sekarang: Date = new Date()
): Promise<HasilPerbarui> {
  const konfig = bacaKonfig();

  if (platform === 'INSTAGRAM') return perbaruiInstagram(konfig, sekarang);
  return perbaruiTikTok(konfig, sekarang);
}

/**
 * Instagram: tukar token long-lived lama dengan yang baru.
 *
 * Token hasil pembaruan berlaku 60 hari sejak tanggal pembaruan. Token harus
 * berumur minimal 24 jam dan belum kedaluwarsa — kalau belum cukup umur,
 * Meta menolak, dan penolakan itu bukan kegagalan yang perlu dicatat sebagai
 * galat (lihat pemanggilnya).
 */
async function perbaruiInstagram(
  konfig: ReturnType<typeof bacaKonfig>,
  sekarang: Date
): Promise<HasilPerbarui> {
  const tersimpan = await prisma.tokenPlatform.findUnique({ where: { platform: 'INSTAGRAM' } });
  const token = tersimpan?.accessToken ?? konfig.instagram?.accessToken;

  if (!token) {
    return { diperbarui: false, pesan: 'Token Instagram belum diisi — tidak ada yang bisa diperbarui.' };
  }

  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(
    token
  )}`;

  let respons: Response;
  try {
    respons = await fetch(url, { method: 'GET' });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'kesalahan jaringan';
    await catatGalat('INSTAGRAM', pesan);
    return { diperbarui: false, pesan: 'Gagal menghubungi Instagram.', galat: pesan };
  }

  const isi = (await respons.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!respons.ok || !isi.access_token) {
    const pesan = isi.error?.message ?? `HTTP ${respons.status}`;
    await catatGalat('INSTAGRAM', pesan);
    return { diperbarui: false, pesan: 'Instagram menolak pembaruan token.', galat: pesan };
  }

  const expiresAt = new Date(sekarang.getTime() + (isi.expires_in ?? 60 * 24 * 3600) * 1000);

  await simpanToken({
    platform: 'INSTAGRAM',
    accessToken: isi.access_token,
    accessExpiresAt: expiresAt,
    sekarang,
  });

  return {
    diperbarui: true,
    pesan: `Token Instagram diperbarui, berlaku sampai ${expiresAt.toLocaleDateString('id-ID')}.`,
    expiresAt,
  };
}

/**
 * TikTok: tukar refresh token dengan access token baru.
 *
 * PENTING: TikTok mengembalikan refresh token BARU, dan yang lama langsung
 * tidak berlaku. Karena itu nilai yang dikembalikan disimpan apa adanya — kalau
 * tidak, akun tidak bisa diperbarui lagi setelah ini.
 */
async function perbaruiTikTok(
  konfig: ReturnType<typeof bacaKonfig>,
  sekarang: Date
): Promise<HasilPerbarui> {
  const clientKey = process.env.SOSMED_TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.SOSMED_TIKTOK_CLIENT_SECRET;
  const tersimpan = await prisma.tokenPlatform.findUnique({ where: { platform: 'TIKTOK' } });
  const refreshToken = tersimpan?.refreshToken;

  if (!clientKey || !clientSecret) {
    return {
      diperbarui: false,
      pesan:
        'Client key/secret TikTok belum diisi — pembaruan otomatis butuh keduanya (SOSMED_TIKTOK_CLIENT_KEY dan SOSMED_TIKTOK_CLIENT_SECRET).',
    };
  }

  if (!refreshToken) {
    return {
      diperbarui: false,
      pesan:
        'Refresh token TikTok belum tersimpan. Pembaruan otomatis hanya bekerja untuk token yang diperoleh lewat alur otorisasi (bukan token yang ditempel manual).',
    };
  }

  let respons: Response;
  try {
    respons = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'kesalahan jaringan';
    await catatGalat('TIKTOK', pesan);
    return { diperbarui: false, pesan: 'Gagal menghubungi TikTok.', galat: pesan };
  }

  const isi = (await respons.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!respons.ok || !isi.access_token) {
    const pesan = isi.error_description ?? isi.error ?? `HTTP ${respons.status}`;
    await catatGalat('TIKTOK', pesan);
    return { diperbarui: false, pesan: 'TikTok menolak pembaruan token.', galat: pesan };
  }

  const expiresAt = new Date(
    sekarang.getTime() + (isi.expires_in ?? TIKTOK_ACCESS_DETIK) * 1000
  );
  const refreshExpiresAt = new Date(
    sekarang.getTime() + (isi.refresh_expires_in ?? TIKTOK_REFRESH_DETIK) * 1000
  );

  // Token baru disimpan LEBIH DULU, sebelum apa pun: kalau langkah ini gagal,
  // refresh token yang baru terbit akan hilang dan akun tidak bisa diperbarui.
  await simpanToken({
    platform: 'TIKTOK',
    accessToken: isi.access_token,
    // refresh token yang lama sudah tidak berlaku; pakai yang baru
    refreshToken: isi.refresh_token ?? refreshToken,
    accessExpiresAt: expiresAt,
    refreshExpiresAt,
    sekarang,
  });

  return {
    diperbarui: true,
    pesan: `Token TikTok diperbarui (berlaku 24 jam; diperbarui lagi otomatis sebelum habis).`,
    expiresAt,
  };
}

async function simpanToken(data: {
  platform: Platform;
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: Date;
  refreshExpiresAt?: Date;
  sekarang: Date;
}) {
  await prisma.tokenPlatform.upsert({
    where: { platform: data.platform },
    create: {
      platform: data.platform,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessExpiresAt: data.accessExpiresAt,
      refreshExpiresAt: data.refreshExpiresAt,
      diperbaruiAt: data.sekarang,
      galatTerakhir: null,
    },
    update: {
      accessToken: data.accessToken,
      ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
      accessExpiresAt: data.accessExpiresAt,
      ...(data.refreshExpiresAt ? { refreshExpiresAt: data.refreshExpiresAt } : {}),
      diperbaruiAt: data.sekarang,
      galatTerakhir: null,
    },
  });
}

/**
 * Catat kegagalan pembaruan tanpa menggagalkan apa pun.
 *
 * Kegagalan mencatat TIDAK boleh melempar: pembaruan token adalah pekerjaan
 * latar, dan pengiriman konten tidak boleh ikut gagal karena buku catatannya
 * bermasalah.
 */
async function catatGalat(platform: Platform, pesan: string) {
  try {
    await prisma.tokenPlatform.upsert({
      where: { platform },
      create: {
        platform,
        accessToken: '',
        galatTerakhir: pesan.slice(0, 500),
      },
      update: { galatTerakhir: pesan.slice(0, 500) },
    });
  } catch (e) {
    console.error('[token] gagal mencatat galat pembaruan:', e);
  }
}

/**
 * Periksa semua platform: mana yang perlu diperbarui, lalu perbarui.
 *
 * Dipanggil dari cron harian dan dari tombol di halaman pengaturan. Aman
 * dipanggil kapan saja: kalau tidak ada yang perlu, tidak ada permintaan
 * jaringan yang dikirim.
 */
export async function perbaruiTokenYangPerlu(sekarang: Date = new Date()): Promise<
  { platform: Platform; tindakan: 'diperbarui' | 'tidak_perlu' | 'gagal' | 'tidak_bisa'; pesan: string }[]
> {
  const hasil: { platform: Platform; tindakan: 'diperbarui' | 'tidak_perlu' | 'gagal' | 'tidak_bisa'; pesan: string }[] = [];

  for (const platform of ['INSTAGRAM', 'TIKTOK'] as const) {
    const tersimpan = await prisma.tokenPlatform
      .findUnique({ where: { platform } })
      .catch(() => null);

    const kredensial = await bacaKredensial(platform);

    // Token yang HANYA ada di konfigurasi (belum pernah lewat alur otorisasi)
    // tidak punya informasi kedaluwarsa, jadi tidak bisa diperbarui otomatis —
    // dan memang seharusnya tidak: kita tidak tahu kapan ia habis.
    const status: StatusToken = {
      accessExpiresAt: tersimpan?.accessExpiresAt ?? null,
      refreshExpiresAt: tersimpan?.refreshExpiresAt ?? null,
      diperbaruiAt: tersimpan?.diperbaruiAt ?? null,
    };

    if (!kredensial.accessToken && !tersimpan) {
      hasil.push({
        platform,
        tindakan: 'tidak_bisa',
        pesan: 'Kredensial belum diisi.',
      });
      continue;
    }

    const keputusan = perluPerbarui(status, sekarang);
    if (!keputusan.perlu) {
      const tidakBisa = 'tidakBisa' in keputusan ? keputusan.tidakBisa : undefined;
      hasil.push({
        platform,
        tindakan: tidakBisa ? 'tidak_bisa' : 'tidak_perlu',
        pesan: tidakBisa ? `${keputusan.alasan} ${tidakBisa}` : keputusan.alasan,
      });
      continue;
    }

    const perbarui = await perbaruiTokenSekarang(platform, sekarang);
    hasil.push({
      platform,
      tindakan: perbarui.diperbarui ? 'diperbarui' : 'gagal',
      pesan: perbarui.pesan + (perbarui.diperbarui ? '' : ` (${perbarui.galat ?? 'tanpa keterangan'})`),
    });
  }

  return hasil;
}

/** Ringkasan untuk halaman pengaturan — TIDAK memuat token. */
export async function ringkasTokenPlatform() {
  const baris = await prisma.tokenPlatform.findMany({
    select: {
      platform: true,
      accessExpiresAt: true,
      refreshExpiresAt: true,
      diperbaruiAt: true,
      galatTerakhir: true,
      accessToken: true,
    },
  });

  return baris.map((b) => ({
    platform: b.platform,
    // token di database berarti pembaruan otomatis bisa bekerja
    adaDiDatabase: b.accessToken.length > 0,
    accessExpiresAt: b.accessExpiresAt,
    refreshExpiresAt: b.refreshExpiresAt,
    diperbaruiAt: b.diperbaruiAt,
    galatTerakhir: b.galatTerakhir,
  }));
}
