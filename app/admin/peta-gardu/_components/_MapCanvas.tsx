"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  LayerGroup,
  ScaleControl,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { Gardu, Jalur, Tiang, TiangRef, SelectedFeature, DrawingTool } from "../_hooks/types";
import DrawingToolbar from "./_DrawingToolbar";
import TileSwitcher, { TILE_LAYERS } from "./_TileSwitcher";
import CoordDisplay from "./_CoordDisplay";
import MeasureOverlay from "./_MeasureOverlay";

// ── Ping animation CSS ────────────────────────────────────────────────────────

const PING_CSS = `
  @keyframes map-ping {
    0% { transform: scale(1); opacity: 0.9; }
    70% { transform: scale(3); opacity: 0; }
    100% { transform: scale(3); opacity: 0; }
  }
  .map-marker-ping { animation: map-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite; }
`;

const SNAP_PX = 20; // snap threshold in pixels

// ── Color helpers ─────────────────────────────────────────────────────────────

function garduColor(g: Gardu): string {
  if (g.beban_persen == null) return "#4B5563";
  if (g.beban_persen >= 80) return "#EF4444";
  if (g.beban_persen >= 60) return "#F59E0B";
  return "#10B981";
}

function tiangColor(t: Tiang): string {
  switch (t.kondisi) {
    case "Rusak": return "#EF4444";
    case "Retak": case "Miring": return "#F59E0B";
    case "Baik": return "#10B981";
    default: return "#4B5563";
  }
}

function createGarduIcon(color: string, selected: boolean): L.DivIcon {
  const size = selected ? 28 : (color === "#EF4444" ? 22 : 16);
  const ping = color === "#EF4444"
    ? `<div class="map-marker-ping" style="position:absolute;inset:-4px;border-radius:50%;background:${color};opacity:0.3;"></div>`
    : "";
  const ring = selected
    ? `<div style="position:absolute;inset:-3px;border-radius:3px;border:2px solid ${color};opacity:0.8;"></div>`
    : "";
  const svg = `<svg viewBox="0 0 16 16" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 0 3px ${color}BB);">
    <polygon points="8,1 15,7 1,7" fill="${color}" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
    <rect x="3" y="7" width="10" height="8" fill="${color}" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
    <rect x="6" y="10" width="4" height="5" fill="rgba(0,0,0,0.3)"/>
  </svg>`;

  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      ${ping}
      ${ring}
      ${svg}
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

// ── Find nearest TiangRef within snap threshold ───────────────────────────────

function findSnapTarget(
  latlng: L.LatLng,
  tiangRef: TiangRef[],
  map: L.Map
): TiangRef | null {
  const clickPt = map.latLngToLayerPoint(latlng);
  let minDist = SNAP_PX;
  let target: TiangRef | null = null;
  for (const t of tiangRef) {
    const tPt = map.latLngToLayerPoint(L.latLng(t.lat, t.lng));
    const dist = clickPt.distanceTo(tPt);
    if (dist < minDist) {
      minDist = dist;
      target = t;
    }
  }
  return target;
}

// ── Map ref sync ──────────────────────────────────────────────────────────────

function MapRefSync({ mapRef }: { mapRef: RefObject<LeafletMap | null> }) {
  const map = useMap();
  useEffect(() => {
    (mapRef as React.MutableRefObject<LeafletMap | null>).current = map;
  }, [map, mapRef]);
  return null;
}

// ── Click + hover handler ─────────────────────────────────────────────────────

function MapEventHandler({
  activeTool,
  onMapClick,
  coordRef,
  tiangRef,
  snapEnabled,
  onSnapTargetChange,
}: {
  activeTool: DrawingTool;
  onMapClick: (latlng: [number, number]) => void;
  coordRef: RefObject<HTMLDivElement | null>;
  tiangRef: TiangRef[];
  snapEnabled: boolean;
  onSnapTargetChange: (t: TiangRef | null) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (activeTool === "select") return;
      let latlng: [number, number] = [e.latlng.lat, e.latlng.lng];

      // Snap to nearest TiangRef when drawing jalur
      if (activeTool === "drawJalur" && snapEnabled && tiangRef.length > 0) {
        const target = findSnapTarget(e.latlng, tiangRef, map);
        if (target) latlng = [target.lat, target.lng];
      }

      onMapClick(latlng);
    },
    mousemove(e) {
      if (coordRef.current) {
        coordRef.current.textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
      }
      // Update snap highlight when drawing jalur
      if (activeTool === "drawJalur" && snapEnabled && tiangRef.length > 0) {
        onSnapTargetChange(findSnapTarget(e.latlng, tiangRef, map));
      } else {
        onSnapTargetChange(null);
      }
    },
  });
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  filteredGardu: Gardu[];
  filteredJalur: Jalur[];
  filteredTiang: Tiang[];
  selectedFeature: SelectedFeature | null;
  onFeatureSelect: (f: SelectedFeature) => void;
  activeTool: DrawingTool;
  setActiveTool: (t: DrawingTool) => void;
  currentPoints: [number, number][];
  undoLastPoint: () => void;
  onFinishDrawJalur: () => void;
  measurePoints: [number, number][];
  totalDistanceM: number;
  clearMeasure: () => void;
  onMapClick: (latlng: [number, number]) => void;
  mapRef: RefObject<LeafletMap | null>;
  tiangRef: TiangRef[];
  showTiangRef: boolean;
  snapEnabled: boolean;
}

