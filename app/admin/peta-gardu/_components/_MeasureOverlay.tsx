"use client";

import { X } from "lucide-react";

interface Props {
  measurePoints: [number, number][];
  totalDistanceM: number;
  onClear: () => void;
}

export default function MeasureOverlay({ measurePoints, totalDistanceM, onClear }: Props) {
  if (measurePoints.length === 0) return null;

  const km = (totalDistanceM / 1000).toFixed(3);
  const m = totalDistanceM.toFixed(0);

  return (
    <div className="absolute bottom-16 left-3 z-[400] bg-[#162334]/95 border border-[#1e3552] rounded-xl px-3 py-2.5 shadow-xl backdrop-blur-sm min-w-[160px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[#5eead4] text-xs font-semibold">Pengukuran Jarak</span>
        <button
          onClick={onClear}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      <div className="font-mono text-white text-sm font-bold">
        {totalDistanceM >= 1000 ? `${km} km` : `${m} m`}
      </div>
      {totalDistanceM >= 1000 && (
        <div className="font-mono text-gray-500 text-xs">{m} m</div>
      )}
      <div className="text-gray-500 text-xs mt-1">{measurePoints.length} titik</div>
    </div>
  );
}
