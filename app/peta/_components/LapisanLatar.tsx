"use client";

import { useEffect } from "react";
import { TileLayer, useMap } from "react-leaflet";
import { warnaDasar, type Latar } from "../_hooks/useLatarPeta";

/**
 * Ubin latar peta (di dalam MapContainer). "Kosong gelap/terang" tidak memuat
 * ubin sama sekali — warna dasar MapContainer (`warnaDasar`) yang tampil, dan
 * tidak ada unduhan.
 * "Peta jalan pudar" = ubin OpenStreetMap yang sama, digelapkan dengan filter
 * CSS: jalan masih terbaca sebagai patokan, tanpa penyedia peta baru.
 *
 * Warna dasar dipasang langsung ke wadah peta di sini, bukan lewat `style`
 * MapContainer: react-leaflet hanya membaca `style` itu SEKALI saat peta
 * dibuat — Kosong gelap ↔ terang tidak akan berganti.
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
  const peta = useMap();
  useEffect(() => {
    // `important`: globals.css menetapkan latar .leaflet-container dengan
    // !important — tanpa ini warnanya tidak pernah berganti.
    peta.getContainer().style.setProperty("background", warnaDasar(latar), "important");
  }, [peta, latar]);

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
