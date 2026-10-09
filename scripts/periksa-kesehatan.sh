#!/usr/bin/env bash
#
# PEMERIKSA KESEHATAN sosmed244 — dijalankan berkala oleh cron Hermes.
#
# Keluaran HANYA saat ada masalah (pola watchdog): kalau semua sehat, tidak ada
# yang dicetak dan tidak ada pesan yang dikirim. Jadi kamu tidak dibanjiri kabar
# "semua baik" tiap beberapa jam.
#
# Yang diperiksa:
#   1. Token Instagram masih ADA di database (bukan kedaluwarsa & bukan kosong)
#   2. Token masih DITERIMA Meta (debug_token) — bukan hanya ada di DB
#   3. Penjadwal luar masih mengetuk endpoint (dilihat dari jejak terakhir)
#   4. Tidak ada konten terjadwal yang menggantung terlalu lama
#
# Pemakaian: ./scripts/periksa-kesehatan.sh
# Keluaran : ringkasan masalah; kosong = sehat.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# Muat kredensial database (dibutuhkan skrip tsx).
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

OUT="$(pnpm exec tsx scripts/pemeriksa.ts 2>&1)"
KODE=$?

# Buang peringatan driver pg yang selalu muncul dan bukan masalah.
OUT="$(printf '%s\n' "$OUT" | grep -v 'SSL mode\|libpq\|postgresql.org\|To prepare for this change\|If you want the current behavior\|See https\|trace-warnings\|^$\|Use `node')"

if [ "$KODE" -eq 0 ] && [ -z "$OUT" ]; then
  # Sehat → diam. Tidak ada keluaran berarti tidak ada pesan terkirim.
  exit 0
fi

printf '⚠️ *sosmed244 — perlu perhatian*\n\n%s\n' "$OUT"
printf '\n_Diperiksa: %s_\n' "$(date '+%d %b %Y %H:%M')"
