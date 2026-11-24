"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import { fotoKecil } from "@/lib/fotoKecil";
import IkonKolom from "@/app/admin/_kit/IkonKolom";
import { tanggal } from "@/app/admin/pemeliharaan-jaringan/_components/TabelPemeliharaan";
import type { PekerjaanPdkb } from "../_hooks/usePdkb";
import KepalaUrut, { urutTanggal, type ArahUrut } from "@/app/admin/_components/KepalaUrut";

/** Daftar pekerjaan PDKB: tabel 20 baris, klik baris → modal (teknisaplikasi.md butir 7). */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

export const NADA_PDKB: Record<string, string> = {
  Tercatat: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

function Mini({ url, label }: { url: string; label: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- gambar mini Supabase Storage (lib/fotoKecil)
  return <img src={fotoKecil(url, 72)} alt={label} title={label} loading="lazy" className="w-9 h-9 rounded-md object-cover border border-line" />;
}

interface Props {
  baris: PekerjaanPdkb[];
  loading: boolean;
  onDetail: (b: PekerjaanPdkb) => void;
}

export default function TabelPdkb({ baris, loading, onDetail }: Props) {
  const [halaman, setHalaman] = useState(1);
  const [arah, setArah] = useState<ArahUrut>("baru");
  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = urutTanggal(baris, (b) => b.tgl, arah).slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat pekerjaan…
      </div>
    );
  }
  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Belum ada pekerjaan PDKB di periode ini</p>
        <p className="text-xs text-ink-soft mt-1.5">Catat lewat tombol &ldquo;Catat pekerjaan PDKB&rdquo;, atau &ldquo;Catat hasil&rdquo; di tab Temuan ditugaskan.</p>
      </div>
    );
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="kepala-kit bg-surface">
            <tr>
              <KepalaUrut label="Tanggal" arah={arah} onUbah={(a) => { setArah(a); setHalaman(1); }} className={TH} />
              <th className={TH}><IkonKolom teks="Penyulang" />Penyulang / Gardu</th>
              <th className={TH}><IkonKolom teks="Jenis" />Jenis</th>
              <th className={TH}>Pekerjaan</th>
              <th className={TH}>Tim</th>
              <th className={TH}>Foto</th>
              <th className={TH}>WO</th>
              <th className={TH}>Tgl WO</th>
              <th className={TH}><IkonKolom teks="Status" />Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => (
              <tr key={b.id} onClick={() => onDetail(b)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                <td className={`${TD} text-xs font-medium whitespace-nowrap`}>{tanggal(b.tgl)}</td>
                <td className={TD}>
                  <p className="font-semibold text-ink">{b.jenis === "GARDU" ? b.garduKode : b.penyulang}</p>
                  <p className="text-[11px] text-ink-muted">{b.ulp}</p>
                </td>
                <td className={TD}>
                  <span className="px-2 py-0.5 rounded-md bg-navy-50 border border-navy-200 text-[11px] font-bold text-navy-700">{b.jenis}</span>
                </td>
                <td className={`${TD} text-xs max-w-64`}>
                  <p className="line-clamp-2 text-ink">{b.pekerjaan}</p>
                  {b.kategoriLabel && <p className="text-[11px] text-ink-muted">{b.kategoriLabel}</p>}
                </td>
                <td className={`${TD} text-xs text-ink-soft`}>{b.pelaksana}</td>
                <td className={TD}>
                  <div className="flex gap-1">
                    {b.fotoSebelum && <Mini url={b.fotoSebelum} label="Sebelum" />}
                    {b.fotoSesudah && <Mini url={b.fotoSesudah} label="Sesudah" />}
                  </div>
                </td>
                <td className={`${TD} text-xs text-ink-soft max-w-48`}><p className="line-clamp-2">{b.woLabel ?? "-"}</p></td>
                <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{b.woTgl ? tanggal(b.woTgl) : "-"}</td>
                <td className={TD}>
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_PDKB[b.status]}`}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
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
