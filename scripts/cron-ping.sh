#!/usr/bin/env bash
#
# Memanggil endpoint cron produksi sosmed244 dari server ini.
#
# Dipakai kalau Vercel Cron (paket Hobby) hanya boleh berjalan sekali sehari
# sementara konten perlu dikirim lebih cepat. Endpoint-nya sendiri adalah HTTP
# biasa — penjadwalnya yang dibatasi, bukan endpoint-nya.
#
# RAHASIA: dibaca dari ~/.sosmed-cron.env (chmod 600, TIDAK ikut ke git).
# Isi berkas itu satu baris:
#   CRON_SECRET="<nilai CRON_SECRET dari Vercel>"
#
# Pemakaian:
#   ./scripts/cron-ping.sh              # jalankan sekali
#   ./scripts/cron-ping.sh --rahasia    # hanya pakai rahasia dari Vercel CLI
#   ./scripts/cron-ping.sh --cek        # cek endpoint tanpa rahasia (harus 401)

set -uo pipefail

URL="${SOSMED_CRON_URL:-https://sosmed244.vercel.app/api/cron/jadwal}"
BERKAS_RAHASIA="${HOME}/.sosmed-cron.env"
CATATAN="${HOME}/.sosmed-cron.log"

# --- mode --cek: memastikan endpoint hidup tanpa mengirim rahasia ---
if [[ "${1:-}" == "--cek" ]]; then
  kode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$URL")
  echo "tanpa rahasia -> HTTP $kode"
  case "$kode" in
    401) echo "BENAR: endpoint hidup dan menolak permintaan tanpa rahasia." ;;
    503) echo "PERHATIAN: CRON_SECRET belum diisi di server (endpoint menolak SEMUA permintaan)." ;;
    404) echo "SALAH: rute tidak ada — kode belum ter-deploy." ;;
    200) echo "BAHAYA: endpoint menerima permintaan TANPA rahasia. Segera periksa!" ;;
    *)   echo "Tak terduga. Periksa koneksi/deployment." ;;
  esac
  exit 0
fi

# --- ambil rahasia ---
RAHASIA=""
if [[ -f "$BERKAS_RAHASIA" ]]; then
  # shellcheck disable=SC1090
  source "$BERKAS_RAHASIA"
  RAHASIA="${CRON_SECRET:-}"
fi

if [[ -z "$RAHASIA" && "${1:-}" == "--rahasia" ]]; then
  # Ambil dari Vercel CLI tanpa menampilkannya. `vercel env pull` menulis file
  # yang memuat CRON_SECRET; kita baca sekali lalu hapus.
  TMP="$(mktemp)"
  if (cd "$(dirname "$0")/.." && vercel env pull "$TMP" --environment=production --yes >/dev/null 2>&1); then
    RAHASIA=$(grep '^CRON_SECRET=' "$TMP" | head -1 | cut -d= -f2- | tr -d '"')
  fi
  rm -f "$TMP"
  if [[ -z "$RAHASIA" ]]; then
    echo "GAGAL: CRON_SECRET tidak bisa dibaca dari Vercel (nilainya bersifat SENSITIVE)."
    echo "Buat $BERKAS_RAHASIA secara manual — lihat komentar di atas."
    exit 2
  fi
fi

if [[ -z "$RAHASIA" ]]; then
  echo "GAGAL: rahasia belum ada. Buat $BERKAS_RAHASIA (chmod 600) berisi:"
  echo '  CRON_SECRET="<nilai dari Vercel → Settings → Environment Variables>"'
  exit 2
fi

# --- panggil endpoint ---
BADAN="$(mktemp)"
kode=$(curl -s -o "$BADAN" -w '%{http_code}' --max-time 60 \
  -H "Authorization: Bearer ${RAHASIA}" "$URL")
waktu="$(date '+%Y-%m-%d %H:%M:%S %Z')"

# --- catat ke log (tanpa rahasia) ---
{
  echo "[$waktu] HTTP $kode"
  if [[ "$kode" != "200" ]]; then
    head -c 500 "$BADAN"
    echo
  fi
} >> "$CATATAN"

# --- rapikan log supaya tidak tumbuh tanpa batas (sisakan 500 baris) ---
if [[ -f "$CATATAN" ]] && (( $(wc -l < "$CATATAN") > 1000 )); then
  tail -500 "$CATATAN" > "$CATATAN.tmp" && mv "$CATATAN.tmp" "$CATATAN"
fi

if [[ "$kode" == "200" ]]; then
  # Ringkas: berapa konten diproses dan hasil pembaruan token.
  echo "[$waktu] OK — $BADAN"
  rm -f "$BADAN"
  exit 0
fi

echo "[$waktu] GAGAL HTTP $kode"
cat "$BADAN"
rm -f "$BADAN"
exit 1
