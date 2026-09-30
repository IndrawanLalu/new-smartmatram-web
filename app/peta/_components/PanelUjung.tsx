"use client";

import { Loader2, X } from "lucide-react";
import {
  BATAS_KUNING, BATAS_MERAH, STATUS_UJUNG_PETA, WARNA_NADA,
  type NadaUjung, type SaringUjung, type StatusUjungPeta,
} from "../_hooks/useUjungPeta";
import { GARIS, INPUT, JUDUL_BAGIAN, PANEL } from "../_ui";

/**
 * Saringan lapisan tegangan ujung. Bulan = bulan tanggal ukur; ULP mengikuti
 * pilihan ULP di panel kiri.
 */

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const NADA: { k: NadaUjung; label: string }[] = [
  { k: "merah", label: `< ${BATAS_MERAH} V` },
  { k: "kuning", label: `${BATAS_MERAH}–${BATAS_KUNING - 1} V` },
  { k: "hijau", label: `≥ ${BATAS_KUNING} V` },
];
/** "Diukur jauh dari ujung terjauh" — ambang pilihan, meter. */
const AMBANG_JAUH = [50, 100, 200];

const CHIP = "px-2 py-1 rounded-lg text-[11px] border transition-colors";
const chip = (on: boolean) => `${CHIP} ${on ? "border-[#00897B] bg-[#00897B]/20 text-[#e2e8f0]" : "border-[#1e3552] text-gray-500"}`;

interface Props {
  tahun: number;
  bulan: number;
  onBulan: (tahun: number, bulan: number) => void;
  saring: SaringUjung;
  onSaring: (s: SaringUjung) => void;
  jumlah: number;
  total: number;
  sibuk: boolean;
  galat: string | null;
  onTutup: () => void;
}

export default function PanelUjung({ tahun, bulan, onBulan, saring, onSaring, jumlah, total, sibuk, galat, onTutup }: Props) {
  const alih = <T,>(s: Set<T>, v: T) => {
    const b = new Set(s);
    if (b.has(v)) b.delete(v);
    else b.add(v);
    return b;
  };

  return (
    <div className="w-[300px] rounded-xl border shadow-2xl p-3 space-y-3" style={{ background: PANEL, borderColor: GARIS }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#e2e8f0]">Tegangan ujung</p>
        <button onClick={onTutup} className="p-1 rounded text-gray-400 hover:text-white" aria-label="Tutup lapisan tegangan ujung">
          <X size={15} />
        </button>
      </div>

      <div className="flex gap-2">
        <select value={bulan} onChange={(e) => onBulan(tahun, Number(e.target.value))} className={INPUT} aria-label="Bulan ukur">
          {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
        </select>
        <select value={tahun} onChange={(e) => onBulan(Number(e.target.value), bulan)} className={INPUT} aria-label="Tahun ukur">
          {[tahun - 1, tahun, tahun + 1].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Tegangan terendah</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {NADA.map((n) => (
            <button key={n.k} onClick={() => onSaring({ ...saring, nada: alih(saring.nada, n.k) })} className={chip(saring.nada.has(n.k))}>
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: WARNA_NADA[n.k] }} />
              {n.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Status</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {STATUS_UJUNG_PETA.map((s: StatusUjungPeta) => (
            <button key={s} onClick={() => onSaring({ ...saring, status: alih(saring.status, s) })} className={chip(saring.status.has(s))}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Diukur jauh dari ujung terjauh</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <button onClick={() => onSaring({ ...saring, jauhDariUjung: null })} className={chip(saring.jauhDariUjung === null)}>
            Semua
          </button>
          {AMBANG_JAUH.map((m) => (
            <button key={m} onClick={() => onSaring({ ...saring, jauhDariUjung: m })} className={chip(saring.jauhDariUjung === m)}>
              &gt; {m} m
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
        {sibuk && <Loader2 size={11} className="animate-spin" />}
        {galat ? <span className="text-red-300">{galat}</span> : `${jumlah} dari ${total} titik ditampilkan`}
      </p>
    </div>
  );
}
