"use client";

/**
 * Bilah halaman untuk tabel panjang.
 *
 * Sebulan data APKT ≈ 900 baris Non CT × 14 kolom = belasan ribu sel. Merender
 * semuanya sekaligus membuat setiap ketikan di kotak cari terasa tersendat,
 * padahal yang terlihat di layar cuma selayar. Yang dipangkas di sini adalah
 * jumlah baris yang DIRENDER — datanya sendiri tetap lengkap di memori karena
 * tab Dashboard & Rekap menghitung rata-rata atas seluruh rentang.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginasiProps {
  /** Jumlah baris setelah filter — bukan jumlah baris di halaman ini. */
  total: number;
  halaman: number;
  perHalaman: number;
  onGanti: (halaman: number) => void;
  /** Kata untuk satuan barisnya, mis. "laporan" atau "koreksi". */
  satuan?: string;
}

export default function Paginasi({
  total,
  halaman,
  perHalaman,
  onGanti,
  satuan = "baris",
}: PaginasiProps) {
  if (total <= perHalaman) return null;

  const totalHalaman = Math.ceil(total / perHalaman);
  const awal = (halaman - 1) * perHalaman + 1;
  const akhir = Math.min(halaman * perHalaman, total);

  const tombol =
    "p-1.5 rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent transition-colors";

  return (
    <div className="px-4 py-2.5 border-t border-line flex items-center justify-between gap-3 text-xs text-ink-muted">
      <span className="tabular-nums">
        {awal}–{akhir} dari {total} {satuan} · halaman {halaman}/{totalHalaman}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onGanti(halaman - 1)}
          disabled={halaman <= 1}
          aria-label="Halaman sebelumnya"
          className={tombol}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => onGanti(halaman + 1)}
          disabled={halaman >= totalHalaman}
          aria-label="Halaman berikutnya"
          className={tombol}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
