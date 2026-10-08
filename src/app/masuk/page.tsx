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
      {/* ===== panel kiri: identitas (hijau mint, teks hijau gelap) ===== */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-mint p-12 text-teal">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #00554b 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
        <div
          aria-hidden
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full blur-3xl"
          style={{ background: 'rgba(0,207,120,0.45)' }}
        />
        {/* bilah hijau terang selebar panel — aksen tema, seragam dengan menu aktif
            di dalam aplikasi. Sengaja selebar penuh: bilah pendek yang menggantung
            di tepi terlihat seperti elemen terpotong, bukan hiasan. */}
        <div aria-hidden className="absolute bottom-0 left-0 h-1.5 w-full bg-aksen" />

        <div className="relative flex items-center gap-3">
          <LogoBTN tinggi={30} />
          <span className="text-lg font-extrabold uppercase tracking-[0.14em]">sosmed244</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-extrabold uppercase leading-tight tracking-[-0.02em]">
            Satu alur kerja untuk semua konten sosial media.
          </h1>
          <ul className="mt-7 space-y-3.5 text-sm text-teal/85">
            {[
              'Unggah gambar & video, tentukan tujuan dan penyetujunya',
              'Ajukan untuk disetujui — revisi bisa bolak-balik',
              'Kirim ke platform setelah disetujui, pantau hasilnya',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aksen" />
                <span className="leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-teal/70">
          Konten tidak akan terkirim sebelum ada yang menyetujuinya.
        </p>
      </div>

      {/* ===== panel kanan: form (hitam pekat) ===== */}
      <div className="flex flex-col justify-center bg-latar px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <LogoBTN tinggi={28} prioritas={false} />
            <span className="text-lg font-extrabold uppercase tracking-[0.14em] text-mint">
              sosmed244
            </span>
          </div>

          <p className="label-kolom">Masuk</p>
          <h2 className="huruf-judul mt-2 text-3xl text-mint">Selamat datang</h2>
          <p className="mt-3 text-sm leading-relaxed text-teks-2">
            Gunakan email dan password akun Anda untuk melanjutkan.
          </p>

          <div className="mt-7">
            <FormMasuk />
          </div>

          <p className="mt-6 text-xs text-teks-3 leading-relaxed">
            Lupa password? Hubungi administrator untuk melakukan reset.
          </p>
          <p className="mt-4 text-xs text-teks-3">
            Belum punya akun?{' '}
            <Link href="/daftar" className="font-semibold text-aksen-teks hover:underline">
              Minta akses
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
