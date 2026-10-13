"use client";

import { useState } from "react";
import { Check, Layers } from "lucide-react";
import { PILIHAN_LATAR, type Latar } from "../_hooks/useLatarPeta";
import { GARIS, PANEL } from "../_ui";
import { GAYA_PADAM } from "./TombolAtas";

/** Pemilih latar di kanan bawah peta: satu tombol, daftar meluncur ke atas. */
export default function PilihLatar({ latar, onLatar }: { latar: Latar; onLatar: (v: Latar) => void }) {
  const [buka, setBuka] = useState(false);
  const label = PILIHAN_LATAR.find((x) => x.kode === latar)?.label ?? "Latar";
  return (
    <div className="absolute z-[1000] right-3 bottom-7">
      {buka && (
        <div
          className="absolute bottom-full right-0 mb-1.5 w-44 rounded-xl border p-1 shadow-xl"
          style={{ background: PANEL, borderColor: GARIS }}
          role="listbox"
        >
          {PILIHAN_LATAR.map((x) => (
            <button
              key={x.kode}
              role="option"
              aria-selected={x.kode === latar}
              onClick={() => {
                onLatar(x.kode);
                setBuka(false);
              }}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[#e2e8f0] hover:bg-white/10"
            >
              <span className="flex-1">{x.label}</span>
              {x.kode === latar && <Check size={13} className="text-[#5eead4]" />}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setBuka((v) => !v)}
        className="h-8 px-2.5 rounded-lg border text-xs text-[#e2e8f0] flex items-center gap-1.5 backdrop-blur-sm hover:bg-white/5"
        style={GAYA_PADAM}
        aria-expanded={buka}
        title="Latar peta"
      >
        <Layers size={14} /> {label}
      </button>
    </div>
  );
}
