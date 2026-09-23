"use client";

import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import type { BarisTabel } from "../_hooks/useOptimasiTrafo";
import { NADA_STATUS, nadaPersen, persen, tanggal, teksAsal, teksTujuan } from "../_lib/tampilan";

/**
 * Seluruh pekerjaan optimasi dalam satu tabel — dari WO yang baru terbit
 * sampai catatan yang sudah diverifikasi. Klik baris untuk detail.
 *
 * Beban sebelum → sesudah ditaruh di kolom sendiri karena itulah jawaban atas
 * pertanyaan satu-satunya yang penting: overload-nya hilang atau tidak.
 */

const PAGE_SIZE = 20;

const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

interface Props {
  baris: BarisTabel[];
  loading: boolean;
  onDetail: (b: BarisTabel) => void;
}

export default function TabelOptimasi({ baris, loading, onDetail }: Props) {
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
  // Saringan berubah → jumlah halaman menyusut; jangan tertinggal di halaman kosong.
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat daftar…
      </div>
    );
  }

  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Tidak ada pekerjaan optimasi</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          WO terbit dari tab Tindak Lanjut Anomali di Pengukuran Gardu. Catatan terisi dari HP
          regu, termasuk pekerjaan di luar WO.
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
              <th className={TH}>Tgl pekerjaan</th>
              <th className={TH}>Penyulang</th>
              <th className={TH}>Sumber</th>
              <th className={TH}>Beban sebelum → sesudah</th>
              <th className={TH}>kVA</th>
              <th className={TH}>No. seri lama → baru</th>
              <th className={TH}>Asal / tujuan trafo</th>
              <th className={TH}>Alasan</th>
              <th className={TH}>Petugas</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => {
              const c = b.catatan;
              return (
                <tr key={b.kunci} onClick={() => onDetail(b)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                  <td className={TD}>
                    <p className="font-semibold text-ink">{b.kodeGardu}</p>
                    <p className="text-[11px] text-ink-muted">{b.ulp}</p>
                  </td>
                  <td className={`${TD} text-xs whitespace-nowrap ${c ? "text-ink font-medium" : "text-ink-muted"}`}>
                    {c ? tanggal(c.tglOperasi) : "belum"}
                  </td>
                  <td className={`${TD} text-xs text-ink-soft`}>{b.penyulang ?? "—"}</td>
                  <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>
                    {b.wo ? `WO ${tanggal(b.wo.woSentAt)}` : c?.pengukuranId ? "WO" : "di luar WO"}
                  </td>
                  <td className={`${TD} text-xs whitespace-nowrap`}>
                    <span className={nadaPersen(b.sebelumPersen)}>{persen(b.sebelumPersen)}</span>
                    {c && (
                      <>
                        <ArrowRight size={11} className="inline mx-1 text-ink-muted" />
                        <span className={nadaPersen(b.sesudahPersen)}>{persen(b.sesudahPersen)}</span>
                      </>
                    )}
                  </td>
                  <td className={`${TD} text-xs text-ink whitespace-nowrap`}>
                    {c ? `${c.kvaLama} → ${c.kvaBaru}` : (b.wo?.kvaMaster ?? b.wo?.kvaTrafo ?? "—")}
                  </td>
                  <td className={`${TD} text-[11px] font-mono text-ink-soft whitespace-nowrap`}>
                    {c ? `${c.seriLamaTakTerbaca ? "tak terbaca" : c.noSeriLama} → ${c.noSeriBaru}` : (b.wo?.noSeriMaster ?? "—")}
                  </td>
                  <td className={`${TD} text-xs text-ink-soft`}>
                    {c ? (
                      <>
                        <p>dari {teksAsal(c)}</p>
                        <p>ke {teksTujuan(c)}</p>
                      </>
                    ) : "—"}
                  </td>
                  <td className={`${TD} text-xs text-ink-soft`}>{c?.alasanLabel ?? "—"}</td>
                  <td className={`${TD} text-xs text-ink-soft`}>{c?.petugasNama ?? "—"}</td>
                  <td className={TD}>
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_STATUS[b.status]}`}>
                      {b.status}
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
          {(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, baris.length)} dari {baris.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHalaman(hal - 1)}
            disabled={hal <= 1}
            className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft size={15} />
          </button>
          <span>{hal} / {total}</span>
          <button
            onClick={() => setHalaman(hal + 1)}
            disabled={hal >= total}
            className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
