"use client";

/**
 * Kotak centang yang MEMBAWA warna lapisannya.
 *
 * Diambil dari pola `/admin/peta-gardu`, dan alasannya bukan kerapian semata:
 * kalau centang mewarisi warna benda yang dinyalakannya, panel kiri berhenti
 * jadi sekadar daftar dan mulai jadi legenda. Tidak ada lagi yang perlu
 * menghafal garis biru itu JTM sementara teal itu JTR.
 *
 * Kotak asli disembunyikan (`sr-only`), bukan dihapus — pembaca layar dan
 * navigasi papan tik tetap menemukannya.
 */

interface Props {
  nyala: boolean;
  onAlih: () => void;
  warna: string;
  ukuran?: number;
  label?: string;
}

export default function Centang({ nyala, onAlih, warna, ukuran = 14, label }: Props) {
  return (
    <span className="inline-flex shrink-0">
      <input
        type="checkbox"
        checked={nyala}
        onChange={onAlih}
        className="sr-only peer"
        aria-label={label}
      />
      <span
        onClick={onAlih}
        style={{ width: ukuran, height: ukuran, backgroundColor: nyala ? warna : undefined }}
        className={`rounded grid place-items-center border cursor-pointer transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-white/60 ${
          nyala ? "border-transparent" : "border-[#1e3552] bg-[#0d1b2a] hover:border-[#2d4a73]"
        }`}
      >
        {nyala && (
          <svg width={ukuran - 4} height={ukuran - 4} viewBox="0 0 10 10" aria-hidden>
            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </span>
  );
}
