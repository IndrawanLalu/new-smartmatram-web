"use client";

import { useState, useCallback } from "react";
import type { DrawingTool } from "./types";

export function useDrawing() {
  const [activeTool, setActiveToolState] = useState<DrawingTool>("select");
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [pendingLatLng, setPendingLatLng] = useState<[number, number] | null>(null);

  const setActiveTool = useCallback((tool: DrawingTool) => {
    setActiveToolState(tool);
    setCurrentPoints([]);
    setPendingLatLng(null);
  }, []);

  const addPoint = useCallback((latlng: [number, number]) => {
    setCurrentPoints((prev) => [...prev, latlng]);
  }, []);

  const undoLastPoint = useCallback(() => {
    setCurrentPoints((prev) => prev.slice(0, -1));
  }, []);

  const resetPoints = useCallback(() => {
    setCurrentPoints([]);
  }, []);

  const finishDrawing = useCallback((): [number, number][] => {
    const pts = currentPoints;
    setCurrentPoints([]);
    return pts;
  }, [currentPoints]);

  const clearPending = useCallback(() => {
    setPendingLatLng(null);
  }, []);

  return {
    activeTool,
    setActiveTool,
    currentPoints,
    addPoint,
    undoLastPoint,
    resetPoints,
    finishDrawing,
    pendingLatLng,
    setPendingLatLng,
    clearPending,
  };
}
