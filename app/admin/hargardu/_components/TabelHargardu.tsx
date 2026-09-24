"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import { statusTampil, type PemeliharaanMenunggu, type StatusHargardu } from "../_hooks/useHargarduApproval";

/**
 * Daftar pemeliharaan gardu — tabel 20 baris, klik baris → modal
 * (teknisaplikasi.md butir 7).
 *
 * Kolom WO: WO Pemeliharaan bulanan yang memuat pekerjaan ini (tab WO
 * Pemeliharaan); pekerjaan di luar WO bertanda "-".
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

export const NADA_STATUS: Record<StatusHargardu, string> = {
  Dijadwalkan: "bg-slate-100 text-slate-600 border-slate-200",
  "Sedang dikerjakan": "bg-sky-50 text-sky-700 border-sky-200",
  "Menunggu persetujuan": "bg-amber-50 text-amber-700 border-amber-200",
  Dikembalikan: "bg-orange-50 text-orange-700 border-orange-200",
  Disetujui: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const tgl = (iso: string | null) => {
  if (!iso) return "—";
  const t = new Date(iso);
  return `${t.getDate()} ${BLN[t.getMonth()]} ${t.getFullYear()}`;
};

/** Padam → selesai sebagai rentang, sama dengan tanggal pekerjaan Perabasan. */
export function rentangKerja(padam: string | null, selesai: string | null) {
  if (!padam && !selesai) return "—";
  if (!padam) return tgl(selesai);
  if (!selesai) return `${tgl(padam)} – …`;
  const a = new Date(padam);
  const b = new Date(selesai);
  if (a.toDateString() === b.toDateString()) return tgl(selesai);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${BLN[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `${tgl(padam)} – ${tgl(selesai)}`;
}

interface Props {
  baris: PemeliharaanMenunggu[];
  loading: boolean;
  onDetail: (d: PemeliharaanMenunggu) => void;
}

export default function TabelHargardu({ baris, loading, onDetail }: Props) {
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat pemeliharaan…
      </div>
    );
  }

  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Tidak ada pemeliharaan gardu</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          Pekerjaan muncul di sini setelah regu menekan “Selesai &amp; kirim” di aplikasi. Yang masih
          berjalan selalu tampil; yang sudah disetujui mengikuti periode yang dipilih.
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
              <th className={TH}>Gardu</th>
              <th className={TH}>Penyulang</th>
              <th className={TH}>WO</th>
              <th className={TH}>Tgl WO</th>
              <th className={TH}>Tgl pekerjaan</th>
              <th className={TH}>Regu</th>
              <th className={`${TH} text-right`}>Tidak normal</th>
              <th className={`${TH} text-right`}>Koreksi master</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((d) => {
              const status = statusTampil(d.status);
              const regu = [...(d.regu_1 ?? []), ...(d.regu_2 ?? [])].join(", ");
              return (
                <tr key={d.id} onClick={() => onDetail(d)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                  <td className={TD}>
                    <p className="font-semibold text-ink">{d.gardu_kode}</p>
                    <p className="text-[11px] text-ink-muted truncate max-w-48">{d.gardu_nama ?? "—"} · {d.ulp}</p>
                  </td>
                  <td className={`${TD} text-xs text-ink-soft`}>{d.penyulang ?? "—"}</td>
                  <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{d.wo_label ?? "-"}</td>
                  <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{d.wo_tgl ? tgl(d.wo_tgl) : "-"}</td>
                  <td className={`${TD} text-xs text-ink font-medium whitespace-nowrap`}>{rentangKerja(d.tgl_padam, d.tgl_selesai)}</td>
                  <td className={`${TD} text-xs text-ink-soft max-w-44`}>
                    <p className="line-clamp-2">{regu || d.petugas_nama || "—"}</p>
                  </td>
                  <td className={`${TD} text-right tabular-nums text-xs`}>
                    {d.item_tidak_normal > 0 ? <span className="text-attention font-semibold">{d.item_tidak_normal}</span> : <span className="text-ink-muted">0</span>}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-xs`}>
                    {d.usulan_menunggu > 0 ? <span className="text-navy-600 font-semibold">{d.usulan_menunggu}</span> : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className={TD}>
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_STATUS[status]}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
        <span>{(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, baris.length)} dari {baris.length}</span>
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
