"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GarduMarker } from "../_hooks/useCommandCenter";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import { normalizeFeeder } from "@/lib/feeder";

export interface FeederRiskInfo {
  level: "kritis" | "waspada" | "aman";
  score: number;
  penyulang: string;
  predicted_cause: string | null;
}

type RiskTier = FeederRiskInfo["level"] | "nodata";

function riskColor(level: RiskTier): string {
  if (level === "kritis") return "#EF4444";
  if (level === "waspada") return "#F59E0B";
  if (level === "aman") return "#10B981";
  return "#4B5563";
}

/** Ikon bertingkat: aman/no-data kecil & redup, waspada solid, kritis besar berdenyut. */
function createRiskIcon(tier: RiskTier): L.DivIcon {
  const color = riskColor(tier);
  const pulse = tier === "kritis";
  const size = tier === "kritis" ? 24 : tier === "waspada" ? 15 : 9;
  const inner = tier === "kritis" ? 11 : tier === "waspada" ? 9 : 6;
  const opacity = tier === "aman" || tier === "nodata" ? 0.5 : 1;
  const ring = pulse
    ? `<div class="map-marker-ping" style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.5;"></div>`
    : "";
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;opacity:${opacity};">
        ${ring}
        <div style="position:absolute;width:${inner}px;height:${inner}px;border-radius:50%;background:${color};
          border:1.5px solid rgba(255,255,255,0.15);box-shadow:0 0 8px ${color}AA;"></div>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

const TIER_ORDER: Record<RiskTier, number> = { nodata: 0, aman: 1, waspada: 2, kritis: 3 };

// ── CSS ping animation ─────────────────────────────────────────────────────────

const PING_CSS = `
  @keyframes map-ping {
    0% { transform: scale(1); opacity: 0.9; }
    70% { transform: scale(3); opacity: 0; }
    100% { transform: scale(3); opacity: 0; }
  }
  .map-marker-ping {
    animation: map-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getColor(ukur: PengukuranGardu | undefined): string {
  if (!ukur) return "#4B5563";
  if (ukur.persen_beban >= 80 || ukur.suhu_trafo > 60) return "#EF4444";
  if (ukur.persen_beban >= 60) return "#F59E0B";
  return "#10B981";
}

function isDanger(ukur: PengukuranGardu | undefined): boolean {
  if (!ukur) return false;
  return ukur.persen_beban >= 80 || ukur.suhu_trafo > 60;
}

function isAlert(ukur: PengukuranGardu | undefined): boolean {
  if (!ukur) return false;
  return ukur.persen_beban >= 60 || ukur.suhu_trafo > 60;
}

function createMarkerIcon(color: string, danger: boolean): L.DivIcon {
  const outerSize = danger ? 24 : 14;
  const innerSize = danger ? 10 : 8;
  const pingRing = danger
    ? `<div class="map-marker-ping" style="
        position:absolute;inset:0;border-radius:50%;
        background:${color};opacity:0.5;
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
          border:1.5px solid rgba(255,255,255,0.15);
          box-shadow:0 0 10px ${color}CC, 0 0 20px ${color}66;
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
  showAll: boolean;
  mode: "beban" | "risiko";
  feederRisk: Map<string, FeederRiskInfo>;
}

export default function MapInner({ garduList, latestData, showAll, mode, feederRisk }: Props) {
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = PING_CSS;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const ukurMap = new Map(latestData.map((d) => [d.no_gardu, d]));

  // Mode risiko: tampilkan gardu yang feeder-nya berisiko (kritis/waspada).
  if (mode === "risiko") {
    return <RiskGardu garduList={garduList} feederRisk={feederRisk} />;
  }

  // Default: hanya gardu dengan alert (warning/danger). Checkbox: semua gardu.
  const visibleGardu = showAll
    ? garduList
    : garduList.filter((g) => isAlert(ukurMap.get(g.kode)));

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
      {/* Dark tile layer — CartoDB Dark Matter */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />

      {visibleGardu.map((gardu) => {
        const ukur = ukurMap.get(gardu.kode);
        const color = getColor(ukur);
        const danger = isDanger(ukur);
        const icon = createMarkerIcon(color, danger);

        return (
          <Marker key={gardu.kode} position={[gardu.lat, gardu.lng]} icon={icon}>
            <Popup>
              <div className="text-xs min-w-[140px]">
                <div className="font-bold text-slate-800 text-sm mb-1">{gardu.nama}</div>
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

// ── Mode Risiko: gardu diwarnai sesuai risiko H+1 feeder-nya ────────────────────

function RiskGardu({
  garduList,
  feederRisk,
}: {
  garduList: GarduMarker[];
  feederRisk: Map<string, FeederRiskInfo>;
}) {
  // Semua gardu, dengan tingkat risiko feeder-nya (aman/no-data tampil sbg konteks).
  const items = garduList.map((g) => {
    const risk = feederRisk.get(normalizeFeeder(g.feeder));
    const tier: RiskTier = risk ? risk.level : "nodata";
    return { g, risk, tier };
  });
  // Urutkan agar kritis/waspada digambar paling akhir (di atas titik aman).
  items.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  // Pusatkan ke gardu berisiko bila ada, selain itu ke seluruh gardu.
  const focus = items.filter((x) => x.tier === "kritis" || x.tier === "waspada");
  const basis = focus.length > 0 ? focus.map((x) => x.g) : garduList;
  const center: [number, number] =
    basis.length > 0
      ? [
          basis.reduce((s, g) => s + g.lat, 0) / basis.length,
          basis.reduce((s, g) => s + g.lng, 0) / basis.length,
        ]
      : [-8.584, 116.116];

  return (
    <MapContainer center={center} zoom={12} className="h-full w-full rounded-b-xl" zoomControl={true}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {items.map(({ g, risk, tier }) => {
        const color = riskColor(tier);
        return (
          <Marker key={g.kode} position={[g.lat, g.lng]} icon={createRiskIcon(tier)}>
            <Popup>
              <div className="text-xs min-w-[160px]">
                <div className="font-bold text-slate-800 text-sm mb-0.5">{g.nama}</div>
                <div className="text-gray-500 font-mono mb-1.5">{g.kode}</div>
                {risk ? (
                  <>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-500">Feeder</span>
                      <span className="font-semibold text-slate-700">{risk.penyulang}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-500">Risiko H+1</span>
                      <span className="font-mono font-bold" style={{ color }}>
                        {risk.score.toFixed(0)} · {risk.level.toUpperCase()}
                      </span>
                    </div>
                    {risk.predicted_cause && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Dugaan</span>
                        <span className="font-semibold text-slate-700">{risk.predicted_cause}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-gray-400 italic">
                    Feeder {g.feeder || "—"} belum punya prediksi
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
