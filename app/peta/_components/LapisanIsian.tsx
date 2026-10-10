"use client";

import { CircleMarker, Tooltip } from "react-leaflet";
import type { TiangPeta } from "../_hooks/usePetaIsi";
import type { NilaiIsian } from "../_hooks/useIsianPeta";
import { BATAS_NAMA } from "./LapisanNama";

/**
 * Nilai isian JTM (mis. ukuran konduktor) tertulis di bawah tiap tiang JTM,
 * berwarna per nilai — tiang yang beda sendiri langsung terlihat. Label = DOM,
 * jadi dibatasi seperti label nama (BATAS_NAMA).
 */
export default function LapisanIsian({
  tiang,
  nilaiDi,
  warna,
}: {
  tiang: TiangPeta[];
  nilaiDi: (t: TiangPeta) => NilaiIsian | null;
  warna: Map<string, string>;
}) {
  const jtm = tiang.filter((t) => t.jaringan === "jtm");
  if (jtm.length > BATAS_NAMA) return null;
  const sudah = new Set<string>();
  return (
    <>
      {jtm.map((t) => {
        const k = `${t.id}|${t.kelompok}`;
        if (sudah.has(k)) return null;
        sudah.add(k);
        const v = nilaiDi(t);
        if (!v) return null;
        return (
          <CircleMarker key={`isi-${k}`} center={[t.lat, t.lng]} radius={0} interactive={false} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
            <Tooltip
              permanent
              direction="bottom"
              offset={[0, 6]}
              className="!bg-transparent !border-0 !shadow-none !rounded !px-0 !py-0 !text-[10px] !font-bold !text-white before:!hidden"
            >
              <span style={{ background: warna.get(v.nilai) ?? "#64748B", padding: "1px 4px", borderRadius: 3 }}>{v.label}</span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
