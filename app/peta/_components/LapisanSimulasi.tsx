"use client";

import { memo } from "react";
import { CircleMarker, Polyline, Tooltip } from "react-leaflet";
import type { HasilSimulasi } from "../_hooks/useSimulasiBuka";

/**
 * Wilayah yang padam kalau alat hubung dibuka: gawang hilir jingga tebal,
 * gardu terdampak bercincin jingga, alat hubung hilir bercincin kuning, dan
 * alatnya sendiri bercincin merah. Semuanya di kanvas.
 */
const JINGGA = "#FB923C";

function LapisanSimulasi({ hasil }: { hasil: HasilSimulasi | null }) {
  if (!hasil) return null;
  return (
    <>
      {hasil.bentang.map((b, i) => (
        <Polyline
          key={`sim-${i}`}
          positions={[
            [b[0], b[1]],
            [b[2], b[3]],
          ]}
          pathOptions={{ color: JINGGA, weight: 5, opacity: 0.85 }}
          interactive={false}
        />
      ))}
      {hasil.gardu.map((g) => (
        <CircleMarker key={`simg-${g.kode}`} center={[g.lat, g.lng]} radius={11} pathOptions={{ color: JINGGA, weight: 3, fillColor: JINGGA, fillOpacity: 0.25 }}>
          <Tooltip direction="top" offset={[0, -10]}>
            <span className="text-[11px] font-semibold">{g.kode} padam</span>
            <span className="block text-[10px]">
              {g.daya ?? "—"} kVA{g.beban_kva !== null ? ` · beban ${g.beban_kva} kVA` : ""}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
      {hasil.alat_hilir.map((x) => (
        <CircleMarker key={`sima-${x.kode}`} center={[x.lat, x.lng]} radius={9} pathOptions={{ color: "#FACC15", weight: 3, fillOpacity: 0 }}>
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="text-[11px]">{x.kode} ({x.penanda}) ikut mati</span>
          </Tooltip>
        </CircleMarker>
      ))}
      <CircleMarker
        center={[hasil.alat.lat, hasil.alat.lng]}
        radius={13}
        pathOptions={{ color: "#EF4444", weight: 3, fillOpacity: 0 }}
        interactive={false}
      />
    </>
  );
}

export default memo(LapisanSimulasi);
