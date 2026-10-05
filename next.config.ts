import type { NextConfig } from "next";

/** Host Supabase dari env (di-bake saat build, sama dengan klien). */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname || "*.supabase.co";
  } catch {
    return "*.supabase.co";
  }
})();

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

  // Gambar mini foto lapangan diperkecil server ini (`lib/fotoKecil.ts`), bukan
  // oleh Supabase — jatah Image Transformations Supabase Pro cuma 100 foto
  // sumber per bulan. Hanya berkas publik Storage proyek ini yang boleh lewat.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Next 16 menolak lebar & mutu yang tidak terdaftar. Bawaan imageSizes
    // ditambah lebar gambar mini kita (120, 160, 240); mutu 65 untuk mini.
    imageSizes: [32, 48, 64, 96, 120, 128, 160, 240, 256, 384],
    qualities: [65, 75],
  },
};

export default nextConfig;
