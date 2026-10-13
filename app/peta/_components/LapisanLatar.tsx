"use client";

import { TileLayer } from "react-leaflet";
import type { Latar } from "../_hooks/useLatarPeta";

/**
 * Ubin latar peta (di dalam MapContainer). "Kosong gelap/terang" tidak memuat
 * ubin sama sekali — warna dasar MapContainer (`warnaDasar`) yang tampil, dan
 * tidak ada unduhan.
 * "Peta jalan pudar" = ubin OpenStreetMap yang sama, digelapkan dengan filter
 * CSS: jalan masih terbaca sebagai patokan, tanpa penyedia peta baru.
 */

const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUSI_OSM = "&copy; OpenStreetMap";

interface Props {
  latar: Latar;
  /** Perbesaran tertinggi peta, dan tertinggi yang punya ubin asli. */
  maxZoom: number;
  maxNativeZoom: number;
}

export default function LapisanLatar({ latar, maxZoom, maxNativeZoom }: Props) {
  if (latar === "kosong" || latar === "terang") return null;
  if (latar === "citra") {
    return (
      <TileLayer
        key="citra"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
        maxZoom={maxZoom}
        maxNativeZoom={maxNativeZoom}
      />
    );
  }
  return (
    <TileLayer
      key={latar}
      url={OSM}
      attribution={ATRIBUSI_OSM}
      maxZoom={maxZoom}
      maxNativeZoom={maxNativeZoom}
      className={latar === "pudar" ? "[filter:grayscale(1)_invert(1)_brightness(0.55)_contrast(0.9)]" : undefined}
    />
  );
}
