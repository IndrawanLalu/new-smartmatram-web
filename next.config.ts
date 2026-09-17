import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker: bundel mandiri (server.js + node_modules minimal) untuk image ramping.
  // WAJIB ada — Dockerfile menyalin `.next/standalone`, dan tanpa baris ini
  // folder itu tidak pernah dibuat: build-nya gagal di langkah COPY, bukan di
  // langkah build, jadi pesannya menyesatkan.
  output: "standalone",

  // `/admin/peta` disajikan oleh route `/peta`.
  //
  // Alasannya bukan selera: layout `app/admin/layout.tsx` memasang sidebar dan
  // topbar untuk SEMUA anaknya, dan di App Router sebuah halaman tidak bisa
  // melepas layout induknya. Peta ini justru dibuat tanpa keduanya. Satu-satunya
  // cara menaruh berkasnya di bawah app/admin adalah memindahkan seluruh pohon
  // admin ke route group — puluhan berkas dan setiap impor `@/app/admin/...`
  // ikut berubah, demi URL saja.
  //
  // Penulisan ulang ini memberi URL yang diharapkan tanpa pembongkaran itu.
  // Yang dilihat peramban tetap /admin/peta, jadi tautan sidebar dan riwayat
  // browser konsisten dengan halaman admin lainnya.
  async rewrites() {
    return [{ source: "/admin/peta", destination: "/peta" }];
  },
};

export default nextConfig;
