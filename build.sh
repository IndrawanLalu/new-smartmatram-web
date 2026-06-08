#!/bin/bash
set -e

echo "🛑 Stop PM2 smart-mataram..."
pm2 stop smart-mataram 2>/dev/null || echo "  (smart-mataram belum jalan)"

echo "📥 Git pull..."
git pull origin main

echo "🔒 Kill semua proses next yang mungkin masih jalan..."
pkill -f "next" 2>/dev/null; sleep 2; true
rm -f .next/lock
# Paksa hapus lock jika masih ada
[ -f .next/lock ] && rm -f .next/lock && echo "  lock dihapus paksa"

echo "📦 Install dependencies..."
pnpm install --frozen-lockfile

echo "🏗️  Build..."
pnpm build

echo "🚀 Start PM2 smart-mataram..."
pm2 start smart-mataram 2>/dev/null || pm2 start npm --name smart-mataram -- start
pm2 save

echo "✅ Deploy selesai!"
pm2 status
