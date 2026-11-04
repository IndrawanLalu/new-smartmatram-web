"use client";

import { ClipboardPaste, Trash2 } from "lucide-react";
import type { DataSurat } from "../_hooks/useWoSurat";
import { fmtAngka, JENIS_SURAT } from "../_lib/woSurat";
import IkonKolom from "@/app/admin/_kit/IkonKolom";

/**
 * Sebelas baris surat, persis urutan surat. Tiap baris menyebut dari mana
 * angkanya — "sistem" (WO modulnya, termasuk yang masuk lewat tempelan) atau
 * "tempelan" (`wo_manual`: modulnya belum ada / segmen belum di master).
 * Semua bisa ditempel kecuali Optimasi Trafo (WO-nya dari hasil pengukuran).
 */

interface Props {
  data: DataSurat;
  bolehUbah: boolean;
  onTempel: (kunci: string) => void;
  onHapus: (kunci: string) => void;
  /** Sakelar WO / SLA (scripts/wo-surat-sla.sql). */
  onSla: (kunci: string, sla: boolean) => void;
  /** Kunci yang sakelarnya sedang disimpan. */
  sibukSla: string | null;
}

const TH = "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink border-b border-slate-300";

export default function DaftarJenisWo({ data, bolehUbah, onTempel, onHapus, onSla, sibukSla }: Props) {
  return (
    <div className="rounded-xl border border-line overflow-x-auto">
      <table className="w-full border-collapse text-sm min-w-[620px]">
        <thead className="kepala-kit bg-slate-100">
          <tr>
            <th className={`${TH} text-left w-8`}>No</th>
            <th className={`${TH} text-left`}><IkonKolom teks="Work Order" />Work Order</th>
            <th className={`${TH} text-right`}>Jumlah</th>
            <th className={`${TH} text-left`}>Sumber</th>
            <th className={`${TH} text-right w-[230px]`} />
          </tr>
        </thead>
        <tbody>
          {JENIS_SURAT.map((j, i) => {
            const nilai = data.angka[j.kunci] ?? null;
            const objek = data.objek.filter((o) => o.kunci === j.kunci).length;
            const ditempel = data.manual.has(j.kunci);
            const pakaiSla = data.sla.has(j.kunci);
            const adaSla = data.nilaiSla[j.kunci] != null;
            const sumber = pakaiSla
              ? { teks: "sesuai SLA", cls: "bg-violet-50 text-violet-700 border-violet-200" }
              : ditempel
              ? { teks: "tempelan", cls: "bg-sky-50 text-sky-700 border-sky-200" }
              : nilai !== null && (objek > 0 || !j.tempel)
                ? { teks: "sistem", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                : { teks: "belum ada", cls: "bg-amber-50 text-amber-700 border-amber-200" };
            return (
              <tr key={j.kunci} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-ink-muted tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">
                  <p className="font-semibold text-ink">{j.nama}</p>
                  <p className="text-[11px] text-ink-muted">
                    {pakaiSla ? "SESUAI SLA — tanpa daftar objek di lampiran" : objek > 0 ? `${objek} objek di lampiran` : "tanpa lampiran"}
                  </p>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <span className="font-bold tabular-nums text-ink">{fmtAngka(nilai, j.km)}</span>{" "}
                  <span className="text-[11px] text-ink-muted">{j.satuan}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-px rounded-full border text-[10px] font-semibold ${sumber.cls}`}>
                    {sumber.teks}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {bolehUbah && (
                    <div
                      className={`inline-flex mr-1 align-middle rounded-lg border border-line overflow-hidden text-[11px] font-semibold ${!adaSla || sibukSla === j.kunci ? "opacity-40" : ""}`}
                      title={adaSla ? "Volume WO: WO tersusun, atau sesuai SLA" : "SLA pekerjaan ini belum diatur"}
                    >
                      {([false, true] as const).map((sla) => (
                        <button
                          key={String(sla)}
                          disabled={!adaSla || sibukSla !== null || pakaiSla === sla}
                          onClick={() => onSla(j.kunci, sla)}
                          className={`h-7 px-2 ${pakaiSla === sla ? "bg-brand-600 text-white" : "bg-white text-ink-soft hover:bg-surface"}`}
                        >
                          {sla ? "SLA" : "WO"}
                        </button>
                      ))}
                    </div>
                  )}
                  {j.tempel && bolehUbah && (
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => onTempel(j.kunci)}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-line text-xs text-ink-soft hover:bg-surface"
                      >
                        <ClipboardPaste size={12} /> {ditempel && !j.modul ? "Tempel ulang" : "Tempel dari Excel"}
                      </button>
                      {ditempel && (
                        <button
                          onClick={() => onHapus(j.kunci)}
                          aria-label={`Hapus tempelan ${j.nama}`}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-line text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
