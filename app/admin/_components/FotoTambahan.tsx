"use client";

import { fotoKecil } from "@/lib/fotoKecil";

/**
 * Deretan foto tambahan di samping foto utama (temuan JTM/JTR, bukti
 * Pemeliharaan Jaringan). Klik = buka ukuran penuh di tab baru — sama dengan
 * foto utamanya di modal-modal itu.
 */
export default function FotoTambahan({ foto, alt }: { foto: string[]; alt: string }) {
  if (foto.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {foto.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" title={`Foto ${i + 2}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage, ukuran tak tentu */}
          <img
            src={fotoKecil(u, 128)}
            alt={`${alt} (${i + 2})`}
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            className="w-16 h-16 object-cover rounded-lg border border-line hover:opacity-80"
          />
        </a>
      ))}
    </div>
  );
}
