"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GarduMarker } from "../_hooks/useCommandCenter";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";

// ── CSS keyframe untuk ping animation ─────────────────────────────────────────

const PING_CSS = `
  @keyframes map-ping {
    0% { transform: scale(1); opacity: 0.8; }
    70% { transform: scale(2.8); opacity: 0; }
    100% { transform: scale(2.8); opacity: 0; }
  }
  .map-marker-ping {
    animation: map-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getColor(ukur: PengukuranGardu | undefined): string {
  if (!ukur) return "#9CA3AF";
  if (ukur.persen_beban >= 80 || ukur.suhu_trafo > 60) return "#EF4444";
  if (ukur.persen_beban >= 60) return "#F59E0B";
  return "#10B981";
}

function isDanger(ukur: PengukuranGardu | undefined): boolean {
  if (!ukur) return false;
  return ukur.persen_beban >= 80 || ukur.suhu_trafo > 60;
}

function createMarkerIcon(color: string, danger: boolean): L.DivIcon {
  const outerSize = danger ? 22 : 14;
  const innerSize = danger ? 11 : 10;
  const pingRing = danger
    ? `<div class="map-marker-ping" style="
        position:absolute;inset:0;border-radius:50%;
        background:${color};
      "></div>`
    : "";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        position:relative;
        width:${outerSize}px;height:${outerSize}px;
        display:flex;align-items:center;justify-content:center;
      ">
        ${pingRing}
        <div style="
          position:absolute;
          width:${innerSize}px;height:${innerSize}px;
          border-radius:50%;
          background:${color};
          border:2px solid white;
          box-shadow:0 1px 5px rgba(0,0,0,0.35);
        "></div>
      </div>
    `,
    iconSize: [outerSize, outerSize],
    iconAnchor: [outerSize / 2, outerSize / 2],
    popupAnchor: [0, -(outerSize / 2)],
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  garduList: GarduMarker[];
  latestData: PengukuranGardu[];
}

export default function MapInner({ garduList, latestData }: Props) {
  // Inject CSS ping animation ke dokumen
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = PING_CSS;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const ukurMap = new Map(latestData.map((d) => [d.no_gardu, d]));

  const center: [number, number] =
    garduList.length > 0
      ? [
          garduList.reduce((s, g) => s + g.lat, 0) / garduList.length,
          garduList.reduce((s, g) => s + g.lng, 0) / garduList.length,
        ]
      : [-8.584, 116.116];

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="h-full w-full rounded-b-xl"
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
      />

      {garduList.map((gardu) => {
        const ukur = ukurMap.get(gardu.kode);
        const color = getColor(ukur);
        const danger = isDanger(ukur);
        const icon = createMarkerIcon(color, danger);

        return (
          <Marker key={gardu.kode} position={[gardu.lat, gardu.lng]} icon={icon}>
            <Popup>
              <div className="text-xs min-w-[140px]">
                <div className="font-bold text-[#1B2631] text-sm mb-1">{gardu.nama}</div>
                <div className="text-gray-500 font-mono mb-2">{gardu.kode}</div>
                {ukur ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Beban</span>
                      <span className={`font-mono font-bold ${
                        ukur.persen_beban >= 80 ? "text-red-600" : ukur.persen_beban >= 60 ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        {ukur.persen_beban.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">KVA</span>
                      <span className="font-mono">{ukur.beban_kva.toFixed(1)} / {ukur.kva_trafo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Suhu</span>
                      <span className={`font-mono font-bold ${ukur.suhu_trafo > 60 ? "text-red-600" : ""}`}>
                        {ukur.suhu_trafo}°C
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Diukur</span>
                      <span className="font-mono text-[10px]">{ukur.tanggal_pengukuran}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 italic">Belum ada pengukuran</div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
