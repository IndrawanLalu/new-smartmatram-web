"use client";

import { memo } from "react";
import { CircleMarker, Tooltip } from "react-leaflet";
import { WARNA_KESEHATAN, type KesehatanGardu } from "../_hooks/useKesehatanPeta";

/**
 * Gardu diwarnai menurut kondisi terburuknya dari pengukuran terakhir. Calon
 * gardu sisip bercincin putih tebal supaya menonjol di antara yang merah.
 * Lingkaran di kanvas — ribuan gardu tetap ringan.
 */
function LapisanKesehatan({ gardu, onPilih }: { gardu: KesehatanGardu[]; onPilih: (g: KesehatanGardu) => void }) {
  return (
    <>
      {gardu.map((g) => (
        <CircleMarker
          key={`k-${g.ulp}-${g.kode}`}
          center={[g.lat, g.lng]}
          radius={g.calon_sisip ? 9 : 7}
          eventHandlers={{ click: () => onPilih(g) }}
          pathOptions={{
            color: g.calon_sisip ? "#ffffff" : "#0b1220",
            weight: g.calon_sisip ? 3 : 1.5,
            fillColor: WARNA_KESEHATAN[g.status],
            fillOpacity: 0.95,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="text-[11px] font-semibold">{g.kode}</span>
            <span className="block text-[10px]">
              beban {g.persen_beban ?? "—"}%
              {g.jatuh_maks_pct !== null ? ` · jatuh ${g.jatuh_maks_pct}%` : ""}
              {g.calon_sisip ? " · calon sisip" : ""}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

export default memo(LapisanKesehatan);
