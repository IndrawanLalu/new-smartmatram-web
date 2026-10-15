import Image from "next/image";

/**
 * Banner kepala halaman. Bawaan = potongan sisi kanan banner SMART
 * (`public/banner-kepala.webp` 1581×246: langit, petugas di tiang, slogan "Energi
 * Untuk Negeri", dipotong dari formatexcel/baner.png 14 Okt 2026). Banner
 * UTUH (`public/banner-beranda.webp`) terlalu padat untuk kepala halaman —
 * tempatnya hero Beranda.
 *
 * Bidang gambar MENGIKUTI perbandingan fotonya (tinggi = tinggi kepala,
 * lebar dari rasio) — tidak dipotong. Dipotong `object-cover` di bidang
 * pendek-lebar, yang tersisa cuma langit (koreksi user 14 Okt 2026).
 * Potongannya melebar ke kiri sampai tepat sebelum tulisan judul banner asli,
 * lalu DISAMBUNG langit buatan (kolom tepi kiri foto dilebarkan + dihaluskan)
 * karena user minta jauh lebih lebar ("masih kurang banyak"). Tepi kiri memudar.
 */

const PUDAR = "linear-gradient(to right, transparent 0%, black 20%)";

export default function BannerJaringan({ gambar = "/banner-kepala.webp", rasio = 1581 / 246 }: { gambar?: string; rasio?: number }) {
  return (
    <div
      className="absolute top-0 right-0 h-full max-w-[65%] pointer-events-none select-none overflow-hidden hidden md:block"
      style={{ aspectRatio: rasio, maskImage: PUDAR, WebkitMaskImage: PUDAR }}
      aria-hidden
    >
      <Image src={gambar} alt="" fill sizes="880px" className="object-cover object-[right_40%]" priority />
    </div>
  );
}
