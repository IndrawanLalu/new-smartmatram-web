"use client";

import { useState } from "react";
import { GitFork } from "lucide-react";
import type { Percabangan } from "../_hooks/usePecahSegmen";

/**
 * Pilihan arah saat tiang percabangan diklik di mode Pecah (27 Okt 2026):
 * potong hanya ke arah yang dicentang — potongannya berpangkal di tiang
 * percabangan ini — atau semua arah sekaligus (titik potong biasa).
 */

interface Props {
  c: Percabangan;
  /** Arah yang sudah dipotong sebelumnya — tercentang saat dibuka. */
  dipilih: string[];
  onPotong: (arah: string[] | null) => void;
  onBatal: () => void;
}

export default function PilihArah({ c, dipilih, onPotong, onBatal }: Props) {
  const [centang, setCentang] = useState<Set<string>>(() => new Set(c.arah.filter((a) => dipilih.includes(a.id)).map((a) => a.id)));
  const alih = (id: string) =>
    setCentang((s) => {
      const b = new Set(s);
      if (b.has(id)) b.delete(id); else b.add(id);
      return b;
    });

  return (
    <div className="rounded-lg border border-[#22D3EE]/40 bg-[#22D3EE]/10 p-2.5 space-y-2">
      <p className="text-xs font-semibold text-cyan-100 flex items-center gap-1.5">
        <GitFork size={13} /> {c.kode} percabangan {c.arah.length} arah — potong ke arah mana?
      </p>
      <ul className="space-y-1">
        {c.arah.map((a) => (
          <li key={a.id}>
            <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer">
              <input type="checkbox" checked={centang.has(a.id)} onChange={() => alih(a.id)} className="accent-[#22D3EE]" />
              <span className="flex-1">Ke {a.kode}</span>
              <span className="text-[11px] text-gray-400 tabular-nums">{a.jumlah_tiang.toLocaleString("id-ID")} tiang</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onPotong([...centang])}
          className="flex-1 rounded-lg bg-linear-to-r from-[#004D40] to-[#00897B] px-2.5 py-1.5 text-xs font-semibold text-white"
        >
          {centang.size ? `Potong ${centang.size} arah` : "Lepas semua arah"}
        </button>
        <button onClick={() => onPotong(null)} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/5">
          Semua arah
        </button>
        <button onClick={onBatal} className="rounded-lg px-2.5 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5">
          Batal
        </button>
      </div>
    </div>
  );
}
