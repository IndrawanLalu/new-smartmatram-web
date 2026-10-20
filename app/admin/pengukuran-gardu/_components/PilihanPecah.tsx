"use client";

import { useMemo, useState } from "react";
import { EYEBROW, FIELD } from "@/app/admin/_ui";
import type { JurusanJtr, PengaturanJtr } from "../_hooks/useAnalisisJtr";
import { namaOpsi, opsiDiTiang, type GawangJtr, type NadaOpsi, type OpsiPecah } from "../_lib/rencanaJtr";

/**
 * Perbandingan titik pecah tambah jurusan + "pilih sendiri" di tiang mana
 * pun. Angka pilihan sendiri dihitung dengan rumus yang sama (opsiDiTiang);
 * yang melewati batas tetap ditampilkan, ditandai merah beserta alasannya.
 */

interface Props {
  r: JurusanJtr;
  gawang: GawangJtr[];
  pengaturan: PengaturanJtr;
  pilihan: OpsiPecah[];
  terpilih: string;
  onPilih: (kunci: string) => void;
}

export const NADA_OPSI: Record<NadaOpsi, { label: string; kelas: string }> = {
  aman: { label: "Aman", kelas: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  mendekati: { label: "Mendekati batas", kelas: "bg-amber-50 text-amber-700 border-amber-200" },
  lewat: { label: "Lewat batas", kelas: "bg-red-50 text-red-700 border-red-200" },
};

const TH = "px-2.5 py-2 text-[11px] text-accent-deep font-semibold whitespace-nowrap";
const TD = "px-2.5 py-2 tabular-nums whitespace-nowrap";
const m = (v: number) => `${Math.round(v).toLocaleString("id-ID")} m`;
const a = (v: number) => `${Math.round(v)} A`;

export default function PilihanPecah({ r, gawang, pengaturan, pilihan, terpilih, onPilih }: Props) {
  const [kode, setKode] = useState("");
  const kodeTiang = useMemo(
    () => new Map(gawang.filter((g) => g.kode).map((g) => [g.kode!.toUpperCase(), g.tiang_id])),
    [gawang],
  );
  const tiangId = kodeTiang.get(kode.trim().toUpperCase());
  const sendiri = useMemo(
    () => (tiangId ? opsiDiTiang(r, gawang, pengaturan, tiangId) : []),
    [r, gawang, pengaturan, tiangId],
  );
  const baris = [...pilihan, ...sendiri];

  return (
    <section className="space-y-2">
      <p className={EYEBROW}>Pilihan titik pecah — klik untuk memilih</p>
      <div className="overflow-x-auto border border-line rounded-lg">
        <table className="w-full text-xs">
          <thead className="kepala-kit">
            <tr className="bg-navy-50 text-left">
              <th className={TH}>Pilihan</th>
              <th className={TH}>Titik pecah → cabang pindah</th>
              <th className={`${TH} text-right`}>Kabel baru</th>
              <th className={`${TH} text-right`}>Jur. baru</th>
              <th className={`${TH} text-right`}>Jur. lama</th>
              <th className={`${TH} text-right`}>Pindah SR · tiang</th>
              <th className={`${TH} text-right`} title="Lintasan terjauh jurusan baru / lama">Terjauh baru/lama</th>
              <th className={`${TH} text-right`} title="Perkiraan jatuh tegangan terburuk turun">Tegangan turun</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((o) => (
              <tr
                key={o.kunci}
                onClick={() => onPilih(o.kunci)}
                className={`border-t border-line align-top cursor-pointer ${terpilih === o.kunci ? "bg-navy-50" : "hover:bg-surface"}`}
              >
                <td className="px-2.5 py-2 min-w-36">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${terpilih === o.kunci ? "border-navy-600 bg-navy-600" : "border-line"}`} />
                    <span className="font-semibold text-ink">{o.label.join(" · ")}</span>
                  </span>
                  <span className={`inline-block mt-1 px-1.5 py-px rounded-full text-[10px] font-semibold border ${NADA_OPSI[o.nada].kelas}`}>
                    {NADA_OPSI[o.nada].label}
                  </span>
                </td>
                <td className="px-2.5 py-2 min-w-48">
                  <span className="block text-ink">{namaOpsi(o)}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {[o.percabangan && "percabangan", o.pemerataan && "+ pemerataan fasa"].filter(Boolean).join(" · ")}
                  </span>
                  {o.peringatan.map((p) => (
                    <span key={p} className={`block text-[11px] ${o.nada === "lewat" ? "text-red-600" : "text-amber-700"}`}>{p}</span>
                  ))}
                </td>
                <td className={`${TD} text-right font-semibold text-ink`}>{m(o.kabelBaru)}</td>
                <td className={`${TD} text-right`}>{a(o.iBaru)}</td>
                <td className={`${TD} text-right`}>{a(o.iLama)}</td>
                <td className={`${TD} text-right text-ink-soft`}>{o.srPindah} · {o.tiangPindah}</td>
                <td className={`${TD} text-right text-ink-soft`}>{m(o.jauhBaru)} / {m(o.jauhLama)}</td>
                <td className={`${TD} text-right`}>±{o.turunPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label htmlFor="pecah-sendiri" className="text-ink-soft">Pilih sendiri titik pecah:</label>
        <input
          id="pecah-sendiri"
          list="tiang-jurusan"
          value={kode}
          onChange={(e) => setKode(e.target.value)}
          placeholder={`kode tiang, mis. ${gawang.find((g) => g.kode)?.kode ?? ""}`}
          className={`${FIELD} w-56`}
        />
        <datalist id="tiang-jurusan">
          {[...kodeTiang.keys()].sort().map((k) => <option key={k} value={k} />)}
        </datalist>
        {kode.trim() && !tiangId && <span className="text-amber-700">Tiang tidak ada di jurusan {r.jurusan}.</span>}
        {tiangId && !sendiri.length && <span className="text-amber-700">Tiang ujung — tidak ada cabang yang bisa dipindah.</span>}
        <span className="text-ink-muted">atau klik tiangnya di peta.</span>
      </div>
      <p className="text-[11px] text-ink-muted">
        Arus dihitung dari pembagian tarikan SR. &quot;+ pemerataan fasa&quot; memakai rata-rata ketiga fasa, jadi baru berlaku bila fasanya
        diratakan sekalian.
      </p>
    </section>
  );
}
