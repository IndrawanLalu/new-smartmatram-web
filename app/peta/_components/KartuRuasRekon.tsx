"use client";

import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { ITEM_TIANG, jumlahItem, LABEL_ITEM, panjangRuas, ujungRuas, type RuasRekonduktor } from "@/lib/rekonduktorJtr";
import type { RekonduktorPetaState } from "../_hooks/useRekonduktorPeta";
import { BIDANG, GARIS } from "../_ui";

/**
 * Satu ruas Rekonduktor JTR di panel peta: ringkas, kabel pengganti, dan
 * tabel per tiang (SR, suspension, fixed, LA, treckschoer, drugschoer,
 * kontramast) yang bisa diubah selama Draf.
 */

const PILIH = "min-w-0 flex-1 rounded-lg border px-1.5 py-1 text-xs";
const ANGKA = "w-7 rounded border text-center text-[11px] py-0.5 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none";

interface Props {
  s: RekonduktorPetaState;
  r: RuasRekonduktor;
  nomor: number;
}

export default function KartuRuasRekon({ s, r, nomor }: Props) {
  const buka = s.terbuka === r.id;
  const m = panjangRuas(r);
  return (
    <div className="rounded-lg border p-2 space-y-1.5" style={{ borderColor: GARIS }}>
      <div className="flex items-start gap-1.5">
        <button onClick={() => s.setTerbuka(buka ? null : r.id)} className="mt-0.5 text-gray-400 hover:text-white" title="Rincian per tiang">
          {buka ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white">
            Ruas {nomor}{r.jurusan ? ` · Jurusan ${r.jurusan}` : ""} <span className="font-normal text-gray-400">{ujungRuas(r, s.gardu)}</span>
          </p>
          <p className="text-gray-400">
            {r.tiang.length} tiang · {Math.round(m).toLocaleString("id-ID")} m · SR {jumlahItem(r, "sr")}
            {r.kabel_lama ? ` · kabel lama ${r.kabel_lama}` : ""}
          </p>
        </div>
        {s.draf && (
          <button onClick={() => s.hapusRuas(r.id)} className="p-0.5 text-gray-400 hover:text-red-400" title="Hapus ruas">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 shrink-0">Pengganti</span>
        <select
          value={r.kabel_jenis ?? ""} disabled={!s.draf} onChange={(e) => s.ubahRuas(r.id, { kabel_jenis: e.target.value || null })}
          className={PILIH} style={{ background: BIDANG, borderColor: GARIS }}
        >
          <option value="">Jenis kabel…</option>
          {s.opsiKabel.jenis.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select
          value={r.kabel_ukuran ?? ""} disabled={!s.draf} onChange={(e) => s.ubahRuas(r.id, { kabel_ukuran: e.target.value || null })}
          className={PILIH} style={{ background: BIDANG, borderColor: GARIS }}
        >
          <option value="">Ukuran…</option>
          {s.opsiKabel.ukuran.map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>

      {buka && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-semibold py-0.5">Tiang</th>
                <th className="text-right font-semibold px-1" title="Panjang gawang ke tiang sebelumnya">m</th>
                {ITEM_TIANG.map((k) => <th key={k} className="font-semibold" title={LABEL_ITEM[k].panjang}>{LABEL_ITEM[k].pendek}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.tiang.map((t) => (
                <tr key={t.tiang_id} className="border-t" style={{ borderColor: GARIS }}>
                  <td className="py-0.5 pr-1 max-w-24 truncate" title={t.stay ? `Stay menurut inspeksi: ${t.stay}` : undefined}>{t.kode ?? "?"}</td>
                  <td className="text-right px-1 tabular-nums text-gray-400">{t.panjang_m ? Math.round(t.panjang_m) : "—"}</td>
                  {ITEM_TIANG.map((k) => (
                    <td key={k} className="text-center py-0.5">
                      <input
                        type="number" min={0} value={t[k]} disabled={!s.draf}
                        onChange={(e) => s.ubahTiang(r.id, t.tiang_id, k, Number(e.target.value))}
                        className={`${ANGKA} ${t[k] ? "text-white" : "text-gray-500"}`} style={{ background: BIDANG, borderColor: GARIS }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-gray-500">
            Bawaan: SR & stay dari data tiang, Sus/Fix/LA dari inspeksi JTR, kontramast diisi sendiri. Tiang yang sudah ada di ruas lain: SR & stay 0.
          </p>
        </div>
      )}
    </div>
  );
}
