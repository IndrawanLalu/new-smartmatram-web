"use client";

import { useState } from "react";
import { ChevronDown, Download, Loader2, Lock, Trash2, TriangleAlert, Upload } from "lucide-react";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, CARD, DISPLAY } from "@/app/admin/_ui";
import { kunciBulan, labelBulan } from "../_lib/rencana";
import { useRencanaHargardu } from "../_hooks/useRencanaHargardu";
import UnggahRencanaModal from "./UnggahRencanaModal";

/**
 * Rencana Pemeliharaan — permulaan tanpa riwayat (keputusan user 28 Sep 2026).
 * Tiap ULP menandai bulan pemeliharaan tiap gardu di templat Excel. WO bulan
 * yang ada rencananya disusun dari sini; tanpa rencana, sistem menyusun dari
 * riwayat.
 */

const tglWita = (ts: string) =>
  new Date(ts).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar", day: "numeric", month: "short", year: "numeric" });

interface Props {
  daftar: string[];
  oleh: string;
  bolehKelola: boolean;
}

export default function RencanaPemeliharaan({ daftar, oleh, bolehKelola }: Props) {
  const toast = useToast();
  const r = useRencanaHargardu(daftar, oleh);
  const [buka, setBuka] = useState(true);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [unggah, setUnggah] = useState<string | null>(null);
  const [hapus, setHapus] = useState<string | null>(null);

  const unduh = async (ulp: string) => {
    setSibuk(ulp);
    try {
      await r.unduh(ulp);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Templat gagal dibuat.");
    } finally {
      setSibuk(null);
    }
  };

  return (
    <div className={CARD}>
      <button onClick={() => setBuka((b) => !b)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div>
          <p className={`${DISPLAY} text-base font-bold text-ink`}>Rencana Pemeliharaan</p>
          <p className="text-[11px] text-ink-muted">
            Selama riwayat belum ada, ULP menandai bulan pemeliharaan tiap gardu di templat Excel. WO bulan yang ada
            rencananya disusun dari sini; tanpa rencana, sistem menyusun dari riwayat.
          </p>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-ink-muted transition-transform ${buka ? "rotate-180" : ""}`} />
      </button>

      {buka && (
        <div className="border-t border-line divide-y divide-line">
          {r.galat ? (
            <div className="px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              <span>{r.galat} <button onClick={r.muat} className="font-semibold text-navy-600">Muat ulang</button></span>
            </div>
          ) : r.loading ? (
            <p className="px-4 py-3 flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={14} className="animate-spin" /> Memuat rencana…</p>
          ) : (
            daftar.map((ulp) => {
              const info = r.perUlp.get(ulp);
              if (!info) return null;
              return (
                <div key={ulp} className="px-4 py-3 flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink">{ulp}</p>
                      <p className="text-[11px] text-ink-muted">
                        {info.jumlahGardu > 0
                          ? `${info.jumlahGardu} gardu direncanakan${info.diunggah ? ` · diunggah ${info.diunggah.oleh ?? "—"}, ${tglWita(info.diunggah.pada)}` : ""}`
                          : "Belum ada rencana — WO disusun sistem"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => void unduh(ulp)} className={BTN_GHOST} disabled={sibuk === ulp}>
                        {sibuk === ulp ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Unduh templat
                      </button>
                      {bolehKelola && (
                        <>
                          <button onClick={() => setUnggah(ulp)} className={BTN_GHOST}><Upload size={14} /> Unggah rencana</button>
                          {info.jumlahGardu > 0 && (
                            <button onClick={() => setHapus(ulp)} className={`${BTN_GHOST} text-red-700`}><Trash2 size={14} /> Hapus rencana</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-6 lg:grid-cols-12 gap-1">
                    {info.jendela.map((b) => {
                      const k = kunciBulan(b);
                      const n = info.perBulan.get(k) ?? 0;
                      return (
                        <div key={k} className={`rounded-md border border-line px-1 py-1 text-center ${info.terbit.has(k) ? "bg-surface" : ""}`} title={info.terbit.has(k) ? "WO sudah terbit" : undefined}>
                          <p className="text-[9px] text-ink-muted">{labelBulan(b)}</p>
                          <p className={`text-xs font-bold tabular-nums ${n ? "text-ink" : "text-ink-muted"}`}>
                            {info.terbit.has(k) ? <Lock size={11} className="inline -mt-0.5" /> : n || "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {unggah && <UnggahRencanaModal ulp={unggah} pratinjau={r.pratinjau} simpan={r.simpan} onTutup={() => setUnggah(null)} />}
      {hapus && (
        <ConfirmDialog
          title={`Hapus Rencana Pemeliharaan ${hapus}?`}
          message="Rencana bulan berjalan ke depan yang WO-nya belum terbit dihapus, dan WO bulan-bulan itu kembali disusun sistem dari riwayat. WO yang sudah terbit tidak berubah."
          confirmLabel="Hapus rencana"
          tone="danger"
          onClose={() => setHapus(null)}
          onConfirm={() => {
            const ulp = hapus;
            setHapus(null);
            r.hapus(ulp).then(
              (n) => toast.success(`${n} tanda rencana ${ulp} dihapus.`),
              (e: Error) => toast.error(e.message),
            );
          }}
        />
      )}
    </div>
  );
}
