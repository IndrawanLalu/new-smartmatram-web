"use client";

import { useState } from "react";
import { Copy, Download, Loader2, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { useProNtb } from "../_hooks/useProNtb";
import { META } from "../_lib/kinerjaMeta";
import { teksTempel, type BarisPro } from "../_lib/proNtb";
import TabelProNtb from "./TabelProNtb";
import AturProNtbModal from "./AturProNtbModal";

/**
 * Copy to PRO NTB (13 Okt 2026): realisasi harian disusun dalam 14 kolom
 * laporan harian UIW, lalu disalin (tempel ke spreadsheet) atau diunduh Excel.
 * NAMA TIM diketik di layar — yang diketik untuk satu petugas ikut mengisi
 * baris lain petugas itu di jenis yang sama, selama layar ini terbuka.
 */

interface Props {
  ulpAwal: string;
  daftarUlp: string[];
  /** Pengatur kolom per jenis: UP3 & admin. null = tidak boleh. */
  pengatur: string | null;
}

const kunciPetugas = (b: BarisPro) => (b.item.petugas ? `${b.item.kunci}|${b.item.petugas}` : null);

export default function CopyProNtb({ ulpAwal, daftarUlp, pengatur }: Props) {
  const o = useProNtb(ulpAwal);
  const toast = useToast();
  const [noAwal, setNoAwal] = useState(1);
  const [timBaris, setTimBaris] = useState<Record<string, string>>({});
  const [timPetugas, setTimPetugas] = useState<Record<string, string>>({});
  const [atur, setAtur] = useState(false);
  const [unduh, setUnduh] = useState(false);

  const timDari = (b: BarisPro) => {
    const kp = kunciPetugas(b);
    return timBaris[b.id] ?? (kp ? timPetugas[kp] : undefined) ?? "";
  };
  const onTim = (b: BarisPro, v: string) => {
    setTimBaris((x) => ({ ...x, [b.id]: v }));
    const kp = kunciPetugas(b);
    if (kp) setTimPetugas((x) => ({ ...x, [kp]: v }));
  };

  const timKosong = o.baris.filter((b) => !timDari(b).trim()).length;
  const belumDiatur = META.filter((m) => !o.jenis.has(m.kunci) && o.baris.some((b) => b.item.kunci === m.kunci));

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(teksTempel(o.baris, noAwal, timDari));
      toast.success(`${o.baris.length} baris tersalin — tempel di kolom NO spreadsheet PRO NTB.`);
    } catch {
      toast.error("Gagal menyalin — izinkan akses papan klip di peramban.");
    }
  };

  const keExcel = async () => {
    setUnduh(true);
    try {
      const { unduhProNtb } = await import("../_lib/unduhProNtb");
      const rentang = o.dari === o.sampai ? o.dari : `${o.dari} sd ${o.sampai}`;
      await unduhProNtb(o.baris, noAwal, timDari, `PRO NTB ${o.ulp === "SEMUA" ? "UP3" : o.ulp} ${rentang}.xlsx`);
    } finally {
      setUnduh(false);
    }
  };

  const siap = !o.loading && !o.galat && o.baris.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-soft">
          Dari
          <input type="date" value={o.dari} onChange={(e) => o.setDari(e.target.value)} className={`${FIELD} w-[160px] mt-1 block`} />
        </label>
        <label className="text-xs text-ink-soft">
          Sampai
          <input type="date" value={o.sampai} onChange={(e) => o.setSampai(e.target.value)} className={`${FIELD} w-[160px] mt-1 block`} />
        </label>
        <label className="text-xs text-ink-soft">
          ULP
          <select value={o.ulp} onChange={(e) => o.setUlp(e.target.value)} className={`${FIELD} w-[160px] mt-1 block`} disabled={daftarUlp.length <= 1}>
            {daftarUlp.map((u) => <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          NO mulai
          <input
            type="number"
            min={1}
            value={noAwal}
            onChange={(e) => setNoAwal(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className={`${FIELD} w-[90px] mt-1 block`}
          />
        </label>
        <button onClick={o.muat} className={BTN_GHOST} disabled={o.loading}>
          <RefreshCw size={14} className={o.loading ? "animate-spin" : ""} /> Muat ulang
        </button>
        {pengatur && (
          <button onClick={() => setAtur(true)} className={BTN_GHOST}>
            <Settings2 size={14} /> Kolom per jenis
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={() => void keExcel()} className={BTN_GHOST} disabled={!siap || unduh}>
            {unduh ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Unduh Excel
          </button>
          <button onClick={() => void salin()} className={BTN_PRIMARY} disabled={!siap}>
            <Copy size={14} /> Salin
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-soft -mt-1">
        Pekerjaan yang dikirim regu, <b>termasuk yang belum disetujui</b>, dalam 14 kolom laporan harian UIW.
        <b> Salin</b> menyalin barisnya tanpa judul kolom — tempel di sel NO baris kosong pertama spreadsheet.
        NAMA TIM tidak disimpan.
      </p>

      {o.galat && !o.loading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{o.galat}</p>
        </div>
      )}
      {siap && (belumDiatur.length > 0 || timKosong > 0) && (
        <p className="text-xs text-amber-700 -mt-1">
          {[
            belumDiatur.length > 0 && `Kolom jenis belum diatur: ${belumDiatur.map((m) => m.jenis).join(", ")}.`,
            timKosong > 0 && `${timKosong} baris NAMA TIM masih kosong.`,
          ].filter(Boolean).join(" ")}
        </p>
      )}

      {o.loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 size={16} className="animate-spin" /> Memuat realisasi…
        </div>
      ) : o.baris.length > 0 ? (
        <TabelProNtb key={`${o.ulp}-${o.dari}-${o.sampai}`} baris={o.baris} noAwal={noAwal} timDari={timDari} onTim={onTim} />
      ) : (
        !o.galat && <p className="text-xs text-ink-muted">Belum ada pekerjaan yang dikirim regu pada rentang ini.</p>
      )}

      {atur && pengatur && (
        <AturProNtbModal jenis={o.jenis} oleh={pengatur} onTutup={() => setAtur(false)} onTersimpan={o.muat} />
      )}
    </>
  );
}
