"use client";

import { useState } from "react";
import { Layers } from "lucide-react";

export interface TileLayerDef {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export const TILE_LAYERS: TileLayerDef[] = [
  {
    id: "dark",
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
  {
    id: "satellite",
    name: "Satelit",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 18,
  },
  {
    id: "voyager",
    name: "Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
  {
    id: "street",
    name: "Street",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
];

interface Props {
  activeTile: TileLayerDef;
  setActiveTile: (t: TileLayerDef) => void;
}

export default function TileSwitcher({ activeTile, setActiveTile }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-3 right-3 z-[400]">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ganti tile peta"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-lg transition-colors ${
          open
            ? "bg-[#00897B] text-white"
            : "bg-[#162334] border border-[#1e3552] text-gray-300 hover:text-white"
        }`}
      >
        <Layers size={13} />
        <span>{activeTile.name}</span>
      </button>

      {open && (
        <div className="absolute top-9 right-0 bg-[#162334] border border-[#1e3552] rounded-xl shadow-xl overflow-hidden min-w-[110px]">
          {TILE_LAYERS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTile(t); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                activeTile.id === t.id
                  ? "bg-[#00897B]/20 text-[#5eead4]"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
