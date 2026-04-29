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
        AGENT_SECRET: "2e2ada43fd8789ae42764e73d8e34e0730cceb3e00ce9b15d17502286aacab30",
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
