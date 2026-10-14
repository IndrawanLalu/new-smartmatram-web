"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, Tags, Workflow } from "lucide-react";
import TombolAtas, { GAYA_PADAM, TOMBOL_ATAS } from "./TombolAtas";

/**
 * Bilah alat selama Mode SLD menyala. Alat sunting (geser, koreksi,
 * persetujuan) tidak ada di sini — Mode SLD untuk melihat dan simulasi.
 */

interface Props {
  onKeluar: () => void;
  label: boolean;
  onLabel: () => void;
  memuatUlang: boolean;
  onMuatUlang: () => void;
}

export default function BilahAtasSld({ onKeluar, label, onLabel, memuatUlang, onMuatUlang }: Props) {
  return (
    <div className="absolute z-[1000] top-3 right-3 flex items-center gap-2">
      <TombolAtas ikon={<Workflow size={15} />} aktif nada="mint" onClick={onKeluar} title="Kembali ke peta jaringan lengkap">
        Mode SLD
      </TombolAtas>
      <span className="w-px h-6 bg-white/15" aria-hidden />
      <TombolAtas ikon={<Tags size={15} />} aktif={label} onClick={onLabel} title="Tulis kode pangkal, keypoint, dan gardu di peta">
        Label
      </TombolAtas>
      <TombolAtas
        ikon={<RefreshCw size={15} className={memuatUlang ? "animate-spin" : ""} />}
        disabled={memuatUlang}
        onClick={onMuatUlang}
        title="Susun ulang SLD dari data tiang terbaru"
      >
        Muat ulang
      </TombolAtas>
      <Link href="/admin/dashboard" className={TOMBOL_ATAS} style={GAYA_PADAM}>
        <ArrowLeft size={15} /> Kembali
      </Link>
    </div>
  );
}
