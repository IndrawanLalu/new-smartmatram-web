module.exports = {
  apps: [
    {
      name: "smart-mataram",
      script: "node_modules/.bin/next",
      args: "start",
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
        // Pakai Chrome bundled Puppeteer (bukan snap), tapi cegah auto-download versi baru
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: "true",
      },
    },
  ],
};
