"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, TriangleAlert } from "lucide-react";
import { BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { NADA_STATUS_TUGAS, STATUS_TUGAS, useTugasHarjar, type TugasHarjar as Tugas } from "../_hooks/useTugasHarjar";
import { tanggal } from "./TabelPemeliharaan";
import BuatTugasModal from "./BuatTugasModal";
import DetailTugasModal from "./DetailTugasModal";

/**
 * Tab "Tugas": semua tugas regu HARJAR (dari temuan & manual) + "Buat Tugas".
 * Pola tabel 20 baris → modal detail (teknisaplikasi.md butir 7).
 */

const PAGE_SIZE = 20;

const NADA_PRIORITAS: Record<string, string> = {
  Emergency: "text-red-700 font-semibold",
  Urgent: "text-red-600 font-semibold",
  Scheduled: "text-amber-700",
};

const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

interface Props {
  ulp: string;
  tahun: number;
  bulan: number;
  oleh: string;
}

export default function TugasHarjar({ ulp, tahun, bulan, oleh }: Props) {
  const o = useTugasHarjar(ulp, tahun, bulan);
  const [buat, setBuat] = useState(false);
  const [idDetail, setIdDetail] = useState<string | null>(null);
  const [halaman, setHalaman] = useState(1);

  // Modal membaca dari daftar LENGKAP yang hidup (butir 7).
  const detail = idDetail ? (o.semua.find((t) => t.id === idDetail) ?? null) : null;
  const total = Math.max(1, Math.ceil(o.baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = o.baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 -mt-1">
        <button onClick={() => o.setStatus("SEMUA")} className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>
          Semua
        </button>
        {STATUS_TUGAS.map((s) => (
          <button key={s} onClick={() => o.setStatus(s)} className={`${CHIP} ${o.status === s ? CHIP_ON : CHIP_OFF}`}>
            {s} <span className="opacity-70">{o.loading ? "" : o.hitung[s]}</span>
          </button>
        ))}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={o.cari}
            onChange={(e) => o.setCari(e.target.value)}
            placeholder="Cari penyulang / pekerjaan / lokasi"
            className={`${FIELD} w-[240px] pl-8`}
          />
        </div>
        <button onClick={() => setBuat(true)} className={`${BTN_PRIMARY} ml-auto`}>
          <Plus size={15} /> Buat Tugas
        </button>
      </div>

      <p className="text-[11px] text-ink-muted -mt-2">
        Tugas yang belum dikerjakan selalu tampil, apa pun bulannya. Yang selesai atau dibatalkan mengikuti bulan tugas dibuat.
      </p>

      {o.loading ? (
        <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
          <Loader2 size={16} className="animate-spin" /> Memuat tugas…
        </div>
      ) : o.galat ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Tugas gagal dimuat</p>
            <p className="mt-0.5 text-amber-700">{o.galat} — kosongnya tabel bukan berarti tidak ada tugas.</p>
            <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
          </div>
        </div>
      ) : o.baris.length === 0 ? (
        <div className={`${CARD} p-10 text-center`}>
          <p className="text-sm font-semibold text-ink">Tidak ada tugas</p>
          <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
            Tugas lahir dari temuan inspeksi yang ditugaskan ke HARJAR, atau dibuat lewat tombol &ldquo;Buat Tugas&rdquo;.
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className={TH}>Dibuat</th>
                  <th className={TH}>Penyulang</th>
                  <th className={TH}>Jenis</th>
                  <th className={TH}>Pekerjaan</th>
                  <th className={TH}>Lokasi</th>
                  <th className={TH}>Sumber</th>
                  <th className={TH}>Prioritas</th>
                  <th className={TH}>Dikerjakan</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((t: Tugas) => (
                  <tr key={t.id} onClick={() => setIdDetail(t.id)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                    <td className={`${TD} text-xs text-ink font-medium whitespace-nowrap`}>{tanggal(t.ditugaskan)}</td>
                    <td className={TD}>
                      <p className="font-semibold text-ink">{t.penyulang}</p>
                      <p className="text-[11px] text-ink-muted">{t.ulp}</p>
                    </td>
                    <td className={TD}>
                      {t.jenis ? (
                        <span className="px-2 py-0.5 rounded-md bg-navy-50 border border-navy-200 text-[11px] font-bold text-navy-700">{t.jenis}</span>
                      ) : "—"}
                    </td>
                    <td className={`${TD} text-xs text-ink max-w-64`}><p className="line-clamp-2">{t.uraian}</p></td>
                    <td className={`${TD} text-xs text-ink-soft max-w-48`}><p className="line-clamp-2">{t.lokasi ?? "—"}</p></td>
                    <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{t.sumber}</td>
                    <td className={`${TD} text-xs whitespace-nowrap ${NADA_PRIORITAS[t.prioritas ?? ""] ?? "text-ink-soft"}`}>{t.prioritas ?? "—"}</td>
                    <td className={`${TD} text-xs text-ink-soft`}>
                      {t.catatanPetugas ? <>{t.catatanPetugas}<span className="block text-[11px] text-ink-muted">{tanggal(t.catatanTgl)}</span></> : "—"}
                    </td>
                    <td className={TD}>
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_STATUS_TUGAS[t.status] ?? ""}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
            <span>{(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, o.baris.length)} dari {o.baris.length}</span>
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
      )}

      {buat && <BuatTugasModal ulp={ulp} onTutup={() => setBuat(false)} onBuat={(v) => o.buat(v, oleh)} />}
      {detail && <DetailTugasModal t={detail} oleh={oleh} onTutup={() => setIdDetail(null)} onBatalkan={o.batalkan} />}
    </>
  );
}
