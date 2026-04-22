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
      },
    },
    {
      name: "wa-bot",
      script: "wa-bot/index.js",
      cwd: "/var/www/smart-mataram",
      instances: 1,
      autorestart: true,
      watch: false,
      // Restart jika crash, tunggu 5 detik sebelum retry
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
