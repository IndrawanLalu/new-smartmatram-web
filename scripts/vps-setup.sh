#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# SMART MATARAM — VPS Setup Script
# Jalankan sekali saat pertama kali setup VPS
# OS: Ubuntu 22.04 LTS
#
# Cara pakai:
#   chmod +x scripts/vps-setup.sh
#   ./scripts/vps-setup.sh
# ══════════════════════════════════════════════════════════════════════════════

set -e

REPO_URL="https://github.com/USERNAME/smart-mataram-next.git"   # ← Ganti!
DOMAIN="smartmataram.yourdomain.com"                             # ← Ganti!
APP_DIR="/var/www/smart-mataram"

echo "════════════════════════════════════════"
echo "  SMART MATARAM — VPS Setup"
echo "════════════════════════════════════════"

# ── 1. Update sistem ──────────────────────────────────────────────────────────
echo ""
echo "[1/8] Update sistem..."
sudo apt-get update -y && sudo apt-get upgrade -y

# ── 2. Install Node.js 20 ─────────────────────────────────────────────────────
echo ""
echo "[2/8] Install Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# ── 3. Install tools ──────────────────────────────────────────────────────────
echo ""
echo "[3/8] Install pnpm, pm2, nginx..."
sudo npm install -g pnpm pm2
sudo apt-get install -y nginx git

# ── 4. Install Chromium untuk whatsapp-web.js ─────────────────────────────────
echo ""
echo "[4/8] Install Chromium (untuk WA Bot)..."
sudo apt-get install -y \
  chromium-browser \
  libgbm-dev \
  libxkbcommon-dev \
  libxss1 \
  libasound2 \
  fonts-liberation

# ── 5. Clone repository ───────────────────────────────────────────────────────
echo ""
echo "[5/8] Clone repository..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR
git clone $REPO_URL $APP_DIR
cd $APP_DIR

# ── 6. Setup environment ──────────────────────────────────────────────────────
echo ""
echo "[6/8] Setup .env..."
cat > $APP_DIR/.env.local << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://XXXXXXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=XXXXXXXX
SUPABASE_SERVICE_ROLE_KEY=XXXXXXXX

# Google Sheets
GOOGLE_SHEETS_API_KEY=XXXXXXXX

# Telegram (Morning Brief)
TELEGRAM_BOT_TOKEN=XXXXXXXX
TELEGRAM_CHAT_ID=XXXXXXXX
CRON_SECRET=XXXXXXXX

# WhatsApp Bot
WA_BOT_URL=http://127.0.0.1:3001
WA_GROUP_ID=                        # ← Isi setelah scan QR dan cek /groups
EOF
echo "⚠️  Edit $APP_DIR/.env.local dan isi semua nilai yang dibutuhkan!"

# ── 7. Install dependencies & build ───────────────────────────────────────────
echo ""
echo "[7/8] Install dependencies & build..."
cd $APP_DIR
pnpm install --frozen-lockfile
pnpm build

# Install WA bot dependencies
cd $APP_DIR/wa-bot
npm install
cd $APP_DIR

# ── 8. Setup Nginx ────────────────────────────────────────────────────────────
echo ""
echo "[8/8] Setup Nginx..."
sudo cp $APP_DIR/scripts/nginx-smart-mataram.conf /etc/nginx/sites-available/smart-mataram
# Ganti placeholder domain
sudo sed -i "s/DOMAIN_ANDA.com/$DOMAIN/g" /etc/nginx/sites-available/smart-mataram
sudo ln -sf /etc/nginx/sites-available/smart-mataram /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# ── PM2 ───────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 Menjalankan aplikasi dengan PM2..."
cd $APP_DIR

# Start Next.js saja dulu (WA bot perlu scan QR manual)
pm2 start ecosystem.config.js --only smart-mataram
pm2 save

# Setup PM2 auto-start saat VPS reboot
pm2 startup | tail -1 | sudo bash

echo ""
echo "════════════════════════════════════════"
echo "  ✅ Setup selesai!"
echo "════════════════════════════════════════"
echo ""
echo "Langkah selanjutnya:"
echo "  1. Edit .env.local dan isi semua env vars"
echo "  2. Install SSL: sudo certbot --nginx -d $DOMAIN"
echo "  3. Start WA bot dan scan QR:"
echo "       pm2 start ecosystem.config.js --only wa-bot"
echo "       pm2 logs wa-bot"
echo "  4. Cari group ID: curl http://localhost:3001/groups"
echo "  5. Isi WA_GROUP_ID di .env.local"
echo "  6. Rebuild: pnpm build && pm2 restart smart-mataram"
echo ""
echo "  Tambahkan GitHub Secrets:"
echo "    VPS_HOST  = IP VPS"
echo "    VPS_USER  = nama user (misal: ubuntu)"
echo "    VPS_SSH_KEY = isi private key SSH"
echo ""
