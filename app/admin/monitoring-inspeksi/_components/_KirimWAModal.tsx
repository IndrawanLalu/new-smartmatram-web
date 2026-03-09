"use client";

import React, { useState } from "react";
import { X, MessageCircle, Loader2, Download, Share2 } from "lucide-react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { InspeksiJaringan } from "../_hooks/useInspeksiJaringan";
import type { InspeksiPohon } from "../_hooks/useInspeksiPohon";

interface Props {
  type: "jaringan" | "pohon";
  data: InspeksiJaringan | InspeksiPohon;
  onClose: () => void;
}

const canShare = typeof navigator !== "undefined" && !!navigator.share;

export default function KirimWAModal({ type, data, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const woNo = `WO-${data.id.slice(0, 8).toUpperCase()}`;
  const fileName = `${woNo}-${(data.penyulang ?? "inspeksi").replace(/\s+/g, "-")}.pdf`;

  const handleGenerate = async () => {
    setLoading(true);
    setErr(null);
    try {
      // Dynamic import — tidak naikkan bundle awal
      const [{ pdf }, { default: WODocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./_WODocument"),
      ]);

      const element = React.createElement(
        WODocument as React.ComponentType<{ type: "jaringan" | "pohon"; data: typeof data }>,
        { type, data },
      ) as React.ReactElement<DocumentProps>;

      const blob = await pdf(element).toBlob();
      const file = new File([blob], fileName, { type: "application/pdf" });

      // Mobile: Web Share API
      if (canShare && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: woNo,
        });
        setDone(true);
      } else {
        // Desktop fallback: download PDF
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setDone(true);
      }
    } catch (e) {
      // User membatalkan share → bukan error
      if (e instanceof Error && e.name === "AbortError") {
        onClose();
        return;
      }
      setErr(e instanceof Error ? e.message : "Gagal membuat PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[#0a1628] border border-[#1e3552] rounded-xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e3552]">
          <MessageCircle size={15} className="text-[#00897B] shrink-0" />
          <h3 className="text-sm font-semibold text-[#e2e8f0] flex-1">Kirim WO via WhatsApp</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          {/* WO info */}
          <div className="bg-[#162334] border border-[#1e3552] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Work Order</p>
            <p className="text-sm font-medium text-[#e2e8f0]">{woNo}</p>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              {data.penyulang ?? "—"} · {data.ulp ?? "—"}
            </p>
          </div>

          {/* Info cara kerja */}
          {!done && (
            <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-3 py-2.5 space-y-1.5">
              {canShare ? (
                <div className="flex items-start gap-2">
                  <Share2 size={11} className="text-[#00897B] mt-0.5 shrink-0" />
                  <p className="text-xs text-[#94a3b8] leading-relaxed">
                    PDF akan dibuat, lalu muncul <span className="text-[#e2e8f0]">share sheet</span> — pilih WhatsApp dan kontak tujuan.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <Download size={11} className="text-[#00897B] mt-0.5 shrink-0" />
                  <p className="text-xs text-[#94a3b8] leading-relaxed">
                    PDF akan <span className="text-[#e2e8f0]">terdownload</span> — buka WhatsApp Web, lalu attach file tersebut secara manual.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Done state */}
          {done && (
            <div className="bg-[#00897B]/10 border border-[#00897B]/30 rounded-lg px-3 py-2.5">
              <p className="text-xs text-[#5eead4]">
                {canShare ? "WO berhasil dibagikan." : `PDF \"${fileName}\" berhasil didownload.`}
              </p>
            </div>
          )}

          {err && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {err}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#1e3552] flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg text-xs border border-[#1e3552] text-[#94a3b8] hover:bg-white/5 transition-colors"
          >
            {done ? "Tutup" : "Batal"}
          </button>
          {!done && (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-[#00897B] text-white hover:bg-[#00695C] disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? (
                <>
                  <Loader2 size={11} className="animate-spin" />
                  Membuat PDF...
                </>
              ) : canShare ? (
                <>
                  <Share2 size={11} />
                  Buat & Bagikan
                </>
              ) : (
                <>
                  <Download size={11} />
                  Download PDF
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
