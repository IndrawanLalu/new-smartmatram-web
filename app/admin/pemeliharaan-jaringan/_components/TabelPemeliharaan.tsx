"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import type { BarisPemeliharaan, StatusTabel } from "../_hooks/usePemeliharaanJaringan";

/**
 * Daftar pemeliharaan jaringan — pola sama dengan Optimasi Trafo
 * (teknisaplikasi.md butir 7): tabel 20 baris, klik baris → modal detail.
 *
 * Kolom WO & Tgl WO dibaca dari sumber WO-nya (temuan inspeksi yang
 * ditugaskan ke HARJAR); pekerjaan tanpa WO bertanda "-".
 */

const PAGE_SIZE = 20;

export const NADA_STATUS: Record<StatusTabel, string> = {
  "Menunggu verifikasi": "bg-amber-50 text-amber-700 border-amber-200",
  Diverifikasi: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

export const tanggal = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

function Mini({ url, label }: { url: string; label: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage, dilihat sekilas
    <img src={url} alt={label} title={label} className="w-9 h-9 rounded-md object-cover border border-line" />
  ) : (
    <span className="w-9 h-9 rounded-md border border-dashed border-line grid place-items-center text-[9px] text-ink-muted">—</span>
  );
}

interface Props {
  baris: BarisPemeliharaan[];
  loading: boolean;
  onDetail: (b: BarisPemeliharaan) => void;
}

export default function TabelPemeliharaan({ baris, loading, onDetail }: Props) {
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
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
        <p className="text-sm font-semibold text-ink">Tidak ada pemeliharaan pada periode ini</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          Pemeliharaan dicatat dari HP oleh regu yang mengerjakannya — lengkap dengan titik dan foto
          sebelum-sesudah. Coba ganti bulan atau penyaring.
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
              <th className={TH}>Jenis</th>
              <th className={TH}>Kategori</th>
              <th className={TH}>Pekerjaan</th>
              <th className={TH}>Alamat</th>
              <th className={TH}>WO</th>
              <th className={TH}>Tgl WO</th>
              <th className={TH}>Foto</th>
              <th className={TH}>Petugas</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => (
              <tr key={b.id} onClick={() => onDetail(b)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                <td className={`${TD} text-xs text-ink font-medium whitespace-nowrap`}>{tanggal(b.tgl)}</td>
                <td className={TD}>
                  <p className="font-semibold text-ink">{b.penyulang}</p>
                  <p className="text-[11px] text-ink-muted">{b.ulp}</p>
                </td>
                <td className={TD}>
                  <span className="px-2 py-0.5 rounded-md bg-navy-50 border border-navy-200 text-[11px] font-bold text-navy-700">
                    {b.jenis}
                  </span>
                </td>
                <td className={`${TD} text-xs text-ink-soft`}>{b.kategoriLabel ?? b.kategori}</td>
                <td className={`${TD} text-xs text-ink max-w-64`}>
                  <p className="line-clamp-2">{b.pekerjaan}</p>
                </td>
                <td className={`${TD} text-xs text-ink-soft max-w-48`}>
                  <p className="line-clamp-2">{b.alamat ?? "—"}</p>
                </td>
                <td className={`${TD} text-xs text-ink-soft max-w-40`}>
                  <p className="line-clamp-2">{b.woLabel ?? "-"}</p>
                </td>
                <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{b.woTgl ? tanggal(b.woTgl) : "-"}</td>
                <td className={TD}>
                  <div className="flex gap-1">
                    <Mini url={b.fotoSebelum} label="sebelum" />
                    <Mini url={b.fotoSesudah} label="sesudah" />
                  </div>
                </td>
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
          {(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, baris.length)} dari {baris.length}
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