export default function MapCanvas({
  filteredGardu,
  filteredJalur,
  filteredTiang,
  selectedFeature,
  onFeatureSelect,
  activeTool,
  setActiveTool,
  currentPoints,
  undoLastPoint,
  onFinishDrawJalur,
  measurePoints,
  totalDistanceM,
  clearMeasure,
  onMapClick,
  mapRef,
  tiangRef,
  showTiangRef,
  snapEnabled,
}: Props) {
  const [activeTile, setActiveTile] = useState(TILE_LAYERS[0]);
  const coordRef = useRef<HTMLDivElement | null>(null);
  // Track snap target separately from state to minimize re-renders
  const snapIdRef = useRef<string | null>(null);
  const [snapHighlight, setSnapHighlight] = useState<[number, number] | null>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = PING_CSS;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const handleSnapTargetChange = (t: TiangRef | null) => {
    const id = t?.id ?? null;
    if (id !== snapIdRef.current) {
      snapIdRef.current = id;
      setSnapHighlight(t ? [t.lat, t.lng] : null);
    }
  };

  const center: [number, number] =
    filteredGardu.length > 0
      ? [
          filteredGardu.reduce((s, g) => s + g.lat, 0) / filteredGardu.length,
          filteredGardu.reduce((s, g) => s + g.lng, 0) / filteredGardu.length,
        ]
      : [-8.584, 116.116];

  const cursorClass =
    activeTool === "select" ? "cursor-default"
    : "cursor-crosshair";

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={13}
        className={`h-full w-full ${cursorClass}`}
        zoomControl={false}
      >
        <MapRefSync mapRef={mapRef} />
        <MapEventHandler
          activeTool={activeTool}
          onMapClick={onMapClick}
          coordRef={coordRef}
          tiangRef={showTiangRef && snapEnabled ? tiangRef : []}
          snapEnabled={snapEnabled}
          onSnapTargetChange={handleSnapTargetChange}
        />

        <TileLayer
          key={activeTile.id}
          url={activeTile.url}
          attribution={activeTile.attribution}
          maxZoom={activeTile.maxZoom}
        />
        <ScaleControl position="bottomleft" />

        {/* Jalur polylines */}
        <LayerGroup>
          {filteredJalur.map((jalur) => {
            if (jalur.koordinat.length < 2) return null;
            const isSelected = selectedFeature?.type === "jalur" && selectedFeature.id === jalur.id;
            return (
              <Polyline
                key={jalur.id}
                positions={jalur.koordinat}
                pathOptions={{
                  color: jalur.warna ?? "#00897B",
                  weight: isSelected ? 5 : 3,
                  opacity: isSelected ? 1 : 0.8,
                  dashArray: jalur.status === "Warning" ? "10, 8" : undefined,
                }}
                eventHandlers={{
                  click: () =>
                    onFeatureSelect({ type: "jalur", id: jalur.id, data: jalur }),
                }}
              >
                <Popup>
                  <div className="text-xs min-w-40 space-y-1">
                    <div className="font-bold text-slate-800 text-sm">{jalur.nama ?? "-"}</div>
                    <div className="text-gray-500">Feeder: {jalur.feeder ?? "-"}</div>
                    {jalur.jarak != null && (
                      <div className="text-gray-500">
                        Panjang: {jalur.jarak >= 1000
                          ? `${(jalur.jarak / 1000).toFixed(2)} km`
                          : `${jalur.jarak.toFixed(0)} m`}
                      </div>
                    )}
                    {jalur.penghantar && (
                      <div className="text-gray-500">Penghantar: {jalur.penghantar}</div>
                    )}
                  </div>
                </Popup>
              </Polyline>
            );
          })}
        </LayerGroup>

        {/* Supabase tiang circle markers */}
        <LayerGroup>
          {filteredTiang.map((t) => {
            const isSelected = selectedFeature?.type === "tiang" && selectedFeature.id === t.id;
            const color = tiangColor(t);
            return (
              <CircleMarker
                key={t.id}
                center={[t.lat, t.lng]}
                radius={isSelected ? 7 : 5}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.9,
                  color: isSelected ? "#ffffff" : color,
                  weight: isSelected ? 2 : 1,
                }}
                eventHandlers={{
                  click: () =>
                    onFeatureSelect({ type: "tiang", id: t.id, data: t }),
                }}
              >
                <Popup>
                  <div className="text-xs min-w-35 space-y-1">
                    <div className="font-bold text-slate-800 text-sm">{t.kode}</div>
                    <div className="text-gray-500">{t.jenis ?? "?"} · {t.tinggi ?? "?"}m</div>
                    <div className="text-gray-500">Kondisi: {t.kondisi ?? "-"}</div>
                    {t.feeder && <div className="text-gray-500">Feeder: {t.feeder}</div>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </LayerGroup>

        {/* Gardu markers */}
        <LayerGroup>
          {filteredGardu.map((gardu) => {
            const isSelected =
              selectedFeature?.type === "gardu" && selectedFeature.id === gardu.kode;
            const color = garduColor(gardu);
            const icon = createGarduIcon(color, isSelected);
            return (
              <Marker
                key={gardu.kode}
                position={[gardu.lat, gardu.lng]}
                icon={icon}
                eventHandlers={{
                  click: () =>
                    onFeatureSelect({ type: "gardu", id: gardu.kode, data: gardu }),
                }}
              >
                <Popup>
                  <div className="text-xs min-w-40 space-y-1">
                    <div className="font-bold text-slate-800 text-sm">{gardu.nama}</div>
                    <div className="text-gray-500 font-mono">{gardu.kode}</div>
                    <div className="text-gray-500">Feeder: {gardu.feeder ?? "-"}</div>
                    {gardu.beban_persen != null ? (
                      <div className={`font-mono font-bold ${
                        gardu.beban_persen >= 80 ? "text-red-600"
                        : gardu.beban_persen >= 60 ? "text-amber-600"
                        : "text-emerald-600"
                      }`}>
                        Beban: {gardu.beban_persen.toFixed(1)}%
                      </div>
                    ) : (
                      <div className="text-gray-400 italic text-[11px]">Belum diukur</div>
                    )}
                    {gardu.daya && (
                      <div className="text-gray-500">Daya: {gardu.daya} KVA</div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </LayerGroup>

        {/* TiangRef layer — referensi dari spreadsheet */}
        {showTiangRef && tiangRef.length > 0 && (
          <LayerGroup>
            {tiangRef.map((t) => (
              <CircleMarker
                key={t.id}
                center={[t.lat, t.lng]}
                radius={3}
                pathOptions={{
                  fillColor: "#22D3EE",
                  fillOpacity: 0.75,
                  color: "#0891B2",
                  weight: 1,
                }}
              >
                <Popup>
                  <div className="text-xs min-w-30 space-y-1">
                    <div className="font-bold text-cyan-700 text-sm">{t.kode}</div>
                    <div className="text-gray-400 text-[10px] uppercase tracking-wider">Tiang Referensi</div>
                    {t.feeder && <div className="text-gray-500">Feeder: {t.feeder}</div>}
                    {t.alamat && <div className="text-gray-500">{t.alamat}</div>}
                    <div className="font-mono text-gray-400 text-[10px]">
                      {t.lat.toFixed(6)}, {t.lng.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
            {/* Snap highlight ring */}
            {snapHighlight && activeTool === "drawJalur" && (
              <CircleMarker
                center={snapHighlight}
                radius={10}
                pathOptions={{
                  fillOpacity: 0,
                  color: "#22D3EE",
                  weight: 2,
                  dashArray: "4,3",
                }}
              />
            )}
          </LayerGroup>
        )}

        {/* Drawing preview */}
        {activeTool === "drawJalur" && currentPoints.length > 0 && (
          <LayerGroup>
            <Polyline
              positions={currentPoints}
              pathOptions={{ color: "#00897B", weight: 2, dashArray: "8,6", opacity: 0.9 }}
            />
            {currentPoints.map((pt, i) => (
              <CircleMarker
                key={i}
                center={pt}
                radius={4}
                pathOptions={{ fillColor: "#00897B", fillOpacity: 1, color: "#fff", weight: 1 }}
              />
            ))}
          </LayerGroup>
        )}

        {/* Measure preview */}
        {activeTool === "measure" && measurePoints.length > 0 && (
          <LayerGroup>
            <Polyline
              positions={measurePoints}
              pathOptions={{ color: "#60A5FA", weight: 2, dashArray: "6,5", opacity: 0.9 }}
            />
            {measurePoints.map((pt, i) => (
              <CircleMarker
                key={i}
                center={pt}
                radius={4}
                pathOptions={{ fillColor: "#60A5FA", fillOpacity: 1, color: "#fff", weight: 1 }}
              />
            ))}
          </LayerGroup>
        )}
      </MapContainer>

      {/* Overlays */}
      <DrawingToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        currentPoints={currentPoints}
        undoLastPoint={undoLastPoint}
        onFinishDrawJalur={onFinishDrawJalur}
      />
      <TileSwitcher activeTile={activeTile} setActiveTile={setActiveTile} />
      <CoordDisplay coordRef={coordRef} />
      {activeTool === "measure" && (
        <MeasureOverlay
          measurePoints={measurePoints}
          totalDistanceM={totalDistanceM}
          onClear={clearMeasure}
        />
      )}
    </div>
  );
}
