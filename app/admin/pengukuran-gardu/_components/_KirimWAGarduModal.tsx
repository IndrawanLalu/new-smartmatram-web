"use client";

import React, { useState } from "react";
import { X, MessageCircle, Loader2, Download, Share2, CheckCircle } from "lucide-react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { PengukuranGardu } from "../_hooks/usePengukuranGardu";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { JENIS_PEMELIHARAAN_OPTIONS } from "../_utils/constants";

interface Props {
  data: PengukuranGardu;
  onClose: () => void;
  onWoMarked?: (sentAt: string, jenis: string) => void;
}

const canShare = typeof navigator !== "undefined" && !!navigator.share;

const JENIS_OPTIONS = JENIS_PEMELIHARAAN_OPTIONS;

export default function KirimWAGarduModal({ data, onClose, onWoMarked }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [jenisPemeliharaan, setJenisPemeliharaan] = useState<string>(JENIS_OPTIONS[0]);
  const [keterangan, setKeterangan] = useState("");
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);

  const woNo = `WO-${data.no_gardu}`;
  const fileName = `${woNo}.pdf`;

  const handleMarkWo = async () => {
    setMarking(true);
    const sentAt = new Date().toISOString();
    const { error } = await supabaseBrowser
      .from("pengukuran_gardu")
      .update({ wo_sent_at: sentAt, jenis_pemeliharaan: jenisPemeliharaan })
      .eq("id", data.id);
    if (!error) {
      setMarked(true);
      onWoMarked?.(sentAt, jenisPemeliharaan);
    }
    setMarking(false);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [{ pdf }, { default: WOGarduDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./_WOGarduDocument"),
      ]);

      const element = React.createElement(
        WOGarduDocument as React.ComponentType<{
          data: PengukuranGardu;
          jenisPemeliharaan: string;
          keterangan: string;
        }>,
        { data, jenisPemeliharaan, keterangan },
      ) as React.ReactElement<DocumentProps>;

      const blob = await pdf(element).toBlob();
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (canShare && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: woNo });
        setDone(true);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setDone(true);
      }
    } catch (e) {
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
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[#e2e8f0]">{woNo}</p>
              {data.wo_sent_at && (
                <span className="text-[10px] bg-[#00897B]/20 border border-[#00897B]/40 text-[#5eead4] px-1.5 py-0.5 rounded-full font-semibold">
                  WO {new Date(data.wo_sent_at).toLocaleDateString("id-ID")}
                </span>
              )}
            </div>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              {data.penyulang ?? "—"} · {data.petugas_unit}
            </p>
          </div>

          {/* Input jenis + keterangan */}
          {!done && (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Jenis Pemeliharaan
                </label>
                <select
                  value={jenisPemeliharaan}
                  onChange={e => setJenisPemeliharaan(e.target.value)}
                  className="w-full bg-[#162334] border border-[#1e3552] rounded-lg px-3 py-2 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#00897B]"
                >
                  {JENIS_OPTIONS.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Keterangan (opsional)
                </label>
                <textarea
                  value={keterangan}
                  onChange={e => setKeterangan(e.target.value)}
                  rows={2}
                  placeholder="Misal: Jurusan B terlalu berat, pindah ke Jurusan C"
                  className="w-full bg-[#162334] border border-[#1e3552] rounded-lg px-3 py-2 text-xs text-[#e2e8f0] placeholder-gray-600 focus:outline-none focus:border-[#00897B] resize-none"
                />
              </div>
            </div>
          )}

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
            <div className="space-y-2">
              <div className="bg-[#00897B]/10 border border-[#00897B]/30 rounded-lg px-3 py-2.5">
                <p className="text-xs text-[#5eead4]">
                  {canShare ? "WO berhasil dibagikan." : `PDF "${fileName}" berhasil didownload.`}
                </p>
              </div>
              {!marked ? (
                <button
                  onClick={handleMarkWo}
                  disabled={marking}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-[#00897B] text-[#5eead4] hover:bg-[#00897B]/10 disabled:opacity-50 transition-colors"
                >
                  {marking ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                  {marking ? "Menyimpan..." : "Tandai Sudah di-WO"}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00897B]/10 border border-[#00897B]/30">
                  <CheckCircle size={11} className="text-[#5eead4]" />
                  <span className="text-xs text-[#5eead4]">Pengukuran ini sudah ditandai WO</span>
                </div>
              )}
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
