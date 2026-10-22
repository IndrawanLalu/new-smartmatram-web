"use client";

import { memo } from "react";
import { CircleMarker, Tooltip } from "react-leaflet";
import type { TiangBatal } from "../_hooks/useTiangBatal";

/** Tiang JTM yang dibatalkan: lingkaran kelabu putus-putus — klik untuk Pulihkan. */
export default memo(function LapisanTiangBatal({
  daftar,
  onPilih,
}: {
  daftar: TiangBatal[];
  onPilih: (t: TiangBatal) => void;
}) {
  return (
    <>
      {daftar.map((t) => (
        <CircleMarker
          key={t.id}
          center={[t.lat, t.lng]}
          radius={6}
          pathOptions={{ color: "#94A3B8", weight: 2, dashArray: "3 3", fillColor: "#475569", fillOpacity: 0.5 }}
          eventHandlers={{ click: () => onPilih(t) }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <span className="text-[11px]">
              {t.kode} · dibatalkan{t.aktif_sampai ? ` ${t.aktif_sampai}` : ""}
              {t.catatan ? ` — ${t.catatan}` : ""}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
});
