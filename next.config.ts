import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker: bundel mandiri (server.js + node_modules minimal) untuk image ramping.
  // WAJIB ada — Dockerfile menyalin `.next/standalone`, dan tanpa baris ini
  // folder itu tidak pernah dibuat: build-nya gagal di langkah COPY, bukan di
  // langkah build, jadi pesannya menyesatkan.
  output: "standalone",
};

export default nextConfig;
