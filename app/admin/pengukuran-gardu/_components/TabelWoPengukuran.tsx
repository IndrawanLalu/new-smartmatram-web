"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, CircleDashed, CheckCircle2 } from "lucide-react";
import { LABEL_ALASAN, type AlasanWo } from "../_lib/kandidatWo";

// ── Bentuk baris ──────────────────────────────────────────────────────────────

/**
 * Satu baris tabel — bentuk bersama untuk dua keadaan.
 *
 * Pratinjau kandidat dan WO yang sudah terbit ditampilkan oleh tabel yang SAMA,
 * dibedakan hanya oleh `tgl_wo` (null = belum terbit). Tanpa penyatuan ini akan
 * ada dua tabel yang harus dijaga sejajar kolomnya, dan yang satu pasti
 * ketinggalan saat yang lain diubah.
 */
export interface BarisTampil {
  kode_gardu: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  alasan: AlasanWo;
  tgl_ukur_terakhir: string | null;
  umur_bulan: number | null;
  /** NULL = pratinjau, WO-nya belum diterbitkan. */
  tgl_wo: string | null;
  tgl_realisasi: string | null;
  petugas_nama: string | null;
}

const PAGE_SIZE = 20;

const TH = "px-3 py-2.5 text-xs font-semibold text-accent-deep whitespace-nowrap";
const TD = "px-3 py-2.5 text-sm text-ink";
const KOSONG = <span className="text-ink-muted">—</span>;

/** YYYY-MM-DD → DD-MM-YYYY. */
function fmtTgl(s: string | null) {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

// ── Tabel ─────────────────────────────────────────────────────────────────────

interface TabelWoPengukuranProps {
  rows: BarisTampil[];
  /** Kolom ULP hanya berguna kalau yang tampil lebih dari satu ULP. */
  tampilkanUlp: boolean;
}

export default function TabelWoPengukuran({ rows, tampilkanUlp }: TabelWoPengukuranProps) {
  const [page, setPage] = useState(1);
  const [rowsTerakhir, setRowsTerakhir] = useState(rows);

  // Daftar berganti saat periode/ULP/saringan berubah, dan halaman 7 dari daftar
  // lama hampir pasti kosong di daftar baru. Disesuaikan saat render, bukan lewat
  // useEffect: efek akan menampilkan halaman lama satu frame lebih dulu, lalu
  // memaksa render kedua.
  if (rows !== rowsTerakhir) {
    setRowsTerakhir(rows);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const halaman = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-line shadow-card p-10 text-center">
        <CircleDashed size={28} className="mx-auto text-ink-muted mb-2" />
        <p className="text-sm text-ink-soft">Tidak ada gardu yang cocok.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-line shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="bg-accent-tint">
            <tr>
              <th className={`${TH} text-center w-12`}>No</th>
              <th className={`${TH} text-left`}>Kode</th>
              <th className={`${TH} text-left`}>Nama / Alamat</th>
              <th className={`${TH} text-left`}>Penyulang</th>
              <th className={`${TH} text-right`}>kVA</th>
              {tampilkanUlp && <th className={`${TH} text-left`}>ULP</th>}
              <th className={`${TH} text-center`}>Terakhir Diukur</th>
              <th className={`${TH} text-center`}>Umur</th>
              <th className={`${TH} text-left`}>Alasan</th>
              <th className={`${TH} text-center`}>Tgl WO</th>
              <th className={`${TH} text-center`}>Tgl Realisasi</th>
              <th className={`${TH} text-left`}>Petugas</th>
              <th className={`${TH} text-center`}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {halaman.map((r, i) => (
              <tr key={`${r.ulp}|${r.kode_gardu}`} className="hover:bg-surface transition-colors">
                <td className={`${TD} text-center text-ink-muted`}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className={`${TD} font-semibold whitespace-nowrap`}>{r.kode_gardu}</td>
                <td className={`${TD} max-w-[260px]`}>
                  <p className="truncate">{r.nama || r.alamat || KOSONG}</p>
                  {r.nama && r.alamat && r.alamat !== r.nama && (
                    <p className="text-[11px] text-ink-muted truncate">{r.alamat}</p>
                  )}
                </td>
                <td className={`${TD} whitespace-nowrap`}>{r.penyulang || KOSONG}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {r.kva_master ?? KOSONG}
                </td>
                {tampilkanUlp && <td className={`${TD} whitespace-nowrap`}>{r.ulp}</td>}
                <td className={`${TD} text-center whitespace-nowrap tabular-nums`}>
                  {fmtTgl(r.tgl_ukur_terakhir) ?? KOSONG}
                </td>
                <td className={`${TD} text-center tabular-nums`}>
                  {r.umur_bulan === null ? KOSONG : `${r.umur_bulan} bln`}
                </td>
                <td className={TD}>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                      r.alasan === "belum_pernah"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-navy-50 text-navy-600"
                    }`}
                  >
                    {LABEL_ALASAN[r.alasan]}
                  </span>
                </td>
                <td className={`${TD} text-center whitespace-nowrap tabular-nums`}>
                  {fmtTgl(r.tgl_wo) ?? <span className="text-ink-muted italic">pratinjau</span>}
                </td>
                <td className={`${TD} text-center whitespace-nowrap tabular-nums`}>
                  {fmtTgl(r.tgl_realisasi) ?? KOSONG}
                </td>
                <td className={`${TD} max-w-[150px]`}>
                  <span className="block truncate">{r.petugas_nama || KOSONG}</span>
                </td>
                <td className={`${TD} text-center`}>
                  {r.tgl_realisasi ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700">
                      <CheckCircle2 size={11} />
                      Selesai
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
                      Belum
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line">
          <p className="text-xs text-ink-muted">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} dari {rows.length} gardu
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8 w-8 grid place-items-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40 transition-colors"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs text-ink-soft tabular-nums px-1">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="h-8 w-8 grid place-items-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40 transition-colors"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
