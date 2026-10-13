"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import { KOLOM_PRO_NTB, selPro, type BarisPro } from "../_lib/proNtb";

/**
 * Tabel Copy to PRO NTB — 14 kolom persis laporan UIW. NAMA TIM diketik di
 * sini (tidak disimpan); kolom terakhir (status persetujuan) hanya di layar.
 */

const TH = "px-2.5 py-2 text-left text-[10px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-2.5 py-1.5 border-b border-line align-top text-xs";
const PER_HAL = 50;
const BELUM = <span className="text-amber-700 italic">belum diatur</span>;

interface Props {
  baris: BarisPro[];
  noAwal: number;
  timDari: (b: BarisPro) => string;
  onTim: (b: BarisPro, v: string) => void;
}

export default function TabelProNtb({ baris, noAwal, timDari, onTim }: Props) {
  const [hal, setHal] = useState(1);
  const totalHal = Math.max(1, Math.ceil(baris.length / PER_HAL));
  const halIni = Math.min(hal, totalHal);
  const awal = (halIni - 1) * PER_HAL;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-surface">
            <tr>
              {KOLOM_PRO_NTB.map((k) => <th key={k} className={TH}>{k}</th>)}
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {baris.slice(awal, awal + PER_HAL).map((b, i) => {
              const sel = selPro(b, noAwal + awal + i, timDari(b));
              return (
                <tr key={b.id} className="hover:bg-navy-50/40">
                  {sel.map((v, c) =>
                    c === 7 ? (
                      <td key={c} className={TD}>
                        <input
                          value={v}
                          onChange={(e) => onTim(b, e.target.value)}
                          placeholder="ketik…"
                          className="w-28 rounded-md border border-line px-2 py-1 text-xs focus:outline-none focus:border-navy-400"
                        />
                        {b.item.petugas && <p className="mt-0.5 text-[10px] text-ink-muted truncate max-w-28" title={b.item.petugas}>{b.item.petugas}</p>}
                      </td>
                    ) : (
                      <td key={c} className={`${TD} ${c >= 12 ? "text-right tabular-nums" : ""} ${c === 6 ? "min-w-56" : "whitespace-nowrap"}`}>
                        {c === 5 && !b.jenis ? BELUM
                          : c >= 12 && b.nilai === null ? <span className="text-amber-700 italic">kosong</span>
                          : v}
                      </td>
                    ),
                  )}
                  <td className={`${TD} whitespace-nowrap`}>
                    {b.item.disetujui ? <span className="text-emerald-700">✅</span> : <span className="text-amber-700">⏳ belum disetujui</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalHal > 1 && (
        <div className="flex items-center justify-end gap-1 px-4 py-2.5 text-xs text-ink-soft">
          <button onClick={() => setHal(halIni - 1)} disabled={halIni <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <span>{halIni} / {totalHal}</span>
          <button onClick={() => setHal(halIni + 1)} disabled={halIni >= totalHal} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
