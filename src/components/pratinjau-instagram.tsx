'use client';

/**
 * PRATINJAU INSTAGRAM — kerangka HP dengan tampilan tiruan Instagram.
 *
 * Kenapa ada: di form dan di halaman persetujuan, berkas hanya tampil sebagai
 * daftar berkas. Bentuk akhirnya (potongan rasio, urutan carousel, caption
 * terpotong "…selengkapnya", caption story yang tidak tampil) baru kelihatan
 * setelah terbit — di situ kesalahannya sudah mahal. Pratinjau ini menunjukkan
 * hasilnya SEBELUM dikirim.
 *
 * Batas yang disengaja:
 *  - Ini TIRUAN, bukan embed Instagram (Instagram tidak menyediakan cara
 *    merender unggahan yang belum terbit).
 *  - Warnanya memakai token tema gelap supaya cocok dengan sisa antarmuka;
 *    Instagram aslinya terang. Bentuk, susunan, dan aturan tampilnya yang
 *    ditiru — bukan warnanya. (Kalau dipaksa putih, halaman gelap ini jadi
 *    menyilaukan dan keluar dari tema.)
 *  - Rasio bingkai HANYA dipakai sebagai kerangka; isi berkas tetap memakai
 *    object-cover persis seperti Instagram memotongnya.
 */

import { useState } from 'react';
import { rasioTampil, bagianTerpotong } from '@/lib/konten/rasio-medsos';

export type BerkasPratinjau = {
  /** URL yang bisa dirender peramban (data URL untuk berkas baru, atau /media/… untuk yang tersimpan) */
  src?: string;
  jenis: 'GAMBAR' | 'VIDEO';
  /** id media — hanya untuk kunci React */
  id?: string;
  /** dimensi asli berkas; dipakai menentukan rasio tampil ala Instagram */
  lebar?: number | null;
  tinggi?: number | null;
};

export type JenisPratinjau = 'FEED' | 'STORY' | 'REELS' | 'CAROUSEL';

