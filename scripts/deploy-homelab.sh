#!/usr/bin/env bash
# =============================================================================
# Deploy SMART di homelab — tarik origin/main, build ulang service, periksa.
# =============================================================================
# Jalankan di homelab (masuk dari PowerShell: `ssh smart-mataram`):
#
#   cd /mnt/d/PROJECT/testhosting/new-smartmatram-web
#   git -c safe.directory='*' fetch -q origin && \
#     git -c safe.directory='*' show origin/main:scripts/deploy-homelab.sh | bash -s -- web pekerja
#
# Dibaca langsung dari origin/main (`git show … | bash`), jadi selalu versi
# terbaru dan tidak terganggu akhir baris CRLF di folder /mnt/d.
# Tanpa argumen = web pekerja. Contoh lain: `… | bash -s -- web`.
#
# Langkah:
#   1. Tolak kalau ada perubahan lokal SELAIN jalur gateway di docker-compose.yml
#      (supaya `reset --hard` tidak membuang suntingan yang belum di-push).
#   2. reset --hard origin/main, lalu pasang lagi jalur gateway homelab.
#   3. docker compose up -d --build <service>.
#   4. Tunggu web menjawab di :3100; untuk pekerja, tunggu realtime SUBSCRIBED.
# =============================================================================
set -euo pipefail

DIR=/mnt/d/PROJECT/testhosting/new-smartmatram-web
GATEWAY=/home/indrawan/wa-api-gateway
[ $# -eq 0 ] && set -- web pekerja

G() { git -c safe.directory='*' -c core.filemode=false "$@"; }
langkah() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
gagal() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

cd "$DIR"

langkah "Ambil origin/main"
G fetch -q origin
SEKARANG=$(G rev-parse --short HEAD)
TARGET=$(G rev-parse --short origin/main)
echo "Terpasang: $SEKARANG  →  akan dipasang: $TARGET"
if [ "$SEKARANG" != "$TARGET" ]; then
  echo "Commit baru:"
  G log --oneline "HEAD..origin/main" | sed 's/^/  /'
fi

langkah "Periksa perubahan lokal"
# Abaikan beda akhir baris (CRLF) dan jalur gateway di docker-compose.yml.
LAIN=$(G diff --ignore-cr-at-eol --name-only | grep -v '^docker-compose.yml$' || true)
if [ -n "$LAIN" ]; then
  echo "$LAIN" | sed 's/^/  /'
  gagal "Ada berkas yang diubah langsung di homelab (di atas). Simpan/pindahkan dulu, baru jalankan lagi."
fi
echo "Bersih (selain jalur gateway)."

langkah "Pasang kode $TARGET"
G reset -q --hard origin/main
sed -i "s#\.\./wa-api-gateway#${GATEWAY}#g" docker-compose.yml 2>/dev/null || true
grep -q "$GATEWAY" docker-compose.yml || gagal "Jalur gateway tidak terpasang di docker-compose.yml"

langkah "Build & jalankan: $*"
docker compose up -d --build "$@"

for s in "$@"; do
  case "$s" in
    web)
      langkah "Tunggu web menjawab (http://localhost:3100/login)"
      for i in $(seq 1 60); do
        KODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/login || true)
        [ "$KODE" = "200" ] && { echo "Web siap (HTTP 200)."; break; }
        [ "$i" = 60 ] && gagal "Web belum menjawab sesudah 2 menit (terakhir HTTP $KODE). Lihat: docker logs --tail 50 smart-mataram-web"
        sleep 2
      done
      ;;
    pekerja)
      langkah "Tunggu pekerja tersambung realtime"
      for i in $(seq 1 30); do
        if [ "$(docker logs --since 2m smart-mataram-pekerja 2>&1 | grep -c 'SUBSCRIBED')" -ge 2 ]; then
          docker logs --since 2m smart-mataram-pekerja 2>&1 | grep -E 'pekerja jalan|SUBSCRIBED' | tail -3 | sed 's/^/  /'
          break
        fi
        [ "$i" = 30 ] && gagal "Pekerja belum SUBSCRIBED sesudah 1 menit. Lihat: docker logs --tail 50 smart-mataram-pekerja"
        sleep 2
      done
      ;;
  esac
done

langkah "Selesai — $TARGET terpasang"
docker compose ps "$@"
