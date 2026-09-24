"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import { statusTampil, type InspeksiMenunggu } from "../_hooks/useApprovalJtr";
import { NADA_STATUS, km, rentangKerja } from "../_lib/tampilan";

/**
 * Daftar inspeksi JTR — satu baris satu gardu, klik → modal persetujuan
 * (teknisaplikasi.md butir 7). Inspeksi JTR belum punya WO: kolom WO "-".
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

interface Props {
  baris: InspeksiMenunggu[];
  loading: boolean;
  onDetail: (d: InspeksiMenunggu) => void;
}

export default function TabelJtr({ baris, loading, onDetail }: Props) {
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat inspeksi JTR…
      </div>
    );
  }

  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Tidak ada inspeksi JTR</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          Gardu muncul di sini begitu petugas mulai menelusuri jaringannya dari aplikasi. Yang masih
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
              <th className={TH}>Tanggal inspeksi</th>
              <th className={TH}>Petugas</th>
              <th className={`${TH} text-right`}>Tiang</th>
              <th className={`${TH} text-right`}>Panjang</th>
              <th className={`${TH} text-right`}>Temuan</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((d) => {
              const status = statusTampil(d.status);
              return (
                <tr key={d.id} onClick={() => onDetail(d)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                  <td className={TD}>
                    <p className="font-semibold text-ink">{d.gardu_kode}</p>
                    <p className="text-[11px] text-ink-muted truncate max-w-48">{d.gardu_nama ?? "—"} · {d.ulp}</p>
                  </td>
                  <td className={`${TD} text-xs text-ink-soft`}>{d.penyulang ?? "—"}</td>
                  <td className={`${TD} text-xs text-ink-soft`}>-</td>
                  <td className={`${TD} text-xs text-ink-soft`}>-</td>
                  <td className={`${TD} text-xs text-ink font-medium whitespace-nowrap`}>{rentangKerja(d.tgl_mulai, d.tgl_selesai)}</td>
                  <td className={`${TD} text-xs text-ink-soft`}>
                    {d.inspektor_nama ?? "—"}
                    {d.petugas_2 && <span className="block text-ink-muted">{d.petugas_2}</span>}
                  </td>
                  <td className={`${TD} text-xs text-right tabular-nums whitespace-nowrap`}>
                    <span className={d.sudah_diperiksa < d.tiang_aktif ? "text-attention font-semibold" : "text-ink"}>
                      {d.sudah_diperiksa}/{d.tiang_aktif}
                    </span>
                    {d.tiang_baru > 0 && <span className="block text-[10px] text-navy-600">+{d.tiang_baru} baru</span>}
                  </td>
                  <td className={`${TD} text-xs text-right tabular-nums whitespace-nowrap text-ink`}>{km(d.panjang_km)}</td>
                  <td className={`${TD} text-xs text-right tabular-nums`}>
                    {d.sementara ? <span className="text-ink-muted">—</span> : d.jumlah_temuan > 0 ? <span className="text-attention font-semibold">{d.jumlah_temuan}</span> : <span className="text-ink-muted">0</span>}
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
        <span>
          {(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, baris.length)} dari {baris.length} gardu ·{" "}
          {km(baris.reduce((a, d) => a + Number(d.panjang_km ?? 0), 0))}
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
