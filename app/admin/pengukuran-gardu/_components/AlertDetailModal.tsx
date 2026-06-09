"use client";

import { X } from "lucide-react";

interface Props {
  title: string;
  count: number;
  colorClass: string; // e.g. "text-red-400"
  borderClass: string; // e.g. "border-red-500/30"
  onClose: () => void;
  children: React.ReactNode;
}

export default function AlertDetailModal({
  title, count, colorClass, borderClass, onClose, children,
}: Props) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`bg-[#0a1628] border ${borderClass} rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e3552]">
          <h2 className={`font-semibold flex-1 ${colorClass}`}>
            {title}
            <span className="ml-2 text-sm font-normal text-[#94a3b8]">({count})</span>
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/5 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
