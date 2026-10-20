"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { BTN_GHOST, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { useToast } from "@/app/admin/_components/Toast";
import { NADA_TAHAP, PEKERJAAN_USULAN, TAHAP_USULAN, type PekerjaanUsulan, type TahapUsulan, type UsulanJtrState } from "../_hooks/useUsulanJtr";
import { LABEL_RENCANA } from "../_lib/rencanaJtr";
import { unduhUsulanJtr } from "../_utils/unduhUsulanJtr";
import RincianUsulanJtr from "./RincianUsulanJtr";

/**
 * Daftar Usulan Perbaikan JTR — usulan yang disimpan dari Analisis JTR,
 * tahapnya dari modul pekerjaan (HARJAR / Penyeimbangan / Optimasi Trafo).
 * Berangkat dari "Usulan": yang masih menunggu keputusan WO.
 */

interface Props {
  st: UsulanJtrState;
  boleh: boolean;
  oleh: string;
  /** Saklar Analisis | Usulan dari induk. */
  saklar: ReactNode;
  /** Usulan yang dibuka dari luar (mis. "Sudah diusulkan" di rincian rencana). */
  buka: string | null;
  onBuka: (id: string | null) => void;
}

const PAGE = 20;
const TH = "px-3 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap";

export default function UsulanJtrTab({ st, boleh, oleh, saklar, buka, onBuka }: Props) {
  const toast = useToast();
  const [tahap, setTahap] = useState<TahapUsulan | "semua">("Usulan");
  const [pekerjaan, setPekerjaan] = useState<PekerjaanUsulan | "">("");
  const [cari, setCari] = useState("");
  const [hal, setHal] = useState(1);

  const cacah = useMemo(() => {
    const c = new Map<string, number>();
    for (const u of st.usulan) c.set(u.tahap, (c.get(u.tahap) ?? 0) + 1);
    return c;
  }, [st.usulan]);

  const tampil = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return st.usulan.filter(
      (u) =>
        (tahap === "semua" || u.tahap === tahap) &&
        (!pekerjaan || u.pekerjaan === pekerjaan) &&
        (!q || [u.gardu_kode, u.penyulang ?? "", u.ringkas].some((v) => v.toUpperCase().includes(q))),
    );
  }, [st.usulan, tahap, pekerjaan, cari]);

  const halaman = Math.max(1, Math.ceil(tampil.length / PAGE));
  const isi = tampil.slice((hal - 1) * PAGE, hal * PAGE);
  const terbuka = st.usulan.find((u) => u.id === buka);
  const ganti = <T,>(f: (v: T) => void) => (v: T) => { f(v); setHal(1); };

  const unduh = () =>
    unduhUsulanJtr(tampil, `Usulan Perbaikan JTR ${new Date().toISOString().slice(0, 10)}.xlsx`).catch((e: Error) => toast.error(e.message));

  return (
    <>
      <div className="px-5 py-4 border-b border-line space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {saklar}
          <select value={pekerjaan} onChange={(e) => ganti(setPekerjaan)(e.target.value as PekerjaanUsulan | "")} className={`${FIELD} ml-auto`}>
            <option value="">Semua pekerjaan</option>
            {PEKERJAAN_USULAN.map((k) => <option key={k} value={k}>{LABEL_RENCANA[k]}</option>)}
          </select>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input value={cari} onChange={(e) => ganti(setCari)(e.target.value)} placeholder="Cari gardu atau penyulang…" className={`${FIELD} w-full pl-8`} />
          </div>
          <button onClick={() => void unduh()} disabled={!tampil.length} className={BTN_GHOST}>
            <Download size={14} /> Excel
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[...TAHAP_USULAN, "semua" as const].map((k) => (
            <button key={k} onClick={() => ganti(setTahap)(k)} className={`${CHIP} ${tahap === k ? CHIP_ON : CHIP_OFF}`}>
              {k === "semua" ? "Semua" : k}
              <span className={`tabular-nums ${tahap === k ? "text-white/70" : "text-ink-muted"}`}>
                {k === "semua" ? st.usulan.length : (cacah.get(k) ?? 0)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {st.galat ? (
        <p className="px-5 py-10 text-center text-sm text-red-600">{st.galat}</p>
      ) : tampil.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-soft">
          Belum ada usulan{tahap !== "semua" ? ` berstatus ${tahap}` : ""}. Simpan usulan dari rincian rencana di Analisis JTR.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="kepala-kit">
                <tr className="bg-navy-50 text-left">
                  <th className={TH}>Gardu</th>
                  <th className={`${TH} text-center`}>Jur.</th>
                  <th className={TH}>Pekerjaan</th>
                  <th className={`${TH} text-right`}>Material</th>
                  <th className={TH}>Tahap</th>
                  <th className={TH}>WO</th>
                  <th className={TH}>Diusulkan</th>
                </tr>
              </thead>
              <tbody>
                {isi.map((u) => (
                  <tr key={u.id} onClick={() => onBuka(u.id)} className="border-t border-line align-top cursor-pointer hover:bg-navy-50/50">
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold text-ink">{u.gardu_kode}</span>
                      <span className="block text-[11px] text-ink-muted">{u.penyulang ?? "-"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-ink">{u.jurusan}</td>
                    <td className="px-3 py-2.5 min-w-64">
                      <span className="block text-xs font-semibold text-navy-600">{LABEL_RENCANA[u.pekerjaan]}</span>
                      <span className="block text-[11px] text-ink-soft">{u.ringkas}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-soft whitespace-nowrap">
                      {u.material.filter((m) => m.jumlah > 0).length} item
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${NADA_TAHAP[u.tahap]}`}>{u.tahap}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-soft whitespace-nowrap">{u.regu ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-soft whitespace-nowrap">
                      <span className="block">{u.dibuat_oleh ?? "-"}</span>
                      <span className="block text-ink-muted">{u.dibuat_at.slice(0, 10)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">{tampil.length} usulan</p>
            {halaman > 1 && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-ink-soft">{hal}/{halaman}</span>
                <button onClick={() => setHal((p) => Math.max(1, p - 1))} disabled={hal === 1} className="w-8 h-8 grid place-items-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setHal((p) => Math.min(halaman, p + 1))} disabled={hal === halaman} className="w-8 h-8 grid place-items-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {terbuka && <RincianUsulanJtr key={terbuka.id + terbuka.tahap} u={terbuka} boleh={boleh} oleh={oleh} st={st} onTutup={() => onBuka(null)} />}
    </>
  );
}
