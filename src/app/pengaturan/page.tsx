import { redirect } from 'next/navigation';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { boleh } from '@/lib/konten/akses';
import { ringkasKonfig } from '@/lib/konten/konfig';
import { ringkasTokenPlatform } from '@/lib/konten/token-platform';
import { rangkumSisa } from '@/lib/konten/token-umur';
import { TombolPerbaruiToken } from '@/components/tombol-token';
import { ringkasToken } from '@/lib/konten/token-media';
import {
  ATURAN_JENIS_POSTING,
  BATAS_BERKAS,
  BATAS_PLATFORM,
  JENIS_POSTING,
  LABEL_JENIS_POSTING,
  LABEL_PLATFORM,
  PLATFORM,
} from '@/lib/konten/status';
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
  const [total, jumlahBerkas, agregatMedia, agregatKonten] = await Promise.all([
    prisma.konten.count(),
    prisma.media.count(),
    prisma.media.aggregate({ _sum: { byte: true, dilihat: true } }),
    prisma.konten.aggregate({ _sum: { mediaDilihat: true } }),
  ]);
  const totalByte = agregatMedia._sum.byte ?? 0;
  // konten yang punya minimal satu berkas
  const pakaiBerkas = await prisma.konten.count({ where: { media: { some: {} } } });
  const dibaca = agregatKonten._sum.mediaDilihat ?? agregatMedia._sum.dilihat ?? 0;
  const token = await ringkasToken();
  const tokenPlatform = await ringkasTokenPlatform();

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="animasi-naik">
          <p className="label-kolom">Pengaturan</p>
          <h1 className="huruf-judul mt-2 text-3xl text-mint sm:text-4xl">Koneksi platform</h1>
          <p className="mt-3 text-sm leading-relaxed text-teks-2">
            Status koneksi ke platform pengiriman. Selama kredensial belum diisi, pengiriman berjalan
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
                <span
                  className={`text-lg font-extrabold uppercase tracking-[0.02em] ${ konfig.modus === 'nyata' ? 'text-aksen' : 'text-tunggu'
                  }`}
                >
                  {konfig.modus === 'nyata' ? 'Nyata' : 'Simulasi'}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${ konfig.modus === 'nyata' ? 'bg-baik-bg text-aksen' : 'bg-tunggu-bg text-tunggu'
                  }`}
                >
                  {konfig.modus === 'nyata' ? 'API sungguhan' : 'tanpa unggahan nyata'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="label-kolom">Berkas konfigurasi</div>
              <div className="mt-1.5 break-all font-mono text-[11px] text-teks-2">
                {konfig.lokasi} {konfig.berkasAda ? '(ada)' : '(belum dibuat)'}
              </div>
            </div>
          </div>

          <pre className="mt-4 overflow-x-auto border border-garis-kuat bg-black px-4 py-3 text-[11px] leading-relaxed text-mint">
{`{
 "modus": "nyata",
 "instagram": {
   "igUserId": "17841400000000000",
   "accessToken": "EAAG...",
   "apiVersi": "v26.0"
 }
 }`}
          </pre>
          <p className="mt-2 text-[11px] leading-relaxed text-teks-3">
            Simpan berkas itu di server, lalu muat ulang halaman ini — tidak perlu build ulang.
            Selama <code className="font-mono">modus</code> masih{' '}
            <code className="font-mono">mock</code>, pengiriman tetap disimulasikan walau kredensial
            terisi.
          </p>
        </section>

        {/* ===== status kredensial ===== */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {PLATFORM.map((p) => {
            // TikTok tidak ada di PLATFORM selama TIKTOK_AKTIF=false, jadi
            // cabangnya cukup satu: Instagram. Kalau TikTok dinyalakan lagi,
            // kembalikan cabang kondisional seperti semula (riwayat git).
            const token = konfig.instagram.accessToken;
            const akun = konfig.instagram.igUserId;
            const siap = token.ada && Boolean(akun?.ada);

            return (
              <section key={p} className="kartu p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
                    {LABEL_PLATFORM[p]}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${ siap ? 'bg-baik-bg text-aksen' : 'bg-netral-bg text-teks-3'
                    }`}
                  >
                    {siap ? 'siap' : 'belum lengkap'}
                  </span>
                </div>

                <dl className="mt-3 space-y-2 border-t border-garis pt-3 text-[11px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-teks-3">Instagram User ID</dt>
                    <dd className="font-mono text-teks-2">
                      {akun?.ada ? `${akun.awal} (${akun.panjang} karakter)` : '— belum diisi'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-teks-3">Access token</dt>
                    <dd className="font-mono text-teks-2">
                      {token.ada ? `${token.awal} (${token.panjang} karakter)` : '— belum diisi'}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-[11px] leading-relaxed text-teks-3">
                  Syarat: akun Instagram Business/Creator yang terhubung ke Facebook Page, serta
                  aplikasi Meta dengan izin instagram_content_publish.
                </p>

                {/* ===== status masa berlaku token ===== */}
                {(() => {
                  const t = tokenPlatform.find((x) => x.platform === p);
                  const sisa = rangkumSisa(t?.accessExpiresAt ?? null);

                  return (
                    <div className="mt-3 border-l-2 border-garis-kuat bg-mint-panel px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-teks-3">
                          Masa berlaku token
                        </span>
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${ sisa.lewat ? 'text-buruk' : sisa.mendesak ? 'text-tunggu' : 'text-aksen'
                          }`}
                        >
                          {sisa.teks}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-teks-3">
                        {t?.adaDiDatabase
                          ? `Disimpan di database${t.diperbaruiAt ? `, terakhir diperbarui ${t.diperbaruiAt.toLocaleString('id-ID')}` : ''} — pembaruan otomatis aktif.`
                          : 'Masih memakai token dari konfigurasi. Pembaruan otomatis belum bisa bekerja untuk token yang ditempel manual, karena masa berlakunya tidak diketahui.'}
                      </p>
                      {t?.galatTerakhir && (
                        <p className="mt-1.5 border-l-2 border-buruk bg-buruk-bg px-2 py-1 text-[10px] leading-relaxed text-buruk">
                          Pembaruan terakhir gagal: {t.galatTerakhir}
                        </p>
                      )}
                      <TombolPerbaruiToken platform={p} />
                    </div>
                  );
                })()}
              </section>
            );
          })}
        </div>

        {/* ===== batasan platform ===== */}
        <section className="kartu mt-5 p-5">
          <h2 className="mb-3 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
            Jenis postingan yang didukung
          </h2>
          <div className="overflow-x-auto">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Instagram</th>
                  <th>Berkas</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {JENIS_POSTING.map((j) => {
                  // Kolom TikTok sengaja tidak ditampilkan selama TIKTOK_AKTIF=false;
                  // aturannya sendiri masih ada di status.ts kalau nanti dihidupkan.
                  const ig = ATURAN_JENIS_POSTING.INSTAGRAM[j];
                  const rentang = (a?: (typeof ATURAN_JENIS_POSTING)['INSTAGRAM'][typeof j]) =>
                    a ? (a.maksBerkas === null ? `min ${a.minBerkas}` : `${a.minBerkas}–${a.maksBerkas}`) : '—';
                  return (
                    <tr key={j}>
                      <td className="font-medium text-mint">{LABEL_JENIS_POSTING[j]}</td>
                      <td className="text-xs text-teks-2">
                        {ig ? `boleh (${rentang(ig)} berkas)` : '— tidak didukung'}
                      </td>
                      <td className="text-xs text-teks-2">
                        {ig?.wajibVideo ? 'wajib video' : 'gambar atau video'}
                      </td>
                      <td className="text-xs text-teks-2">
                        {!ig?.captionDipakai && 'Caption diabaikan di Instagram story. '}
                        {ig ? ig.catatan : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ===== batasan platform ===== */}
        <section className="kartu mt-5 p-5">
          <h2 className="mb-3 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
            Batasan berkas (divalidasi sebelum kirim)
          </h2>
          <div className="overflow-x-auto">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Format</th>
                  <th>Caption</th>
                  <th>Maks berkas / unggahan</th>
                </tr>
              </thead>
              <tbody>
                {PLATFORM.map((p) => {
                  const b = BATAS_PLATFORM[p];
                  const format = [...b.mimeGambar, ...b.mimeVideo];
                  return (
                    <tr key={p}>
                      <td className="font-medium text-mint">{LABEL_PLATFORM[p]}</td>
                      <td className="text-xs text-teks-2">
                        {format.length > 0 ? format.join(', ') : '—'}
                        {b.maksDurasiDetik && (
                          <span className="block text-teks-3">
                            durasi maks {Math.round(b.maksDurasiDetik / 60)} menit
                          </span>
                        )}
                      </td>
                      <td className="text-xs tabular-nums text-teks-2">
                        {BATAS_BERKAS.maksCaption[p]} karakter
                      </td>
                      <td className="text-xs tabular-nums text-teks-2">
                        {BATAS_BERKAS.maksBerkas[p]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ===== penyimpanan ===== */}
        <section className="kartu mt-5 p-5">
          <h2 className="mb-3 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
            Penyimpanan berkas
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="label-kolom">Konten</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-mint">{total}</div>
              <div className="mt-0.5 text-[11px] text-teks-3">
                {pakaiBerkas} punya berkas · {jumlahBerkas} berkas total
              </div>
            </div>
            <div>
              <div className="label-kolom">Total berkas</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-mint">
                {formatUkuran(totalByte)}
              </div>
              <div className="mt-0.5 text-[11px] text-teks-3">
                batas per berkas {formatUkuran(BATAS_MEDIA.videoMaksByte)}
              </div>
            </div>
            <div>
              <div className="label-kolom">Dibaca</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-mint">
                {dibaca}×
              </div>
              <div className="mt-0.5 text-[11px] text-teks-3">pembacaan berkas media</div>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-teks-3">
            Berkas disimpan sebagai kolom di database (Vercel tidak punya filesystem permanen). Ini
            cukup untuk gambar & video pendek, tetapi <strong>bukan tempatnya untuk video besar</strong>:
            kalau kolom ini membengkak, pindahkan ke object storage — hanya route{' '}
            <code className="font-mono">/media/[id]</code> yang perlu diubah.
          </p>
        </section>

        {/* ===== token berkas ===== */}
        <section className="kartu mt-5 p-5">
          <h2 className="mb-3 border-b border-garis pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teks-3">
            Tautan berkas untuk platform
          </h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <div className="label-kolom">Token aktif</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-mint">
                {token.aktif}
              </div>
              <div className="mt-0.5 text-[11px] text-teks-3">belum kedaluwarsa</div>
            </div>
            <div>
              <div className="label-kolom">Sudah terpakai</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-mint">
                {token.terpakai}
              </div>
              <div className="mt-0.5 text-[11px] text-teks-3">pernah diambil platform</div>
            </div>
            <div>
              <div className="label-kolom">Umur tautan</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-mint">
                {token.umurMenit} mnt
              </div>
              <div className="mt-0.5 text-[11px] text-teks-3">setelah dibuat</div>
            </div>
            <div>
              <div className="label-kolom">Maks pemakaian</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-mint">
                {token.maksPakai}×
              </div>
              <div className="mt-0.5 text-[11px] text-teks-3">per berkas</div>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-teks-3">
            Platform menarik berkas dari URL publik, sedangkan halaman aplikasi
            menuntut sesi login. Karena itu setiap pengiriman membuat <strong>tautan
            sekali-pakai per berkas</strong>: berumur {token.umurMenit} menit, maksimum{' '}
            {token.maksPakai}× diambil, dan hanya berlaku untuk satu berkas. Tautan itu disimpan
            sebagai hash, jadi tidak bisa dibaca dari database. Tanpa sesi dan tanpa tautan, berkas
            tetap tidak dapat diakses.
          </p>
        </section>

        {/* ===== belum selesai ===== */}
        <section className="kartu mt-5 border-l-2 border-tunggu p-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-tunggu">
            Belum selesai sebelum bisa dipakai produksi
          </h2>
          <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-teks-2">
            <li>
              <strong>Jalur TikTok dinonaktifkan.</strong> TikTok hanya mengizinkan unggahan nyata
              setelah app-nya lolos audit, dan audit itu tidak tersedia untuk alat internal seperti
              ini. Kode TikTok masih tersimpan dan bisa dinyalakan kembali lewat{' '}
              <code className="font-mono">TIKTOK_AKTIF</code> di{' '}
              <code className="font-mono">src/lib/konten/status.ts</code> kalau suatu saat app-nya
              sudah lolos audit.
            </li>
            <li>
              <strong>Paket Vercel Hobby.</strong> Cron hanya boleh sekali sehari, jadi pengiriman
              terjadwal tidak bisa tepat menit. Untuk itu perlu paket Pro atau penjadwal luar yang
              memanggil <code className="font-mono">/api/cron/jadwal</code> dengan rahasia.
            </li>
          </ul>
        </section>
      </div>
    </Kerangka>
  );
}
