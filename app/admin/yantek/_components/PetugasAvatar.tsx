"use client";

import Image from "next/image";
import { FOTO_PETUGAS } from "../_lib/juara";

/**
 * Foto petugas — sementara masih mockup.
 *
 * Selama `FOTO_PETUGAS` kosong, yang tampil adalah inisial di atas gradasi
 * yang ditentukan dari nama. Sengaja deterministik: orang yang sama selalu
 * mendapat warna yang sama di podium, kartu kategori, maupun tabel, sehingga
 * mata bisa mengenalinya tanpa membaca nama. Begitu foto asli tersedia,
 * komponen ini yang menampilkannya tanpa perlu ada perubahan di pemanggil.
 */

/** Pasangan gradasi bertinta navy/teal — satu keluarga dengan tema aplikasi,
 *  cukup berbeda satu sama lain untuk dibedakan sekilas. */
const GRADASI: [string, string][] = [
  ["#1d3573", "#3f63b8"],
  ["#00695c", "#1fae9c"],
  ["#3b3f8f", "#6d74d4"],
  ["#0f5f78", "#31a7c4"],
  ["#4a3570", "#8a63c4"],
  ["#155e75", "#2d9fbf"],
  ["#1f4d3a", "#3f9d6f"],
  ["#5a3a5e", "#a069ae"],
];

function kodeNama(nama: string): number {
  let h = 0;
  for (let i = 0; i < nama.length; i++) h = (h * 31 + nama.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function inisial(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "?";
  if (kata.length === 1) return kata[0].slice(0, 2).toUpperCase();
  return (kata[0][0] + kata[kata.length - 1][0]).toUpperCase();
}

interface PetugasAvatarProps {
  nama: string;
  /** Sisi kotak dalam piksel. */
  ukuran: number;
  /** Warna cincin medali; tanpa ini cincinnya putih tipis. */
  cincin?: string;
  /** Tebal cincin, default menyesuaikan ukuran. */
  tebalCincin?: number;
  className?: string;
}

export default function PetugasAvatar({
  nama,
  ukuran,
  cincin,
  tebalCincin,
  className = "",
}: PetugasAvatarProps) {
  const foto = FOTO_PETUGAS[nama];
  const [a, b] = GRADASI[kodeNama(nama) % GRADASI.length];
  const tebal = tebalCincin ?? Math.max(2, Math.round(ukuran / 22));

  return (
    <div
      className={`relative rounded-full shrink-0 overflow-hidden grid place-items-center ${className}`}
      style={{
        width: ukuran,
        height: ukuran,
        background: foto ? undefined : `linear-gradient(135deg, ${a}, ${b})`,
        boxShadow: `inset 0 0 0 ${tebal}px ${cincin ?? "rgba(255,255,255,0.55)"}`,
      }}
      title={nama}
    >
      {foto ? (
        <Image src={foto} alt={nama} width={ukuran} height={ukuran} className="object-cover" />
      ) : (
        <span
          className="font-display font-bold text-white select-none leading-none"
          style={{ fontSize: Math.round(ukuran * 0.36) }}
        >
          {inisial(nama)}
        </span>
      )}
    </div>
  );
}
