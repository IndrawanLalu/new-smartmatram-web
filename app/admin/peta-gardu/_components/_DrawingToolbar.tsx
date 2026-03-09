"use client";

import {
  MousePointer2,
  Circle,
  Route,
  Ruler,
  Undo2,
  CheckCircle2,
} from "lucide-react";
import type { DrawingTool } from "../_hooks/types";

interface Props {
  activeTool: DrawingTool;
  setActiveTool: (t: DrawingTool) => void;
  currentPoints: [number, number][];
  undoLastPoint: () => void;
  onFinishDrawJalur: () => void;
}

const TOOLS: { id: DrawingTool; icon: React.ComponentType<{ size?: number }>; title: string }[] = [
  { id: "select",   icon: MousePointer2, title: "Pilih fitur" },
  { id: "addTiang", icon: Circle,        title: "Tambah Tiang" },
  { id: "drawJalur",icon: Route,         title: "Gambar Jalur" },
  { id: "measure",  icon: Ruler,         title: "Ukur Jarak" },
];

const HINTS: Record<DrawingTool, string> = {
  select:   "",
  addGardu: "",
  addTiang: "Klik peta untuk menempatkan tiang",
  drawJalur:"Klik peta untuk menambah titik jalur",
  measure:  "Klik peta untuk mengukur jarak",
};

export default function DrawingToolbar({
  activeTool,
  setActiveTool,
  currentPoints,
  undoLastPoint,
  onFinishDrawJalur,
}: Props) {
  const hint = HINTS[activeTool];

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] flex flex-col items-center gap-1.5">
      {/* Tool buttons */}
      <div className="flex items-center gap-1 bg-[#162334]/90 border border-[#1e3552] rounded-xl px-2 py-1.5 shadow-xl backdrop-blur-sm">
        {TOOLS.map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            title={title}
            onClick={() => setActiveTool(id)}
            className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-all ${
              activeTool === id
                ? "bg-[#00897B] text-white shadow-md shadow-[#00897B]/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
            }`}
          >
            <Icon size={15} />
          </button>
        ))}

        {/* Divider + undo/finish when drawing jalur */}
        {activeTool === "drawJalur" && (
          <>
            <div className="w-px h-6 bg-[#1e3552] mx-1" />
            <button
              title="Undo titik terakhir"
              onClick={undoLastPoint}
              disabled={currentPoints.length === 0}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Undo2 size={15} />
            </button>
            <button
              title="Selesai menggambar"
              onClick={onFinishDrawJalur}
              disabled={currentPoints.length < 2}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-[#00897B] hover:bg-[#00897B]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <CheckCircle2 size={15} />
            </button>
          </>
        )}
      </div>

      {/* Hint text */}
      {hint && (
        <div className="bg-[#162334]/90 border border-[#1e3552] rounded-lg px-3 py-1 text-[11px] text-[#5eead4] backdrop-blur-sm shadow">
          {hint}
          {activeTool === "drawJalur" && currentPoints.length > 0 && (
            <span className="text-gray-500 ml-2">· {currentPoints.length} titik</span>
          )}
        </div>
      )}
    </div>
  );
}
