"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Merge } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import type { BarisJtm } from "../_hooks/useDaftarJtm";
import { NADA_STATUS, km, rentangKerja, statusTampil, tgl } from "../_lib/tampilan";

/**
 * Daftar inspeksi JTM — satu baris satu inspeksi segmen, klik → modal
 * persetujuan (teknisaplikasi.md butir 7). Inspeksi JTM belum punya WO: kolom
 * WO "-".
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

interface Props {
  baris: BarisJtm[];
  loading: boolean;
  onDetail: (d: BarisJtm) => void;
}

export default function TabelJtm({ baris, loading, onDetail }: Props) {
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat inspeksi JTM…
      </div>
    );
  }

  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Tidak ada inspeksi JTM</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          Segmen muncul di sini begitu regu mulai menyusurinya dari aplikasi. Yang masih berjalan selalu
          tampil; yang sudah disetujui mengikuti periode yang dipilih.
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
              <th className={TH}>Segmen</th>
              <th className={TH}>Penyulang</th>
              <th className={TH}>WO</th>
              <th className={TH}>Tgl WO</th>
              <th className={TH}>Tanggal inspeksi</th>
              <th className={TH}>Regu</th>
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
                    <p className="font-semibold text-ink max-w-64 truncate">{d.segmen_nama ?? "(segmen terhapus)"}</p>
                    <p className="text-[11px] text-ink-muted">
                      {d.ulp} · tier {d.tier}
                      {d.kembar > 0 && (
                        <span className="inline-flex items-center gap-0.5 ml-1.5 text-amber-700 font-semibold" title="Segmen ini punya lebih dari satu catatan terbuka — satukan di detail">
                          <Merge size={10} /> {d.kembar + 1} catatan
                        </span>
                      )}
                    </p>
                  </td>
                  <td className={`${TD} text-xs text-ink-soft`}>{d.penyulang}</td>
                  <td className={`${TD} text-xs text-ink-soft max-w-40`}>
                    <p className="line-clamp-2">{d.wo_nama ?? "-"}</p>
                  </td>
                  <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{d.tgl_wo ? tgl(d.tgl_wo) : "-"}</td>
                  <td className={`${TD} text-xs text-ink font-medium whitespace-nowrap`}>{rentangKerja(d.tgl_mulai, d.tgl_selesai)}</td>
                  <td className={`${TD} text-xs text-ink-soft`}>{d.petugas_nama ?? "—"}</td>
                  <td className={`${TD} text-xs text-right tabular-nums whitespace-nowrap`}>
                    <span className={d.tiang_dinilai < d.tiang_segmen ? "text-attention font-semibold" : "text-ink"}>
                      {d.tiang_dinilai}/{d.tiang_segmen}
                    </span>
                  </td>
                  <td className={`${TD} text-xs text-right tabular-nums whitespace-nowrap text-ink`}>{km(d.panjang_km)}</td>
                  <td className={`${TD} text-xs text-right tabular-nums`}>
                    {d.temuan > 0 ? <span className="text-attention font-semibold">{d.temuan}</span> : <span className="text-ink-muted">0</span>}
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
          {(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, baris.length)} dari {baris.length} inspeksi ·{" "}
          {km(baris.reduce((a, d) => a + d.panjang_km, 0))}
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
