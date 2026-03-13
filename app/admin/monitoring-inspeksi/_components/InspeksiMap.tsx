"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { InspeksiJaringan } from "../_hooks/useInspeksiJaringan";
import type { InspeksiPohon } from "../_hooks/useInspeksiPohon";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseKoordinat(str: string | null): [number, number] | null {
  if (!str) return null;
  const parts = str.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return [parts[0], parts[1]];
}

function statusToColor(status: string): string {
  const map: Record<string, string> = {
    Temuan: "#ef4444",
    "Perlu Tindakan": "#f97316",
    Ditugaskan: "#3b82f6",
    "Dalam Proses": "#eab308",
    Selesai: "#22c55e",
  };
  return map[status] ?? "#6b7280";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface InspeksiMapProps {
  jaringanData: InspeksiJaringan[];
  pohonData: InspeksiPohon[];
  showJaringan: boolean;
  showPohon: boolean;
  activeStatuses: string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InspeksiMap({
  jaringanData,
  pohonData,
  showJaringan,
  showPohon,
  activeStatuses,
}: InspeksiMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamic import Leaflet (SSR safe)
    import("leaflet").then((L) => {
      // Fix default icon path issue in Next.js
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!).setView([-8.58, 116.1], 12);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers setiap data berubah
  useEffect(() => {
    if (!mapRef.current) return;

    import("leaflet").then((L) => {
      const map = mapRef.current!;

      // Hapus semua marker lama (layer group)
      map.eachLayer((layer) => {
        if ((layer as { _customMarker?: boolean })._customMarker) {
          map.removeLayer(layer);
        }
      });

      const makeIcon = (color: string, symbol: string) =>
        L.divIcon({
          html: `<div style="background:${color};width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
            <span style="transform:rotate(45deg);font-size:13px;line-height:1">${symbol}</span>
          </div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -30],
        });

      const showPetugas = (status: string) =>
        status === "Ditugaskan" || status === "Dalam Proses" || status === "Selesai";

      if (showJaringan) {
        jaringanData.forEach((item) => {
          const pos = parseKoordinat(item.koordinat);
          if (!pos) return;
          if (!activeStatuses.includes(item.status)) return;
          const color = statusToColor(item.status);
          const marker = L.marker(pos, { icon: makeIcon(color, "⚡") });
          (marker as unknown as { _customMarker: boolean })._customMarker = true;
          marker
            .addTo(map)
            .bindPopup(
              `<div style="min-width:200px;font-size:13px">
                <p style="font-weight:700;margin:0 0 6px;color:#1B2631">⚡ ${item.penyulang ?? "—"}</p>
                ${item.temuan ? `<p style="color:#5D6D7E;margin:0 0 3px">🔧 ${item.temuan}</p>` : ""}
                ${showPetugas(item.status) && item.team_name ? `<p style="color:#5D6D7E;margin:0 0 3px">👷 ${item.team_name}</p>` : ""}
                ${item.keterangan ? `<p style="color:#5D6D7E;margin:0 0 6px;font-style:italic">${item.keterangan}</p>` : ""}
                <span style="background:${color};color:#fff;padding:2px 8px;border-radius:999px;font-size:11px">${item.status}</span>
              </div>`
            );
        });
      }

      if (showPohon) {
        pohonData.forEach((item) => {
          const pos = parseKoordinat(item.koordinat);
          if (!pos) return;
          if (!activeStatuses.includes(item.status)) return;
          const color = statusToColor(item.status);
          const marker = L.marker(pos, { icon: makeIcon(color, "🌳") });
          (marker as unknown as { _customMarker: boolean })._customMarker = true;
          marker
            .addTo(map)
            .bindPopup(
              `<div style="min-width:200px;font-size:13px">
                <p style="font-weight:700;margin:0 0 6px;color:#1B2631">🌳 ${item.penyulang ?? "—"}</p>
                ${item.temuan ? `<p style="color:#5D6D7E;margin:0 0 3px">🔧 ${item.temuan}</p>` : ""}
                ${showPetugas(item.status) && item.team_name ? `<p style="color:#5D6D7E;margin:0 0 3px">👷 ${item.team_name}</p>` : ""}
                ${item.keterangan ? `<p style="color:#5D6D7E;margin:0 0 6px;font-style:italic">${item.keterangan}</p>` : ""}
                <span style="background:${color};color:#fff;padding:2px 8px;border-radius:999px;font-size:11px">${item.status}</span>
              </div>`
            );
        });
      }
    });
  }, [jaringanData, pohonData, showJaringan, showPohon, activeStatuses]);

  return (
    <>
      {/* Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <div ref={containerRef} className="h-[75vh] min-h-[520px] w-full rounded-xl overflow-hidden" />
    </>
  );
}
