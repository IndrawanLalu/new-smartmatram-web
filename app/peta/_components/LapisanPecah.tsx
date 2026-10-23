"use client";

import { CircleMarker, Polyline, Tooltip } from "react-leaflet";
import { WARNA_POTONGAN, type PratinjauPecah } from "../_hooks/usePecahSegmen";

/**
 * Pratinjau Pecah segmen di peta: tiap potongan satu warna (urutan = panel),
 * titik potong bulat bertepi gelap. Tidak bisa diklik — klik diteruskan ke
 * tiang di bawahnya (titik potong berikutnya).
 */
export default function LapisanPecah({ hasil }: { hasil: PratinjauPecah }) {
  return (
    <>
      {hasil.bagian.map((b, i) => {
        const warna = WARNA_POTONGAN[i % WARNA_POTONGAN.length];
        return b.garis.map((g, j) => (
          <Polyline
            key={`pc-${b.akar_id}-${j}`}
            positions={[[g[0], g[1]], [g[2], g[3]]]}
            interactive={false}
            pathOptions={{ color: warna, weight: 6, opacity: 0.95 }}
          />
        ));
      })}
      {hasil.bagian.map((b, i) =>
        !b.asal && b.titik.lat !== null && b.titik.lng !== null ? (
          <CircleMarker
            key={`pct-${b.akar_id}`}
            center={[b.titik.lat, b.titik.lng]}
            radius={9}
            interactive={false}
            pathOptions={{ color: "#0a1628", weight: 3, fillColor: WARNA_POTONGAN[i % WARNA_POTONGAN.length], fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]} className="!bg-[#0d1b2a] !text-[#e2e8f0] !border-0">
              <span className="text-[11px] font-semibold">✂ {b.akar_kode}</span>
            </Tooltip>
          </CircleMarker>
        ) : null,
      )}
    </>
  );
}
