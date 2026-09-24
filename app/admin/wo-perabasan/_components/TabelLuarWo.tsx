"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import { LABEL_LUAR, type BarisLuar } from "../_hooks/useLuarWoPerabasan";
import { NADA_STATUS, tanggal } from "../_lib/tampilan";

/**
 * Rabas di luar WO — satu baris satu pohon (teknisaplikasi.md butir 7).
 * Klik baris → modal detail. Tidak ada km: pekerjaan ini tidak memilih segmen.
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

interface Props {
  baris: BarisLuar[];
  loading: boolean;
  onDetail: (b: BarisLuar) => void;
}

export default function TabelLuarWo({ baris, loading, onDetail }: Props) {
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat rabas di luar WO…
      </div>
    );
  }

  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Tidak ada rabas di luar WO</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          Regu mencatatnya dari HP (tab Sudah dikerjakan → Catat rabas di luar WO), termasuk bantuan darurat ke
          ULP lain. Yang menunggu diperiksa selalu tampil; yang sudah diterima atau dibatalkan mengikuti periode.
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface">
            <tr>
              <th className={TH}>Tanggal</th>
              <th className={TH}>Penyulang</th>
              <th className={TH}>Jenis pohon</th>
              <th className={TH}>Lokasi</th>
              <th className={TH}>Regu</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => {
              const label = LABEL_LUAR[b.status];
              return (
                <tr key={b.id} onClick={() => onDetail(b)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                  <td className={`${TD} text-xs text-ink font-medium whitespace-nowrap`}>{tanggal(b.tgl)}</td>
                  <td className={TD}>
                    <p className="font-semibold text-ink">{b.penyulang}</p>
                    <p className="text-[11px] text-ink-muted">{b.ulp}</p>
                  </td>
                  <td className={`${TD} text-xs text-ink`}>{b.jenisPohon ?? "—"}</td>
                  <td className={`${TD} text-xs text-ink-soft max-w-56`}>
                    <p className="line-clamp-2">{b.lokasi ?? "—"}</p>
                  </td>
                  <td className={`${TD} text-xs text-ink-soft`}>
                    {b.regu ?? "—"}
                    {b.ulpRegu !== b.ulp && (
                      <span className="block text-[11px] font-semibold text-violet-700">bantuan dari {b.ulpRegu}</span>
                    )}
                  </td>
                  <td className={TD}>
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_STATUS[label as keyof typeof NADA_STATUS]}`}>
                      {label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
        <span>
          {(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, baris.length)} dari {baris.length} pohon
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setHalaman(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <span>{hal} / {total}</span>
          <button onClick={() => setHalaman(hal + 1)} disabled={hal >= total} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
