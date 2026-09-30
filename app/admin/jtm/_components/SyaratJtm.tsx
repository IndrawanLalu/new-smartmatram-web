"use client";

import { FIELD } from "@/app/admin/_ui";
import type { ItemIsian, OpsiIsian, Syarat } from "../_hooks/useJtmIsian";

/**
 * "Item ini hanya ditanyakan kalau …" — misalnya Konstruksi MVTIC hanya kalau
 * Jenis Konduktor = MVTIC, atau Posisi pohon hanya kalau Vegetasi bukan Aman.
 *
 * Penentu hanya item pilihan yang TIDAK bersyarat sendiri: syarat bertingkat
 * ditolak database, jadi tidak ditawarkan di sini sejak awal.
 */
export default function SyaratJtm({
  nilai,
  onUbah,
  item,
  opsiPer,
  kodeSendiri,
}: {
  nilai: Syarat;
  onUbah: (s: Syarat) => void;
  item: ItemIsian[];
  opsiPer: (kode: string) => OpsiIsian[];
  kodeSendiri?: string;
}) {
  const calon = item.filter((i) => i.tipe === "pilihan" && !i.syaratItem && i.kode !== kodeSendiri);
  const opsi = nilai.item ? opsiPer(nilai.item) : [];

  const centang = (kode: string) =>
    onUbah({
      ...nilai,
      nilai: nilai.nilai.includes(kode) ? nilai.nilai.filter((x) => x !== kode) : [...nilai.nilai, kode],
    });

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-soft">Ditanyakan</span>
      <select
        value={nilai.item ?? ""}
        onChange={(e) => onUbah({ item: e.target.value || null, nilai: [], negasi: false })}
        className={`${FIELD} h-8 w-[210px]`}
      >
        <option value="">selalu</option>
        {calon.map((i) => (
          <option key={i.kode} value={i.kode}>
            hanya kalau {i.nama}
          </option>
        ))}
      </select>
      {nilai.item && (
        <>
          <select
            value={nilai.negasi ? "bukan" : "sama"}
            onChange={(e) => onUbah({ ...nilai, negasi: e.target.value === "bukan" })}
            className={`${FIELD} h-8 w-[90px]`}
          >
            <option value="sama">=</option>
            <option value="bukan">bukan</option>
          </select>
          {opsi.map((o) => (
            <label key={o.kode} className="inline-flex items-center gap-1 text-ink">
              <input type="checkbox" checked={nilai.nilai.includes(o.kode)} onChange={() => centang(o.kode)} />
              {o.label}
            </label>
          ))}
        </>
      )}
    </div>
  );
}