export function PratinjauHp({
  jenisPosting,
  caption,
  namaAkun,
  berkas,
  judul,
  catatanKreator = false,
}: {
  jenisPosting: JenisPratinjau;
  caption: string;
  /** nama akun yang ditampilkan di kepala pratinjau */
  namaAkun: string;
  berkas: BerkasPratinjau[];
  /**
   * Dipakai untuk keterangan; tidak ditampilkan di layar Instagram.
   * Keterangan itu HANYA relevan di form (kreator masih bisa mengubah judulnya);
   * penyetuju yang meninjau konten jadi bingung membaca catatan tentang kolom
   * yang tidak ada di halamannya — jadi catatannya cukup satu baris, dan
   * `catatanKreator` memberi jalan untuk mematikannya.
   */
  judul?: string;
  /** tampilkan catatan tambahan yang hanya berguna bagi pembuat konten */
  catatanKreator?: boolean;
}) {
  const [aktif, setAktif] = useState(0);
  const urut = Math.min(aktif, Math.max(berkas.length - 1, 0));
  const sekarang = berkas[urut];

  // caption story tidak dipakai platform — jangan ditampilkan di pratinjau,
  // supaya yang dilihat sama dengan yang benar-benar terbit.
  const captionTampil = jenisPosting === 'STORY' ? '' : caption;
  const captionAsli = captionTampil.replace(/\r?\n/g, ' ').trim();

  const isStory = jenisPosting === 'STORY';
  const isReels = jenisPosting === 'REELS';
  const isCarousel = jenisPosting === 'CAROUSEL';

  // Rasio bingkai MENGIKUTI aturan Instagram (src/lib/konten/rasio-medsos.ts).
  // Sebelumnya Feed selalu dipaksa kotak 1:1, padahal Instagram menerima
  // 4:5–1.91:1 tanpa memotong — akibatnya pratinjau menunjukkan potongan yang
  // tidak akan terjadi, dan pengguna memperbaiki hal yang tidak rusak.
  const berkasTampil = sekarang;
  const rasioAsli =
    berkasTampil?.lebar && berkasTampil?.tinggi && berkasTampil.tinggi > 0
      ? berkasTampil.lebar / berkasTampil.tinggi
      : null;

  // Carousel memakai berkas PERTAMA sebagai acuan rasio semua berkas.
  const berkasAcuan = isCarousel ? berkas[0] : berkasTampil;
  const rasioAcuan =
    berkasAcuan?.lebar && berkasAcuan?.tinggi && berkasAcuan.tinggi > 0
      ? berkasAcuan.lebar / berkasAcuan.tinggi
      : null;

  const tampil = rasioTampil(jenisPosting, isCarousel ? rasioAcuan : rasioAsli);
  const diketahuiRasio = Boolean(
    (isCarousel ? rasioAcuan : rasioAsli) &&
      Number.isFinite((isCarousel ? rasioAcuan : rasioAsli) as number)
  );
  // Batas bawah rasio hanya untuk mencegah bingkai jadi bilah tipis pada foto
  // lanskap ekstrem. 9:16 (0.5625) HARUS tetap utuh — kalau dibatasi 0,6,
  // pratinjau story memotong lebih sedikit daripada Instagram, dan itu justru
  // membuat pengguna lengah. Jadi batasnya 0,55: di bawah 9:16.
  const rasioCss = Math.max(tampil.rasio, 0.55);
  const gayaIsi = { aspectRatio: String(rasioCss) };

  const namaAkunTampil = namaAkun.startsWith('@') ? namaAkun : `@${namaAkun}`;

  // Catatan kecil di bawah bingkai. Dipilih menurut jenis postingan supaya
  // tidak ada baris yang tidak berlaku (mis. catatan story di konten feed).
  const catatan: string[] = [];

  // Rasio: sebutkan apa adanya supaya pengguna tahu hasil akhirnya, dan
  // peringatkan bila ada bagian gambar yang benar-benar terbuang.
  if (diketahuiRasio) {
    const w = rasioTampil(jenisPosting, isCarousel ? rasioAcuan : rasioAsli);
    if (w.dijepit) {
      const persen = Math.round((isCarousel ? bagianTerpotong(jenisPosting, rasioAcuan) : bagianTerpotong(jenisPosting, rasioAsli)) * 100);
      catatan.push(
        jenisPosting === 'STORY' || jenisPosting === 'REELS'
          ? `Rasio akhir 9:16 — sekitar ${persen}% gambar terpotong dari atas-bawah.`
          : `Rasio akhir ${formatRasio(w.rasio)} — sekitar ${persen}% gambar terpotong (di luar rentang 4:5–1.91:1).`
      );
    } else {
      const r = isCarousel ? rasioAcuan : rasioAsli;
      catatan.push(
        `Rasio akhir ${formatRasio(r as number)} — tidak dipotong, sama seperti tampil di Instagram.`
      );
    }
  }

  if (isStory) {
    catatan.push('Story tidak memakai caption — itu sebabnya caption tidak tampil di atas.');
  }
  if (isCarousel && berkas.length > 1) {
    catatan.push('Semua berkas mengikuti rasio berkas 1, seperti aturan carousel Instagram.');
  }
  // Judul internal hanya bisa diubah pembuatnya, jadi catatan ini tidak
  // ditampilkan di halaman penyetuju.
  if (catatanKreator && judul) {
    catatan.push('Judul internal hanya untuk daftar di aplikasi ini — tidak ikut terbit.');
  }

  return (
    <div className="lg:sticky lg:top-6">
      <p className="label-kolom mb-2">Pratinjau di HP</p>

      {/* ===== bingkai HP ===== */}
      <div className="mx-auto w-full max-w-[330px] rounded-[2rem] border-[6px] border-panel-naik bg-latar p-1.5 shadow-md">
        {/* takik atas */}
        <div className="mx-auto mb-1.5 h-1.5 w-16 rounded-full bg-panel-naik" />

        <div className="overflow-hidden rounded-[1.4rem] bg-[#000]">
          {/* ===== bilah status HP ===== */}
          <div className="flex items-center justify-between bg-black px-3 py-1 text-[9px] font-semibold text-white/70">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span>▮▮▮</span>
              <span>◤</span>
              <span className="flex h-2.5 w-5 items-center rounded-[2px] border border-white/50 p-[1.5px]">
                <span className="h-full w-3/4 rounded-[1px] bg-white/80" />
              </span>
            </span>
          </div>

          {/* ===== kepala: cerita/unggahan + akun ===== */}
          {isStory ? (
            <div className="flex items-center gap-2 px-2.5 py-2">
              <div className="rounded-full bg-gradient-to-tr from-aksen to-tunggu p-[2px]">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-panel-naik text-[10px] font-bold text-mint">
                  {inisial(namaAkunTampil)}
                </div>
              </div>
              <span className="text-[11px] font-semibold text-white">{namaAkunTampil}</span>
              <span className="text-[10px] text-white/50">2 jam</span>
              <span className="ml-auto flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-white" />
                <span className="h-1 w-1 rounded-full bg-white" />
                <span className="h-1 w-1 rounded-full bg-white" />
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-2">
              <div className="rounded-full bg-gradient-to-tr from-aksen via-tunggu to-buruk p-[2px]">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-panel-naik text-[10px] font-bold text-mint">
                  {inisial(namaAkunTampil)}
                </div>
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[11px] font-semibold text-white">{namaAkunTampil}</p>
                <p className="text-[9px] text-white/50">{isReels ? 'Reels' : 'Jakarta'}</p>
              </div>
              <span className="ml-auto text-[13px] leading-none text-white">⋯</span>
            </div>
          )}

          {/* ===== isi: berkas ===== */}
          <div className="relative w-full overflow-hidden bg-[#0b0b0b]" style={gayaIsi}>
            {sekarang?.src ? (
              sekarang.jenis === 'VIDEO' ? (
                <video
                  src={sekarang.src}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: 'center' }}
                  muted
                  playsInline
                  loop
                  controls={isReels}
                />
              ) : (
                <img
                  src={sekarang.src}
                  alt="Pratinjau"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: 'center' }}
                />
              )
            ) : (
              <div className="grid h-full w-full place-items-center px-4 text-center">
                <p className="text-[10px] leading-relaxed text-white/40">
                  Belum ada berkas.
                  <br />
                  Pratinjau muncul setelah berkas dipilih.
                </p>
              </div>
            )}

            {/* tombol geser carousel — seperti di Instagram */}
            {isCarousel && berkas.length > 1 && (
              <>
                {urut > 0 && (
                  <button
                    type="button"
                    onClick={() => setAktif(urut - 1)}
                    aria-label="Berkas sebelumnya"
                    className="absolute left-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-xs text-white"
                  >
                    ‹
                  </button>
                )}
                {urut < berkas.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setAktif(urut + 1)}
                    aria-label="Berkas berikutnya"
                    className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-xs text-white"
                  >
                    ›
                  </button>
                )}
                <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold tabular-nums text-white">
                  {urut + 1}/{berkas.length}
                </span>
              </>
            )}

            {/* penanda story: batang kemajuan di atas gambar */}
            {isStory && (
              <span className="absolute left-2 right-2 top-2 flex gap-1">
                {berkas.length > 1 ? (
                  berkas.map((_, i) => (
                    <span
                      key={i}
                      className={`h-0.5 flex-1 rounded-full ${i <= urut ? 'bg-white' : 'bg-white/35'}`}
                    />
                  ))
                ) : (
                  <span className="h-0.5 flex-1 rounded-full bg-white" />
                )}
              </span>
            )}

            {isStory && (
              <span className="absolute bottom-2 right-2 text-[9px] text-white/70">Tutup ✕</span>
            )}
          </div>

          {/* ===== deretan berkas carousel (titik) ===== */}
          {isCarousel && berkas.length > 1 && (
            <div className="flex justify-center gap-1 py-1.5">
              {berkas.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${i === urut ? 'bg-aksen' : 'bg-white/30'}`}
                />
              ))}
            </div>
          )}

          {/* ===== bilah aksi ===== */}
          {!isStory && (
            <div className="flex items-center gap-3.5 px-3 py-2 text-[15px] leading-none text-white">
              <span>♡</span>
              <span>💬</span>
              <span>✈</span>
              <span className="ml-auto">🔖</span>
            </div>
          )}

          {/* ===== suka & caption ===== */}
          {!isStory && (
            <div className="px-3 pb-3">
              <p className="text-[10px] font-semibold text-white">1.204 suka</p>
              <p className="mt-1 text-[10.5px] leading-snug text-white/90">
                <span className="font-semibold">{namaAkunTampil} </span>
                {captionAsli ? (
                  <>
                    <CaptionPendek teks={captionAsli} />
                    {captionAsli.length > 90 && (
                      <span className="text-white/45"> selengkapnya</span>
                    )}
                  </>
                ) : (
                  <span className="text-white/35">Belum ada caption.</span>
                )}
              </p>
              {isCarousel && (
                <p className="mt-1 text-[9px] text-white/40">
                  Berkas pertama menentukan potongan rasio semua gambar.
                </p>
              )}
            </div>
          )}

          {/* garis bawah navigasi HP */}
          <div className="mx-auto mb-1.5 h-1 w-24 rounded-full bg-white/35" />
        </div>
      </div>

      {/* ===== keterangan di luar bingkai ===== */}
      {catatan.length > 0 && (
        <ul className="mx-auto mt-3 max-w-[330px] space-y-1 text-[11px] leading-relaxed text-teks-3">
          {catatan.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Potongan caption pertama, seperti yang tampak sebelum ditekan "selengkapnya". */
function CaptionPendek({ teks }: { teks: string }) {
  const potong = teks.slice(0, 90);
  return <>{potong}</>;
}

/** Rasio dalam bentuk yang dibaca orang, mis. 4:5 atau 1.91:1. */
function formatRasio(r: number): string {
  const kandidat: [number, number, string][] = [
    [1, 1, '1:1'],
    [4, 5, '4:5'],
    [5, 4, '5:4'],
    [3, 2, '3:2'],
    [2, 3, '2:3'],
    [16, 9, '16:9'],
    [9, 16, '9:16'],
    [191, 100, '1.91:1'],
  ];
  for (const [w, h, label] of kandidat) {
    if (Math.abs(r - w / h) < 0.01) return label;
  }
  // rasio lain: bulatkan ke dua angka di belakang koma
  return `${r.toFixed(2)}:1`;
}

/** Satu huruf untuk lencana akun. */
function inisial(nama: string): string {
  const bersih = nama.replace(/^@/, '').trim();
  return (bersih[0] ?? 'k').toUpperCase();
}
