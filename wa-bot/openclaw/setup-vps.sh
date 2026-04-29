#!/bin/bash
# Setup OpenClaw di VPS untuk Smart Mataram
# Jalankan: bash setup-vps.sh

set -e

echo "=== 1. Install Node.js 24 ==="
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt-get install -y nodejs
node --version

echo "=== 2. Install OpenClaw ==="
curl -fsSL https://openclaw.ai/install.sh | bash

echo "=== 3. Setup daemon + pilih Gemini ==="
echo "Ikuti wizard: pilih Google Gemini, masukkan GEMINI_API_KEY"
openclaw onboard \
  --non-interactive \
  --mode local \
  --auth-choice gemini-api-key \
  --gemini-api-key "$GEMINI_API_KEY"

echo "=== 4. Copy config ==="
mkdir -p ~/.openclaw/workspace/skills/smart-mataram
cp openclaw.json ~/.openclaw/openclaw.json
cp skills/smart-mataram/SKILL.md ~/.openclaw/workspace/skills/smart-mataram/SKILL.md

echo "=== 5. Set env vars OpenClaw ==="
openclaw config set SMART_MATARAM_URL "$SMART_MATARAM_URL"
openclaw config set AGENT_SECRET "$AGENT_SECRET"

echo "=== 6. Cek model tersedia ==="
openclaw models list --provider google

echo "=== 7. Install sebagai daemon (systemd) ==="
openclaw gateway install-daemon

echo ""
echo "=== Langkah terakhir (manual) ==="
echo "1. Edit allowFrom di ~/.openclaw/openclaw.json — isi nomor HP admin"
echo "2. Jalankan: openclaw channels login --channel whatsapp"
echo "3. Scan QR code dengan HP nomor WA baru"
echo "4. Cek status: openclaw gateway status"
