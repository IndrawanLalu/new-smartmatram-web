"use client";

import { useState, useCallback, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { SelectedFeature } from "./types";

export function useMapSelection() {
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeature | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const selectFeature = useCallback((feature: SelectedFeature) => {
    setSelectedFeature(feature);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFeature(null);
  }, []);

  const zoomToFeature = useCallback(
    (lat: number, lng: number, zoom = 16) => {
      mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.8 });
    },
    []
  );

  const zoomToSelected = useCallback(() => {
    if (!selectedFeature) return;
    const d = selectedFeature.data;
    if ("lat" in d && d.lat && d.lng) {
      zoomToFeature(d.lat, d.lng);
    } else if ("koordinat" in d && d.koordinat.length > 0) {
      const mid = Math.floor(d.koordinat.length / 2);
      zoomToFeature(d.koordinat[mid][0], d.koordinat[mid][1], 15);
    }
  }, [selectedFeature, zoomToFeature]);

  return {
    selectedFeature,
    selectFeature,
    clearSelection,
    zoomToSelected,
    zoomToFeature,
    mapRef,
  };
}
