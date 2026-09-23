"use client";

import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Ya",
  cancelLabel = "Batal",
  tone = "primary",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const btnCls =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-linear-to-r from-[#004D40] to-[#00897B] hover:opacity-90";
  const iconCls = tone === "danger" ? "bg-red-50 text-red-600" : "bg-[#E0F2F1] text-[#00897B]";

  // z-[2050]: dialog ini juga dibuka DARI DALAM ModalShell (z-[2000]); di bawah
  // angka itu dia tertimbun modal induknya. Tetap di bawah notifikasi (2100).
  return (
    <div className="fixed inset-0 z-[2050] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconCls}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-[#1B2631]">{title}</h3>
            <div className="text-sm text-[#5D6D7E] mt-1 leading-relaxed">{message}</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#5D6D7E] border border-[#E2E8F0] rounded-lg hover:bg-[#F4F6F8]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`px-4 py-2 text-sm text-white rounded-lg font-medium ${btnCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
