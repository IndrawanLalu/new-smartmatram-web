"use client";

import { useState, useCallback, useMemo } from "react";
import { haversineMeters } from "./usePetaGardu";

export function useMeasure() {
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);

  const addMeasurePoint = useCallback((latlng: [number, number]) => {
    setMeasurePoints((prev) => [...prev, latlng]);
  }, []);

  const clearMeasure = useCallback(() => {
    setMeasurePoints([]);
  }, []);

  const totalDistanceM = useMemo(() => {
    let total = 0;
    for (let i = 0; i < measurePoints.length - 1; i++) {
      total += haversineMeters(
        measurePoints[i][0], measurePoints[i][1],
        measurePoints[i + 1][0], measurePoints[i + 1][1]
      );
    }
    return total;
  }, [measurePoints]);

  return {
    measurePoints,
    addMeasurePoint,
    clearMeasure,
    totalDistanceM,
  };
}
