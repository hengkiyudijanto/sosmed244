/**
 * Siapkan berkas media di peramban SEBELUM dikirim ke server.
 *
 * Kenapa di peramban:
 *  - Foto/video dari HP bisa 2–5 MB, padahal yang dibutuhkan jauh lebih kecil.
 *    Mengirim berkas besar membebani koneksi pengguna dan memperlambat simpan.
 *  - Instagram feed HANYA menerima JPEG. Konversi di peramban berarti server
 *    tidak perlu pustaka encoder (sharp) di jalur permintaan yang lambat.
 *
 * Video TIDAK dikompres: tidak ada encoder yang layak di peramban. Ukurannya
 * dibatasi, dan batas itu disebutkan apa adanya di UI.
 */

export const BATAS_MEDIA = {
  /** gambar: hasil akhir setelah kompresi */
  gambarMaksByte: 8 * 1024 * 1024,
  /** lebar maksimum gambar setelah dikecilkan */
  gambarLebar: 1440,
  /**
   * video: TIDAK dikompres. Ini batas praktis penyimpanan di kolom database —
   * di atas ini sebaiknya pakai object storage, bukan kolom database.
   */
  videoMaksByte: 20 * 1024 * 1024,
  /** batas panjang data URL yang diterima server (base64 ≈ 1,37× byte) */
  maksDataUrl: 28 * 1024 * 1024,
};

export type HasilMedia = {
  dataUrl: string;
  mime: string;
  byte: number;
  lebar: number;
  tinggi: number;
  durasiDetik: number | null;
  jenis: 'GAMBAR' | 'VIDEO';
};

/** Perkirakan byte dari data URL (base64: 4 karakter mewakili 3 byte). */
export function ukuranDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  if (i < 0) return 0;
  const b64 = dataUrl.slice(i + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function formatUkuran(byte: number): string {
  if (byte >= 1024 * 1024) return `${(byte / 1024 / 1024).toFixed(1)} MB`;
  if (byte >= 1024) return `${Math.round(byte / 1024)} KB`;
  return `${byte} B`;
}

function bacaGambar(berkas: File): Promise<HTMLImageElement> {
  return new Promise((selesai, gagal) => {
    const url = URL.createObjectURL(berkas);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      selesai(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      gagal(new Error('Gambar tidak dapat dibaca.'));
    };
    img.src = url;
  });
}

/**
 * Kompres gambar: perkecil sampai sisi terpanjang <= BATAS_MEDIA.gambarLebar,
 * lalu turunkan mutu JPEG sampai di bawah batas byte.
 * Keluaran SELALU JPEG — itu yang membuat unggahan ke Instagram tidak ditolak.
 */
export async function kompresGambar(berkas: File): Promise<HasilMedia> {
  if (!berkas.type.startsWith('image/')) {
    throw new Error('Berkas gambar harus JPG, PNG, atau WebP.');
  }

  const img = await bacaGambar(berkas);
  const skala = Math.min(1, BATAS_MEDIA.gambarLebar / Math.max(img.width, img.height));
  const lebar = Math.max(1, Math.round(img.width * skala));
  const tinggi = Math.max(1, Math.round(img.height * skala));

  const kanvas = document.createElement('canvas');
  kanvas.width = lebar;
  kanvas.height = tinggi;
  const ctx = kanvas.getContext('2d');
  if (!ctx) throw new Error('Peramban tidak mendukung pengolahan gambar.');
  // latar putih dulu: PNG transparan jadi hitam kalau langsung dikonversi JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lebar, tinggi);
  ctx.drawImage(img, 0, 0, lebar, tinggi);

  let mutu = 0.86;
  let dataUrl = kanvas.toDataURL('image/jpeg', mutu);
  while (ukuranDataUrl(dataUrl) > BATAS_MEDIA.gambarMaksByte && mutu > 0.35) {
    mutu -= 0.1;
    dataUrl = kanvas.toDataURL('image/jpeg', mutu);
  }

  const byte = ukuranDataUrl(dataUrl);
  if (byte > BATAS_MEDIA.gambarMaksByte) {
    throw new Error(
      `Gambar masih ${formatUkuran(byte)} setelah dikompres. Maksimum ${formatUkuran(
        BATAS_MEDIA.gambarMaksByte
      )}.`
    );
  }

  return { dataUrl, mime: 'image/jpeg', byte, lebar, tinggi, durasiDetik: null, jenis: 'GAMBAR' };
}

/** Baca video apa adanya + metadata durasi (durasi dipakai untuk validasi). */
export function bacaVideo(berkas: File): Promise<HasilMedia> {
  return new Promise((selesai, gagal) => {
    if (!berkas.type.startsWith('video/')) {
      gagal(new Error('Berkas harus berupa video MP4/MOV.'));
      return;
    }
    if (berkas.size > BATAS_MEDIA.videoMaksByte) {
      gagal(
        new Error(
          `Video ${formatUkuran(berkas.size)} melebihi batas ${formatUkuran(
            BATAS_MEDIA.videoMaksByte
          )}.`
        )
      );
      return;
    }

    const url = URL.createObjectURL(berkas);
    const v = document.createElement('video');
    v.preload = 'metadata';

    v.onloadedmetadata = () => {
      const durasi = Number.isFinite(v.duration) ? v.duration : null;
      const lebar = v.videoWidth;
      const tinggi = v.videoHeight;
      const pembaca = new FileReader();
      pembaca.onload = () => {
        URL.revokeObjectURL(url);
        selesai({
          dataUrl: String(pembaca.result),
          mime: berkas.type || 'video/mp4',
          byte: berkas.size,
          lebar,
          tinggi,
          durasiDetik: durasi,
          jenis: 'VIDEO',
        });
      };
      pembaca.onerror = () => {
        URL.revokeObjectURL(url);
        gagal(new Error('Video tidak dapat dibaca.'));
      };
      pembaca.readAsDataURL(berkas);
    };

    v.onerror = () => {
      URL.revokeObjectURL(url);
      gagal(new Error('Video tidak dapat dibaca (format tidak didukung peramban).'));
    };

    v.src = url;
  });
}

/** Pilih jalur yang tepat menurut jenis berkas. */
export function siapkanMedia(berkas: File): Promise<HasilMedia> {
  return berkas.type.startsWith('video/') ? bacaVideo(berkas) : kompresGambar(berkas);
}
