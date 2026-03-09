"use client";

import dynamic from "next/dynamic";
import type { RefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Gardu, Jalur, Tiang, TiangRef, SelectedFeature, DrawingTool } from "../_hooks/types";

const MapCanvas = dynamic(() => import("./_MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 h-full flex items-center justify-center bg-[#0d1b2a]">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-gray-700 border-t-[#00897B] rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-gray-500">Memuat peta...</p>
      </div>
    </div>
  ),
});

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

export default function PetaGarduCanvas(props: Props) {
  return (
    <div className="h-full w-full bg-[#0d1b2a]">
      <MapCanvas {...props} />
    </div>
  );
}
