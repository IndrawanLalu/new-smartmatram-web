#!/bin/bash
set -e

echo "🛑 Stop PM2 smart-mataram..."
pm2 stop smart-mataram 2>/dev/null || echo "  (smart-mataram belum jalan)"

echo "📥 Git pull..."
git pull origin main

echo "🔒 Hapus lock build lama jika ada..."
if [ -f .next/lock ]; then
  LOCK_PID=$(cat .next/lock 2>/dev/null || true)
  if [ -n "$LOCK_PID" ]; then
    echo "  kill PID $LOCK_PID yang pegang lock..."
    kill -9 "$LOCK_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f .next/lock
  echo "  lock dihapus"
fi

echo "📦 Install dependencies..."
pnpm install --frozen-lockfile

echo "🏗️  Build..."
pnpm build

echo "🚀 Start PM2 smart-mataram..."
pm2 start smart-mataram 2>/dev/null || pm2 start npm --name smart-mataram -- start
pm2 save

echo "✅ Deploy selesai!"
pm2 status
