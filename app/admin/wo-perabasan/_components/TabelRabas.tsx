"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import type { BarisRabas } from "../_hooks/useDaftarPerabasan";
import { NADA_STATUS, km, rentangKerja, tanggal } from "../_lib/tampilan";

/**
 * Daftar segmen perabasan — satu baris satu segmen, urut per penyulang
 * (teknisaplikasi.md butir 7). Klik baris → modal detail.
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

interface Props {
  baris: BarisRabas[];
  loading: boolean;
  onDetail: (b: BarisRabas) => void;
}

export default function TabelRabas({ baris, loading, onDetail }: Props) {
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat daftar segmen…
      </div>
    );
  }

  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Tidak ada segmen perabasan</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          Segmen masuk ke sini begitu WO diterbitkan di tab Susun WO. Yang masih berjalan selalu
          tampil; yang sudah diverifikasi atau dibatalkan mengikuti periode yang dipilih.
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
              <th className={TH}>Penyulang</th>
              <th className={TH}>Segmen</th>
              <th className={TH}>Panjang</th>
              <th className={TH}>WO</th>
              <th className={TH}>Tgl WO</th>
              <th className={TH}>Regu</th>
              <th className={TH}>Tgl pekerjaan</th>
              <th className={TH}>Petugas</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => (
              <tr key={b.id} onClick={() => onDetail(b)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                <td className={TD}>
                  <p className="font-semibold text-ink">{b.penyulang}</p>
                  <p className="text-[11px] text-ink-muted">{b.ulp}</p>
                </td>
                <td className={`${TD} text-xs text-ink max-w-56`}>{b.segmenNama}</td>
                <td className={`${TD} text-xs text-ink whitespace-nowrap tabular-nums`}>
                  {km(b.panjangKm)}
                  {b.panjangDari === "ketikan" && <span className="text-amber-600" title="Panjang masih angka ketikan"> ✎</span>}
                </td>
                <td className={`${TD} text-xs text-ink-soft max-w-40`}>
                  <p className="line-clamp-2">{b.woNama ?? "-"}</p>
                </td>
                <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{b.woTgl ? tanggal(b.woTgl) : "-"}</td>
                <td className={`${TD} text-xs whitespace-nowrap ${b.regu ? "text-ink-soft" : "text-red-700 font-semibold"}`}>
                  {b.regu ?? "belum dibagi"}
                </td>
                <td className={`${TD} text-xs text-ink font-medium whitespace-nowrap`}>{rentangKerja(b.tglMulai, b.tglSelesai)}</td>
                <td className={`${TD} text-xs text-ink-soft`}>{b.petugasNama ?? "—"}</td>
                <td className={TD}>
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_STATUS[b.status]}`}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
        <span>
          {(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, baris.length)} dari {baris.length} segmen ·{" "}
          {baris.reduce((a, b) => a + (b.panjangKm ?? 0), 0).toFixed(2)} km
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
