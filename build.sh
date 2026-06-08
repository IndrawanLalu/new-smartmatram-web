#!/bin/bash
set -e

echo "🛑 Stop PM2 smart-mataram..."
pm2 stop smart-mataram 2>/dev/null || echo "  (smart-mataram belum jalan)"

echo "📥 Git pull..."
git pull origin main

echo "🔒 Kill proses next build yang mungkin masih jalan..."
pkill -f "next build" 2>/dev/null; sleep 1; true
rm -f .next/lock

echo "📦 Install dependencies..."
pnpm install --frozen-lockfile

echo "🏗️  Build..."
pnpm build

echo "🚀 Start PM2 smart-mataram..."
pm2 start smart-mataram 2>/dev/null || pm2 start npm --name smart-mataram -- start
pm2 save

echo "✅ Deploy selesai!"
pm2 status
