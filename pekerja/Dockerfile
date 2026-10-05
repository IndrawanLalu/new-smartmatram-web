# ===== SMART-Mataram — pekerja (realtime temuan + penjadwal) =====
# Tanpa Chromium, tanpa sesi WA: hanya memicu web. Lihat pekerja/index.mjs.
FROM node:22-alpine
WORKDIR /app
COPY pekerja/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY pekerja/index.mjs ./
CMD ["node", "index.mjs"]
