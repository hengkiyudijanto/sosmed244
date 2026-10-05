/**
 * Pembaca hasil pengiriman (kolom JSON `hasilKirim`).
 *
 * Dipisah dari komponen supaya bentuk JSON dari database diperiksa di SATU
 * tempat: kolom Json bertipe `unknown`, dan kalau langsung di-cast di komponen,
 * perubahan bentuk data muncul sebagai layar putih tanpa pesan.
 */

export type HasilSatuPlatform = {
  platform: string;
  berhasil: boolean;
  idPlatform?: string;
  urlPublik?: string;
  pesan: string;
  perluPolling?: boolean;
};

export type PetaHasilKirim = Record<string, HasilSatuPlatform>;

function satuValid(v: unknown): v is HasilSatuPlatform {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.berhasil === 'boolean' && typeof o.pesan === 'string';
}

/** Bentuk JSON hasil kirim valid? Dipakai sebagai type guard di UI. */
export function bacaHasilKirim(v: unknown): PetaHasilKirim | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const nilai = Object.values(v as Record<string, unknown>);
  if (nilai.length === 0 || !nilai.every(satuValid)) return null;
  return v as PetaHasilKirim;
}

/** Ringkasan satu baris untuk daftar: "TikTok berhasil · Instagram GAGAL". */
export function ringkasHasilKirim(v: unknown): { teks: string; adaGagal: boolean } | null {
  const peta = bacaHasilKirim(v);
  if (!peta) return null;
  const isi = Object.entries(peta);
  return {
    teks: isi.map(([p, h]) => `${p} ${h.berhasil ? 'berhasil' : 'GAGAL'}`).join(' · '),
    adaGagal: isi.some(([, h]) => !h.berhasil),
  };
}

/** Platform yang masih perlu dikirim ulang (gagal pada percobaan terakhir). */
export function platformGagal(v: unknown): string[] {
  const peta = bacaHasilKirim(v);
  if (!peta) return [];
  return Object.entries(peta)
    .filter(([, h]) => !h.berhasil)
    .map(([p]) => p);
}
