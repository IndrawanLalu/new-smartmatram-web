"use client";

import { Plus, Trash2 } from "lucide-react";
import { EYEBROW, FIELD } from "@/app/admin/_ui";
import type { MaterialRefIsian } from "../_hooks/useUsulanJtr";
import { LABEL_DASAR, LABEL_MATERIAL, type DasarMaterial, type PekerjaanMaterial } from "../_lib/materialJtr";

/**
 * Daftar material bawaan usulan perbaikan JTR (Pengaturan, UP3). Jumlah di
 * usulan = ⌈faktor × dasar⌉; user tetap memeriksanya sebelum WO terbit.
 */

interface Props {
  isi: MaterialRefIsian[];
  boleh: boolean;
  onUbah: (isi: MaterialRefIsian[]) => void;
}

const PEKERJAAN = Object.keys(LABEL_MATERIAL) as PekerjaanMaterial[];
const SEL = `${FIELD} h-8 text-xs`;

export default function MaterialBawaanJtr({ isi, boleh, onUbah }: Props) {
  const ubah = (i: number, x: Partial<MaterialRefIsian>) => onUbah(isi.map((b, j) => (j === i ? { ...b, ...x } : b)));

  return (
    <section className="space-y-3">
      <p className={EYEBROW}>Material bawaan usulan</p>
      {PEKERJAAN.map((p) => (
        <div key={p} className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">{LABEL_MATERIAL[p]}</p>
          {isi.map((m, i) =>
            m.pekerjaan !== p ? null : (
              <div key={i} className="flex items-center gap-1.5">
                <input value={m.nama} disabled={!boleh} onChange={(e) => ubah(i, { nama: e.target.value })} className={`${SEL} flex-1 min-w-0`} />
                <input value={m.satuan} disabled={!boleh} onChange={(e) => ubah(i, { satuan: e.target.value })} className={`${SEL} w-14`} title="Satuan" />
                <input
                  type="number" min={0} step="any" value={m.faktor} disabled={!boleh}
                  onChange={(e) => ubah(i, { faktor: Math.max(0, Number(e.target.value)) })}
                  className={`${SEL} w-16 text-right`} title="Faktor"
                />
                <select value={m.dasar} disabled={!boleh} onChange={(e) => ubah(i, { dasar: e.target.value as DasarMaterial })} className={`${SEL} w-40`}>
                  {(Object.keys(LABEL_DASAR) as DasarMaterial[]).map((d) => <option key={d} value={d}>{LABEL_DASAR[d]}</option>)}
                </select>
                {boleh && (
                  <button onClick={() => onUbah(isi.filter((_, j) => j !== i))} className="p-1 text-ink-muted hover:text-red-600" title="Hapus">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ),
          )}
          {boleh && (
            <button
              onClick={() =>
                onUbah([...isi, { pekerjaan: p, nama: "", satuan: "bh", dasar: "tetap", faktor: 1, urutan: isi.filter((x) => x.pekerjaan === p).length + 1 }])
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:underline"
            >
              <Plus size={13} /> Tambah material
            </button>
          )}
        </div>
      ))}
      <p className="text-xs text-ink-muted">
        Jumlah = faktor × dasar, dibulatkan ke atas. &quot;{"{kabel}"}&quot; di nama diganti ukuran kabel jurusan. Sisip gardu dan naik daya
        tidak punya bawaan — materialnya diisi saat menyimpan usulan.
      </p>
    </section>
  );
}
