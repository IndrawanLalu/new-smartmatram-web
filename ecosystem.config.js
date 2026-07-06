module.exports = {
  apps: [
    {
      name: "smart-mataram",
      script: "node",
      args: "node_modules/next/dist/bin/next start",
      cwd: "/var/www/smart-mataram",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        AGENT_SECRET: "smartmataram2026",
      },
    },
    {
      name: "wa-bot",
      script: "wa-bot/index.js",
      cwd: "/var/www/smart-mataram",
      instances: 1,
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: "true",
        SMART_MATARAM_URL: "http://localhost:3000",
        AGENT_SECRET: "smartmataram2026",
        WA_ALLOWED_GROUPS: "120363420657048053@g.us",
        WA_ALLOWED_DMS: "6287761506513",
        // Notif urgent REALTIME via Supabase Realtime (anti-putus, pengganti webhook).
        // Kredensial Supabase dibaca dari .env.local — JANGAN taruh service key di sini.
        // Cutover: set "true" DAN nonaktifkan webhook Supabase. Lihat wa-bot/REALTIME-NOTIF.md
        // AKTIF sejak Jul 2026 — webhook Supabase "wa-notify-jaringan"/"wa-notify-pohon" sudah di-DISABLE.
        WA_REALTIME_ENABLED: "true",
      },
    },
  ],
};
