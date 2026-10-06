import { redirect } from 'next/navigation';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { boleh } from '@/lib/konten/akses';
import { ringkasKonfig } from '@/lib/konten/konfig';
import { BATAS_PLATFORM, LABEL_PLATFORM, PLATFORM } from '@/lib/konten/status';
import { BATAS_MEDIA, formatUkuran } from '@/lib/konten/media';

export const metadata = { title: 'Pengaturan' };

/**
 * Halaman pengaturan pengiriman.
 *
 * Halaman ini TIDAK menyimpan kredensial dan TIDAK menampilkannya. Kredensial
 * ditulis ke config/sosmed.json di server (tidak ikut git). Alasannya: token di
 * kolom database akan ikut ter-backup, ter-ekspor, dan terlihat di setiap dump;
 * berkas config hanya dibaca proses yang membutuhkannya.
 */
export default async function Pengaturan() {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');
  if (pengguna.harusGantiPassword) redirect('/ubah-password');
  if (!boleh(pengguna.peran, 'kelola_pengaturan')) redirect('/');

  const konfig = ringkasKonfig();
  const [total, pakaiBerkas, agregat] = await Promise.all([
    prisma.konten.count(),
    prisma.konten.count({ where: { mediaData: { not: null } } }),
    prisma.konten.aggregate({ _sum: { mediaByte: true, mediaDilihat: true } }),
  ]);
  const totalByte = agregat._sum.mediaByte ?? 0;

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="animasi-naik">
          <h1 className="text-2xl font-bold text-abu-900">Pengaturan</h1>
          <div className="mt-2 h-0.5 w-10 rounded-full bg-logo-merah" />
          <p className="mt-3 text-sm leading-relaxed text-abu-500">
            Status koneksi ke TikTok & Instagram. Selama kredensial belum diisi, pengiriman berjalan
            dalam <strong>modus simulasi</strong> — alur persetujuan tetap nyata, tetapi tidak ada
            unggahan ke platform.
          </p>
        </div>

        {/* ===== modus ===== */}
        <section className="kartu mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label-kolom">Modus pengiriman</div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <span className={`text-lg font-bold ${konfig.modus === 'nyata' ? 'text-sukses' : 'text-peringatan'}`}>
                  {konfig.modus === 'nyata' ? 'Nyata' : 'Simulasi'}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    konfig.modus === 'nyata' ? 'bg-sukses-bg text-sukses' : 'bg-peringatan-bg text-peringatan'
                  }`}
                >
                  {konfig.modus === 'nyata' ? 'API sungguhan' : 'tanpa unggahan nyata'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="label-kolom">Berkas konfigurasi</div>
              <div className="mt-1.5 break-all font-mono text-[11px] text-abu-600">
                {konfig.lokasi} {konfig.berkasAda ? '(ada)' : '(belum dibuat)'}
              </div>
            </div>
          </div>

          <pre className="mt-4 overflow-x-auto rounded-lg bg-abu-900 px-4 py-3 text-[11px] leading-relaxed text-abu-100">
{`{
  "modus": "nyata",
  "instagram": {
    "igUserId": "17841400000000000",
    "accessToken": "EAAG...",
    "apiVersi": "v21.0"
  },
  "tiktok": {
    "accessToken": "act....",
    "mode": "DRAFT"
  }
}`}
          </pre>
          <p className="mt-2 text-[11px] leading-relaxed text-abu-500">
            Simpan berkas itu di server, lalu muat ulang halaman ini — tidak perlu build ulang.
            Selama <code className="font-mono">modus</code> masih{' '}
            <code className="font-mono">mock</code>, pengiriman tetap disimulasikan walau kredensial
            terisi.
          </p>
        </section>

        {/* ===== status kredensial ===== */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {PLATFORM.map((p) => {
            const token = p === 'INSTAGRAM' ? konfig.instagram.accessToken : konfig.tiktok.accessToken;
            const akun = p === 'INSTAGRAM' ? konfig.instagram.igUserId : null;
            const siap = token.ada && (p === 'TIKTOK' || Boolean(akun?.ada));

            return (
              <section key={p} className="kartu p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-abu-800">{LABEL_PLATFORM[p]}</h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      siap ? 'bg-sukses-bg text-sukses' : 'bg-abu-100 text-abu-500'
                    }`}
                  >
                    {siap ? 'siap' : 'belum lengkap'}
                  </span>
                </div>

                <dl className="mt-3 space-y-2 text-[11px]">
                  {p === 'INSTAGRAM' && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-abu-500">Instagram User ID</dt>
                      <dd className="font-mono text-abu-700">
                        {akun?.ada ? `${akun.awal} (${akun.panjang} karakter)` : '— belum diisi'}
                      </dd>
                    </div>
                  )}
                  {p === 'TIKTOK' && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-abu-500">Mode posting</dt>
                      <dd className="font-mono text-abu-700">{konfig.tiktok.mode}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-abu-500">Access token</dt>
                    <dd className="font-mono text-abu-700">
                      {token.ada ? `${token.awal} (${token.panjang} karakter)` : '— belum diisi'}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-[11px] leading-relaxed text-abu-500">
                  {p === 'INSTAGRAM'
                    ? 'Syarat: akun Instagram Business/Creator yang terhubung ke Facebook Page, serta aplikasi Meta dengan izin instagram_content_publish.'
                    : 'Syarat: aplikasi TikTok Developer dengan Content Posting API. Selama app belum lolos review, TikTok hanya mengizinkan posting ke draft.'}
                </p>
              </section>
            );
          })}
        </div>

        {/* ===== batasan platform ===== */}
        <section className="kartu mt-5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-abu-800">
            Batasan platform (divalidasi sebelum kirim)
          </h2>
          <div className="overflow-x-auto">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Format</th>
                  <th>Caption</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {PLATFORM.map((p) => {
                  const b = BATAS_PLATFORM[p];
                  const format = [...b.mimeGambar, ...b.mimeVideo];
                  return (
                    <tr key={p}>
                      <td className="font-medium text-abu-900">{LABEL_PLATFORM[p]}</td>
                      <td className="text-xs text-abu-600">
                        {format.length > 0 ? format.join(', ') : '—'}
                        {b.maksDurasiDetik && (
                          <span className="block text-abu-400">
                            durasi maks {Math.round(b.maksDurasiDetik / 60)} menit
                          </span>
                        )}
                      </td>
                      <td className="text-xs tabular-nums text-abu-600">{b.maksCaption} karakter</td>
                      <td className="text-xs text-abu-600">{b.catatan}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ===== penyimpanan ===== */}
        <section className="kartu mt-5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-abu-800">Penyimpanan berkas</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="label-kolom">Konten</div>
              <div className="mt-1.5 text-xl font-bold tabular-nums text-abu-900">{total}</div>
              <div className="mt-0.5 text-[11px] text-abu-400">{pakaiBerkas} punya berkas</div>
            </div>
            <div>
              <div className="label-kolom">Total berkas</div>
              <div className="mt-1.5 text-xl font-bold tabular-nums text-abu-900">
                {formatUkuran(totalByte)}
              </div>
              <div className="mt-0.5 text-[11px] text-abu-400">
                batas per berkas {formatUkuran(BATAS_MEDIA.videoMaksByte)}
              </div>
            </div>
            <div>
              <div className="label-kolom">Dibaca</div>
              <div className="mt-1.5 text-xl font-bold tabular-nums text-abu-900">
                {agregat._sum.mediaDilihat ?? 0}×
              </div>
              <div className="mt-0.5 text-[11px] text-abu-400">pembacaan berkas media</div>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-abu-500">
            Berkas disimpan sebagai kolom di database (Vercel tidak punya filesystem permanen). Ini
            cukup untuk gambar & video pendek, tetapi <strong>bukan tempatnya untuk video besar</strong>:
            kalau kolom ini membengkak, pindahkan ke object storage — hanya route{' '}
            <code className="font-mono">/media/[id]</code> yang perlu diubah.
          </p>
        </section>

        {/* ===== belum selesai ===== */}
        <section className="kartu mt-5 border-l-[3px] border-peringatan p-5">
          <h2 className="mb-2 text-sm font-semibold text-peringatan">
            Belum selesai sebelum bisa dipakai produksi
          </h2>
          <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-abu-700">
            <li>
              <strong>URL media publik.</strong> TikTok & Instagram menarik berkas dari URL, sedangkan
              route <code className="font-mono">/media/[id]</code> saat ini{' '}
              <em>memerlukan sesi login</em>. Untuk produksi perlu token sekali-pakai berumur pendek
              khusus pengiriman.
            </li>
            <li>
              <strong>Domain publik.</strong> Setel <code className="font-mono">NEXT_PUBLIC_APP_URL</code>{' '}
              ke alamat aplikasi, kalau tidak URL media akan menunjuk ke localhost.
            </li>
            <li>
              <strong>Refresh token.</strong> Access token Meta kedaluwarsa (~60 hari) dan TikTok
              memakai refresh token — belum ada pembaru otomatis.
            </li>
            <li>
              <strong>Pengiriman terjadwal.</strong> Status & waktu jadwal sudah tersimpan, tetapi
              belum ada worker yang menjalankannya pada waktunya.
            </li>
            <li>
              <strong>App review.</strong> TikTok Content Posting API & izin Meta perlu ditinjau
              platform sebelum unggahan nyata diizinkan.
            </li>
          </ul>
        </section>
      </div>
    </Kerangka>
  );
}
