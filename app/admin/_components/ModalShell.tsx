"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalShellProps {
  title: string;
  subtitle?: string;
  /** Lebar maksimum, mis. "max-w-3xl" (default) */
  maxWidth?: string;
  footer?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Kerangka modal: backdrop klik-untuk-tutup, Escape, body scrollable, footer sticky.
 * Dipakai oleh modal Buat WO & Ubah WO.
 */
export default function ModalShell({
  title,
  subtitle,
  maxWidth = "max-w-3xl",
  footer,
  onClose,
  children,
}: ModalShellProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col animate-pop-in`}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[#E2E8F0]">
          <div className="min-w-0">
            <h2 className="font-bold text-[#1B2631]">{title}</h2>
            {subtitle && <p className="text-xs text-[#5D6D7E] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#E2E8F0]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
