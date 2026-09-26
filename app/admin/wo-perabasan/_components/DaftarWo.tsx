"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import type { WoRingkas } from "../_hooks/useWoPerabasan";
import { tanggal } from "../_lib/tampilan";

/**
 * Daftar WO perabasan yang sudah terbit (permintaan user 25 Sep 2026: "lihat
 * atau editnya belum ada"). Satu baris satu WO; klik → modal isi & ubah.
 * Semua angka dari view `wo_perabasan_capaian`, tidak dijumlah di sini.
 */

const PAGE = 20;
const TH = "px-3 py-2.5 text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top text-xs";
const kms = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Number(v).toFixed(2).replace(".", ","));

const NADA: Record<string, string> = {
  Terbit: "bg-sky-50 text-sky-700 border-sky-200",
  Selesai: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function DaftarWo({
  wo,
  ulp,
  loading,
  onDetail,
}: {
  wo: WoRingkas[];
  /** "SEMUA" atau satu ULP — mengikuti penyaring halaman. */
  ulp: string;
  loading: boolean;
  onDetail: (w: WoRingkas) => void;
}) {
  const [halaman, setHalaman] = useState(1);
  const baris = useMemo(() => (ulp === "SEMUA" ? wo : wo.filter((w) => w.ulp === ulp)), [wo, ulp]);
  const total = Math.max(1, Math.ceil(baris.length / PAGE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE, hal * PAGE);

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat WO…
      </div>
    );
  }
  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Belum ada WO perabasan</p>
        <p className="text-xs text-ink-soft mt-1.5">WO diterbitkan dari tab Susun WO.</p>
      </div>
    );
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface">
            <tr>
              <th className={`${TH} text-left`}>Nama WO</th>
              <th className={`${TH} text-left`}>Tgl WO</th>
              <th className={`${TH} text-right`}>Target</th>
              <th className={`${TH} text-right`}>Rencana</th>
              <th className={`${TH} text-right`}>Capaian</th>
              <th className={`${TH} text-right`}>Segmen selesai</th>
              <th className={`${TH} text-left`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((w) => (
              <tr key={w.wo_id} onClick={() => onDetail(w)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                <td className={TD}>
                  <p className="font-semibold text-ink text-sm">{w.nama}</p>
                  <p className="text-[11px] text-ink-muted">{w.ulp}</p>
                </td>
                <td className={`${TD} text-ink-soft whitespace-nowrap`}>{tanggal(w.tgl_wo)}</td>
                <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                  <span className="text-[10px] text-ink-muted mr-1">KMS</span>{kms(w.target_km)}
                </td>
                <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                  <span className="text-[10px] text-ink-muted mr-1">KMS</span>{kms(w.rencana_km)}
                </td>
                <td className={`${TD} text-right tabular-nums whitespace-nowrap font-semibold text-emerald-700`}>
                  <span className="text-[10px] text-ink-muted font-normal mr-1">KMS</span>{kms(w.capaian_km)}
                  {w.capaian_persen !== null && <span className="text-ink-muted font-normal"> · {w.capaian_persen}%</span>}
                </td>
                <td className={`${TD} text-right tabular-nums`}>{w.item_selesai}/{w.item}</td>
                <td className={TD}>
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${NADA[w.status] ?? NADA.Terbit}`}>
                    {w.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
        <span>{(hal - 1) * PAGE + 1}–{Math.min(hal * PAGE, baris.length)} dari {baris.length} WO</span>
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
