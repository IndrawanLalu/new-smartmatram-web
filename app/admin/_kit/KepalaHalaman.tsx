import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import BannerJaringan from "./BannerJaringan";

/**
 * Kepala halaman (rencana-ui-baru.md §2B): ikon, judul, satu kalimat
 * keterangan, banner di kanan — dan TAB HALAMAN di dalamnya (`bawah`), satu
 * bagian dengan banner seperti mockup (koreksi user 14 Okt 2026). Judul TIDAK
 * diulang di topbar.
 */

interface Props {
  ikon: LucideIcon;
  judul: string;
  keterangan: string;
  /** Tombol di kanan judul (opsional). */
  aksi?: ReactNode;
  /** Baris di bawah judul, masih di dalam bagian banner — tab di kiri,
   *  saringan di kanan, SATU baris (turun sendiri di layar sempit). Kepala
   *  ±125 px (koreksi user 14 Okt 2026: tiga baris bertumpuk terlalu tinggi). */
  bawah?: ReactNode;
  banner?: boolean;
}

export default function KepalaHalaman({ ikon: Ikon, judul, keterangan, aksi, bawah, banner = true }: Props) {
  return (
    <header className="relative overflow-hidden bg-white border-b border-line">
      {banner && <BannerJaringan />}
      <div className="relative px-6 pt-4 pb-3.5 space-y-3">
        <div className="flex items-center gap-3.5">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-50 text-brand-600 shrink-0">
            <Ikon size={21} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-extrabold tracking-tight text-ink leading-tight">{judul}</h1>
            <p className="text-[13px] text-ink-soft mt-0.5">{keterangan}</p>
          </div>
          {aksi && <div className="ml-auto flex items-center gap-2">{aksi}</div>}
        </div>
        {bawah}
      </div>
    </header>
  );
}
