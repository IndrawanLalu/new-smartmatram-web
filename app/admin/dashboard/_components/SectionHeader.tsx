"use client";

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { DISPLAY } from "@/app/admin/_ui";

/**
 * Kepala seksi — sekaligus jangkar untuk tautan lompat di atas halaman.
 *
 * `scroll-mt-20` wajib: topbar admin melayang, jadi tanpa marjin gulir jangkar
 * mendarat tepat di bawahnya dan judul seksinya tertutup.
 */
export default function SectionHeader({
  id, icon: Icon, judul, keterangan, href, hrefLabel,
}: {
  id: string;
  icon: LucideIcon;
  judul: string;
  keterangan?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div id={id} className="scroll-mt-20 flex items-end justify-between gap-4 pt-1">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-navy-600 shrink-0" />
          <h2 className={`${DISPLAY} text-base font-bold text-ink`}>{judul}</h2>
        </div>
        {keterangan && (
          <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{keterangan}</p>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-500 transition-colors"
        >
          {hrefLabel ?? "Buka"}
          <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

/**
 * Kartu angka ringkas — dipakai seksi Gardu dan APKT.
 *
 * Warna peringatan hanya menyala saat angkanya benar-benar bukan nol; nol
 * berwarna merah cuma melatih mata untuk mengabaikan warna merah.
 */
export function StatRingkas({
  label, nilai, satuan, catatan, nada = "netral", href,
}: {
  label: string;
  nilai: string | number;
  satuan?: string;
  catatan?: string;
  nada?: "netral" | "kritis" | "waspada" | "aman";
  href?: string;
}) {
  const gaya = {
    netral: { tepi: "border-line", angka: "text-ink" },
    kritis: { tepi: "border-red-200", angka: "text-red-600" },
    waspada: { tepi: "border-amber-200", angka: "text-amber-600" },
    aman: { tepi: "border-emerald-200", angka: "text-emerald-700" },
  }[nada];

  const isi = (
    <>
      <p className="text-xs font-semibold text-ink-soft truncate">{label}</p>
      <p className={`${DISPLAY} text-2xl font-bold leading-none mt-1.5 ${gaya.angka}`}>
        {nilai}
        {satuan && <span className="text-xs font-semibold text-ink-muted ml-1">{satuan}</span>}
      </p>
      {catatan && <p className="text-[11px] text-ink-muted mt-1 truncate">{catatan}</p>}
    </>
  );

  const kelas = `bg-white rounded-xl border px-3 py-2.5 ${gaya.tepi}`;

  return href ? (
    <Link href={href} className={`${kelas} block hover:border-navy-300 transition-colors`}>
      {isi}
    </Link>
  ) : (
    <div className={kelas}>{isi}</div>
  );
}
