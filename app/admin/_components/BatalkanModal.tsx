"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { BTN_GHOST, CARD } from "@/app/admin/_ui";

/**
 * Membatalkan satu catatan yang keliru — tiang, inspeksi, atau pemeliharaan.
 *
 * "Batalkan", bukan "Hapus". Barisnya tetap ada, tidak ikut dihitung, dan
 * jejaknya tersimpan di `master_audit`. Alasannya BUKAN basa-basi: yang tidak
 * diterangkan akan dikira kesalahan sistem oleh orang yang membacanya enam
 * bulan lagi, bukan keputusan orang. Database sendiri menolak alasan kosong;
 * tombol di sini mati lebih dulu supaya petugas tahu sebelum menekannya.
 *
 * Bedanya dengan "Tolak" perlu disebut di tiap tempat yang memakainya, karena
 * keduanya tampak mirip padahal berlawanan:
 *
 *   Tolak       salah kerja → ULANGI
 *   Batalkan    salah objek / uji coba → JANGAN diulang
 */

interface Props {
  judul: string;
  /** Apa yang akan terjadi, dalam kalimat biasa. Muncul di atas kotak alasan. */
  keterangan: string;
  /** Peringatan tambahan — mis. penanda master yang tidak bisa dipulihkan. */
  peringatan?: string;
  labelTombol?: string;
  onTutup: () => void;
  onBatalkan: (alasan: string) => Promise<boolean>;
}

export default function BatalkanModal({
  judul,
  keterangan,
  peringatan,
  labelTombol = "Batalkan",
  onTutup,
  onBatalkan,
}: Props) {
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const kirim = async () => {
    setSibuk(true);
    const ok = await onBatalkan(alasan.trim());
    setSibuk(false);
    if (ok) onTutup();
    // Kalau gagal, modalnya sengaja dibiarkan terbuka: pesan penjaga dari
    // database muncul sebagai toast, dan alasannya tidak perlu diketik ulang.
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
      onClick={onTutup}
    >
      <div
        className={`${CARD} w-full max-w-lg p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <TriangleAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">{judul}</p>
            <p className="text-xs text-ink-soft mt-1">{keterangan}</p>
            {peringatan && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-2">
                {peringatan}
              </p>
            )}
          </div>
        </div>

        <textarea
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Alasan pembatalan — mis. salah gardu, data uji coba, tiang ganda"
          className="mt-4 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
        />

        <div className="mt-4 flex items-center gap-2">
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>
            Tutup
          </button>
          <button
            onClick={() => void kirim()}
            disabled={!alasan.trim() || sibuk}
            title={!alasan.trim() ? "Isi alasan dulu" : undefined}
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 transition-colors ml-auto"
          >
            {sibuk && <Loader2 size={15} className="animate-spin" />}
            {labelTombol}
          </button>
        </div>
      </div>
    </div>
  );
}
