import Link from 'next/link';
import { redirect } from 'next/navigation';
import { penggunaDariSesi } from '@/lib/auth';
import { FormMasuk } from '@/components/form-masuk';
import { LogoBTN } from '@/components/logo-btn';

export const metadata = { title: 'Masuk' };

export default async function HalamanMasuk() {
  // Sudah punya sesi aktif? langsung ke dasbor
  const pengguna = await penggunaDariSesi();
  if (pengguna) redirect(pengguna.harusGantiPassword ? '/ubah-password' : '/');

  return (
    <div className="flex-1 grid lg:grid-cols-[1.05fr_1fr] min-h-screen">
      {/* ===== panel kiri: identitas ===== */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-biru-900 p-12 text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
        <div
          aria-hidden
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full blur-3xl"
          style={{ background: 'rgba(37,99,168,0.45)' }}
        />
        <div aria-hidden className="absolute bottom-0 left-0 h-1.5 w-40 bg-jingga-500" />

        <div className="relative flex items-center gap-3">
          {/* di panel biru gelap: logo diputihkan supaya terbaca */}
          <LogoBTN tinggi={30} className="brightness-0 invert" />
          <span className="text-lg font-bold tracking-tight">sosmed244</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            Satu alur kerja untuk semua konten sosial media.
          </h1>
          <ul className="mt-7 space-y-3.5 text-sm text-white/80">
            {[
              'Unggah gambar & video, atur tujuan TikTok / Instagram',
              'Ajukan untuk disetujui — revisi bisa bolak-balik',
              'Kirim ke platform setelah disetujui, pantau hasilnya',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-jingga-400" />
                <span className="leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          Konten tidak akan terkirim sebelum ada yang menyetujuinya.
        </p>
      </div>

      {/* ===== panel kanan: form ===== */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            {/* di latar terang: logo warna asli (biru + merah) */}
            <LogoBTN tinggi={28} prioritas={false} />
            <span className="text-lg font-bold tracking-tight text-abu-900">sosmed244</span>
          </div>

          <h2 className="text-2xl font-bold text-abu-900">Masuk</h2>
          <p className="mt-2 text-sm text-abu-500">
            Gunakan email dan password akun Anda untuk melanjutkan.
          </p>

          <div className="mt-7">
            <FormMasuk />
          </div>

          <p className="mt-6 text-xs text-abu-400 leading-relaxed">
            Lupa password? Hubungi administrator untuk melakukan reset.
          </p>
          <p className="mt-4 text-xs text-abu-400">
            Belum punya akun?{' '}
            <Link href="/daftar" className="font-semibold text-biru-600 hover:underline">
              Minta akses
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
