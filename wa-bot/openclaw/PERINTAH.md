# OpenClaw — Perintah Penting

## Gateway (Service Utama)
```bash
openclaw gateway start       # Jalankan gateway
openclaw gateway stop        # Matikan gateway
openclaw gateway restart     # Restart gateway
openclaw gateway status      # Cek status + koneksi WA
```

## Dashboard (Akses dari Komputer Lokal)
```bash
# 1. Di terminal lokal — buat SSH tunnel
ssh -N -L 18789:127.0.0.1:18789 root@157.245.146.30

# 2. Buka browser
http://localhost:18789/

# 3. Ambil token jika diminta
openclaw dashboard   # (jalankan di VPS)
```

## WhatsApp
```bash
openclaw channels login --channel whatsapp   # Connect nomor WA baru (scan QR)
openclaw channels status                      # Cek status koneksi WA
```

## Model & Config
```bash
openclaw models list --provider google        # Daftar model Gemini tersedia
openclaw gateway status                       # Termasuk info model aktif
cat ~/.openclaw/openclaw.json                 # Lihat config lengkap
nano ~/.openclaw/openclaw.json                # Edit config
```

## Skills
```bash
# Lokasi skill Smart Mataram
~/.openclaw/workspace/skills/smart-mataram/SKILL.md

# Edit skill
nano ~/.openclaw/workspace/skills/smart-mataram/SKILL.md

# Setelah edit skill — restart gateway
openclaw gateway restart
```

## Bootstrap & Workspace
```bash
# Lokasi file penting
~/.openclaw/workspace/BOOTSTRAP.md           # Instruksi inisialisasi agent
~/.openclaw/workspace/skills/                # Folder semua skill
~/.openclaw/agents/main/sessions/            # History sesi

# Edit bootstrap
nano ~/.openclaw/workspace/BOOTSTRAP.md
```

## Troubleshooting
```bash
# Lihat log error
cat /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# Lihat log systemd
journalctl --user -u openclaw-gateway.service -n 50 --no-pager

# Cek RAM
free -h

# Cek proses yang jalan
ps aux | grep -i "openclaw\|node" | grep -v grep

# Force kill semua proses openclaw
pkill -f openclaw
```

## Update API Key Gemini
```bash
openclaw onboard \
  --non-interactive \
  --accept-risk \
  --mode local \
  --auth-choice gemini-api-key \
  --gemini-api-key "API_KEY_DISINI"
```

## PM2 (Next.js + wa-bot)
```bash
pm2 status                                    # Cek semua service
pm2 reload ecosystem.config.js               # Reload semua (zero downtime)
pm2 reload ecosystem.config.js --only smart-mataram  # Reload Next.js saja
pm2 restart wa-bot                           # Restart WA bot lama
pm2 logs smart-mataram --lines 50            # Log Next.js
pm2 logs wa-bot --lines 50                   # Log WA bot
```

## Deploy Update Kode
```bash
# Di komputer lokal
git add -A && git commit -m "pesan" && git push

# Di VPS
cd /var/www/smart-mataram
git pull
pnpm build
pm2 reload ecosystem.config.js --only smart-mataram
```

## Env Vars OpenClaw (idcloudhost VPS — system service)
```bash
# OpenClaw di idcloudhost adalah system service (bukan user service)
# Edit env vars:
sudo nano /etc/systemd/system/openclaw.service.d/override.conf

# Isi format:
# [Service]
# Environment="SMART_MATARAM_URL=http://157.245.146.30:3000"
# Environment="AGENT_SECRET=smartmataram2026"

# Setelah edit
sudo systemctl daemon-reload
sudo systemctl restart openclaw.service
```

## Info VPS
- **DO VPS** (Next.js + wa-bot): `root@157.245.146.30`, PM2, `/var/www/smart-mataram`
- **idcloudhost VPS** (OpenClaw): `indrawansaputra@103.59.95.107`, systemd
- **AGENT_SECRET**: `smartmataram2026`
- **Model aktif**: `google/gemini-2.5-flash`
- **Config OpenClaw**: `/opt/openclaw/.openclaw/openclaw.json` (owner: uid 999)
- **Skill**: `/opt/openclaw/.openclaw/workspace/skills/smart-mataram/SKILL.md`
- **Bootstrap**: `/opt/openclaw/.openclaw/workspace/BOOTSTRAP.md`

## Model yang Tersedia (Gemini Free Tier)
- `google/gemini-2.5-flash` ← Aktif sekarang
- `google/gemini-1.5-flash` ← Fallback jika 2.5 tidak tersedia
- `google/gemini-2.0-flash-lite` ← Paling ringan
