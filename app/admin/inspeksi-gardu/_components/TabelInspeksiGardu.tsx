"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import { fotoKecil } from "@/lib/fotoKecil";
import { NADA_UI, nadaStatus } from "@/lib/statusUi";
import type { BarisInspeksiGardu } from "../_hooks/useInspeksiGardu";

/** Daftar kunjungan Inspeksi Gardu — 20 baris, klik → detail. */

const PAGE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top text-xs";
export const NADA_PRIORITAS: Record<string, string> = {
  Urgent: "bg-red-50 text-red-700 border-red-200",
  Rawan: "bg-amber-50 text-amber-700 border-amber-200",
  Biasa: "bg-slate-100 text-slate-600 border-slate-200",
};
export const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Makassar" });

export default function TabelInspeksiGardu({ baris, loading, onDetail }: { baris: BarisInspeksiGardu[]; loading: boolean; onDetail: (b: BarisInspeksiGardu) => void }) {
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PAGE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE, hal * PAGE);

  if (loading) {
    return <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}><Loader2 size={16} className="animate-spin" /> Memuat inspeksi…</div>;
  }
  if (baris.length === 0) {
    return <div className={`${CARD} p-8 text-center text-sm text-ink-muted`}>Belum ada inspeksi gardu di periode ini.</div>;
  }
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="kepala-kit bg-surface">
            <tr>
              <th className={TH}>Tanggal</th><th className={TH}>Gardu</th><th className={TH}>Tier</th>
              <th className={TH}>Temuan</th><th className={TH}>Foto</th><th className={TH}>Petugas</th><th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => (
              <tr key={b.id} onClick={() => onDetail(b)} className="cursor-pointer hover:bg-navy-50/40">
                <td className={`${TD} whitespace-nowrap text-ink-soft`}>{tanggal(b.tgl)}</td>
                <td className={TD}>
                  <p className="font-semibold text-ink text-sm">{b.garduKode}{b.garduNama ? ` · ${b.garduNama}` : ""}</p>
                  <p className="text-[11px] text-ink-muted">{b.penyulang ?? "—"} · {b.ulp}{b.woNama ? "" : " · di luar WO"}</p>
                </td>
                <td className={TD}>Tier {b.tier}</td>
                <td className={TD}>
                  {b.jumlahTemuan > 0 ? (
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${NADA_PRIORITAS[b.prioritas ?? "Biasa"]}`}>
                      {b.jumlahTemuan} temuan · {b.prioritas}
                    </span>
                  ) : (
                    <span className="text-ink-muted">Tidak ada</span>
                  )}
                </td>
                <td className={TD}>
                  {b.fotoGardu ? (
                    // eslint-disable-next-line @next/next/no-img-element -- gambar mini (lib/fotoKecil)
                    <img src={fotoKecil(b.fotoGardu, 72)} alt="Foto gardu" loading="lazy" className="w-9 h-9 rounded-md object-cover border border-line" />
                  ) : "—"}
                </td>
                <td className={`${TD} text-ink-soft`}>{b.petugas ?? "—"}</td>
                <td className={TD}>
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_UI[nadaStatus(b.status)].pil}`}>{b.status}</span>
                  {b.tertahan && <p className="text-[10px] text-amber-700 mt-0.5">titik gardu menunggu</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
        <span>{(hal - 1) * PAGE + 1}–{Math.min(hal * PAGE, baris.length)} dari {baris.length}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setHalaman(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></button>
          <span>{hal} / {total}</span>
          <button onClick={() => setHalaman(hal + 1)} disabled={hal >= total} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya"><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}
