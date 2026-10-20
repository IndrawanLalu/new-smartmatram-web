"use client";

import { Plus, Trash2 } from "lucide-react";
import { EYEBROW, FIELD } from "@/app/admin/_ui";
import type { BarisMaterial } from "../_lib/materialJtr";

/**
 * Daftar material usulan/WO. Tanpa `onUbah` = hanya dibaca. Jumlah 0 boleh
 * (tidak ikut tertulis di tugas), supaya baris bawaan tidak perlu dihapus.
 */

interface Props {
  isi: BarisMaterial[];
  onUbah?: (isi: BarisMaterial[]) => void;
  judul?: string;
}

const SEL = `${FIELD} py-1 text-xs`;

export default function TabelMaterial({ isi, onUbah, judul }: Props) {
  const ubah = (i: number, x: Partial<BarisMaterial>) => onUbah?.(isi.map((b, j) => (j === i ? { ...b, ...x } : b)));

  return (
    <section className="space-y-1.5">
      <p className={EYEBROW}>{judul ?? `Material ${onUbah ? "— periksa dan sesuaikan" : ""}`}</p>
      {isi.length === 0 && !onUbah ? (
        <p className="text-sm text-ink-muted">Tidak ada material.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="py-1 font-semibold">Material</th>
              <th className="py-1 font-semibold text-right w-24">Jumlah</th>
              <th className="py-1 font-semibold w-20 pl-2">Satuan</th>
              {onUbah && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {isi.map((b, i) =>
              onUbah ? (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-2">
                    <input value={b.nama} onChange={(e) => ubah(i, { nama: e.target.value })} className={`${SEL} w-full`} />
                  </td>
                  <td className="py-1">
                    <input
                      type="number" min={0} value={b.jumlah}
                      onChange={(e) => ubah(i, { jumlah: Math.max(0, Number(e.target.value)) })}
                      className={`${SEL} w-24 text-right`}
                    />
                  </td>
                  <td className="py-1 pl-2">
                    <input value={b.satuan} onChange={(e) => ubah(i, { satuan: e.target.value })} className={`${SEL} w-20`} />
                  </td>
                  <td className="py-1 text-right">
                    <button onClick={() => onUbah(isi.filter((_, j) => j !== i))} className="p-1 text-ink-muted hover:text-red-600" title="Hapus">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={i} className={`border-t border-line ${b.jumlah > 0 ? "" : "text-ink-muted"}`}>
                  <td className="py-1.5">{b.nama}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.jumlah.toLocaleString("id-ID")}</td>
                  <td className="py-1.5 pl-2">{b.satuan}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
      {onUbah && (
        <button
          onClick={() => onUbah([...isi, { nama: "", satuan: "bh", jumlah: 1 }])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:underline"
        >
          <Plus size={13} /> Tambah material
        </button>
      )}
    </section>
  );
}
