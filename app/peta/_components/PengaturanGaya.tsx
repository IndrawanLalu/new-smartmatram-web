"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Palette } from "lucide-react";
import { aturGaya, GAYA_BAWAAN, useGayaPeta, type GayaPeta } from "../_hooks/useGayaPeta";

/**
 * Warna & simbol peta — sekaligus legendanya. Disimpan di browser ini saja.
 * Contoh di kiri tiap baris digambar persis seperti di peta.
 */

type KunciWarna = Exclude<keyof GayaPeta, "tandaPutus">;

const BARIS: { k: KunciWarna; label: string; contoh: "tiang" | "menumpang" | "diJtm" | "bersama" | "garis" | "ub" | "putus" }[] = [
  { k: "jtm", label: "Tiang & jaringan JTM", contoh: "tiang" },
  { k: "jtr", label: "Tiang & jaringan JTR", contoh: "tiang" },
  { k: "jtrDiJtm", label: "JTR di tiang JTM (ada JTM di atasnya)", contoh: "diJtm" },
  { k: "menumpang", label: "Tiang menumpang lainnya (batang penyulang/gardu lain)", contoh: "menumpang" },
  { k: "bersama", label: "Tiang bersama dua gardu JTR (cincin luar)", contoh: "bersama" },
  { k: "jtrUb", label: "Underbuild JTR — gawang berkabel 2 atau lebih", contoh: "ub" },
  { k: "putus", label: "Kabel JTR belum jelas datang dari tiang mana", contoh: "putus" },
];

function Contoh({ jenis, warna, gaya }: { jenis: (typeof BARIS)[number]["contoh"]; warna: string; gaya: GayaPeta }) {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" className="shrink-0">
      {jenis === "tiang" && (
        <>
          <line x1="2" y1="7" x2="26" y2="7" stroke={warna} strokeWidth="2" />
          <circle cx="14" cy="7" r="4.5" fill={warna} stroke="#fff" strokeWidth="1" />
        </>
      )}
      {jenis === "menumpang" && <circle cx="14" cy="7" r="4.5" fill={warna} stroke={gaya.jtm} strokeWidth="2.5" />}
      {jenis === "bersama" && (
        <>
          <circle cx="14" cy="7" r="6.2" fill="none" stroke={warna} strokeWidth="1.8" />
          <circle cx="14" cy="7" r="3.8" fill={gaya.jtr} stroke="#fff" strokeWidth="1" />
        </>
      )}
      {jenis === "diJtm" && (
        <>
          <line x1="2" y1="7" x2="26" y2="7" stroke={gaya.jtr} strokeWidth="2" />
          <circle cx="14" cy="7" r="4.5" fill={warna} stroke={gaya.jtr} strokeWidth="2.5" />
        </>
      )}
      {jenis === "ub" && (
        <>
          <line x1="2" y1="7" x2="26" y2="7" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          <line x1="2" y1="7" x2="26" y2="7" stroke={warna} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {jenis === "putus" && (
        <>
          <line x1="2" y1="7" x2="26" y2="7" stroke={warna} strokeWidth="2.5" strokeDasharray="4 3" />
          {gaya.tandaPutus && <circle cx="14" cy="7" r="5" fill={warna} stroke="#fff" strokeWidth="1.5" />}
          {gaya.tandaPutus && <text x="14" y="10" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">!</text>}
        </>
      )}
    </svg>
  );
}

export default function PengaturanGaya() {
  const gaya = useGayaPeta();
  const [buka, setBuka] = useState(false);

  return (
    <div className="border-t border-[#1e3552]">
      <button
        onClick={() => setBuka((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#e2e8f0] hover:bg-white/5"
      >
        {buka ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Palette size={13} /> Warna &amp; simbol
      </button>
      {buka && (
        <div className="px-3 pb-3 space-y-2">
          {BARIS.map((b) => (
            <label key={b.k} className="flex items-center gap-2 text-[11px] text-gray-300">
              <Contoh jenis={b.contoh} warna={gaya[b.k]} gaya={gaya} />
              <span className="flex-1 leading-tight">{b.label}</span>
              <input
                type="color"
                value={gaya[b.k]}
                onChange={(e) => aturGaya({ [b.k]: e.target.value })}
                className="w-7 h-6 rounded border border-[#1e3552] bg-transparent cursor-pointer"
                aria-label={`Warna ${b.label}`}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input type="checkbox" checked={gaya.tandaPutus} onChange={(e) => aturGaya({ tandaPutus: e.target.checked })} />
            Tanda &ldquo;!&rdquo; di tengah gawang yang kabelnya belum jelas
          </label>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-gray-500">Tersimpan di browser ini saja.</span>
            <button
              onClick={() => aturGaya(null)}
              disabled={JSON.stringify(gaya) === JSON.stringify(GAYA_BAWAAN)}
              className="text-[11px] text-[#5eead4] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Kembalikan bawaan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
