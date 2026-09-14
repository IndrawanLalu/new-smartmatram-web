# ===== SMART-Mataram — WhatsApp Bot (whatsapp-web.js + Chromium) =====
# Context build = root repo (lihat docker-compose.yml), karena index.js
# memakai dataPath "./wa-bot/session" (CWD = /app).
FROM node:20-bookworm-slim

# Chromium untuk Puppeteer. index.js hardcode executablePath
# "/usr/bin/google-chrome-stable" → symlink ke chromium bawaan Debian (lebih ramping).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
    && ln -sf /usr/bin/chromium /usr/bin/google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Jangan download Chromium terpisah saat npm install (pakai yang dari apt)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app
COPY wa-bot/package.json ./wa-bot/package.json
RUN cd wa-bot && npm install --omit=dev

COPY wa-bot ./wa-bot

EXPOSE 3001
# CWD = /app → dataPath ./wa-bot/session valid (di-mount sebagai volume)
CMD ["node", "wa-bot/index.js"]
