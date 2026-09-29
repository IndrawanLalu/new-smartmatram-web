"use client";

import { ClipboardPaste, Trash2 } from "lucide-react";
import type { DataSurat } from "../_hooks/useWoSurat";
import { fmtAngka, JENIS_SURAT } from "../_lib/woSurat";

/**
 * Sebelas baris surat, persis urutan surat. Tiap baris menyebut dari mana
 * angkanya — "sistem" (WO modulnya) atau "tempelan" (Excel yang ditempel) —
 * supaya yang mencetak tahu mana yang masih bisa dan perlu ia isi sendiri.
 */

interface Props {
  data: DataSurat;
  bolehUbah: boolean;
  onTempel: (kunci: string) => void;
  onHapus: (kunci: string) => void;
}

const TH = "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink border-b border-slate-300";

export default function DaftarJenisWo({ data, bolehUbah, onTempel, onHapus }: Props) {
  return (
    <div className="rounded-xl border border-line overflow-x-auto">
      <table className="w-full border-collapse text-sm min-w-[620px]">
        <thead className="bg-slate-100">
          <tr>
            <th className={`${TH} text-left w-8`}>No</th>
            <th className={`${TH} text-left`}>Work Order</th>
            <th className={`${TH} text-right`}>Jumlah</th>
            <th className={`${TH} text-left`}>Sumber</th>
            <th className={`${TH} text-right w-[150px]`} />
          </tr>
        </thead>
        <tbody>
          {JENIS_SURAT.map((j, i) => {
            const nilai = data.angka[j.kunci] ?? null;
            const objek = data.objek.filter((o) => o.kunci === j.kunci).length;
            const ditempel = data.manual.has(j.kunci);
            const sumber = ditempel
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
                    {objek > 0 ? `${objek} objek di lampiran` : "tanpa lampiran"}
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
                  {j.tempel && bolehUbah && (
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => onTempel(j.kunci)}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-line text-xs text-ink-soft hover:bg-surface"
                      >
                        <ClipboardPaste size={12} /> {ditempel ? "Tempel ulang" : "Tempel dari Excel"}
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
