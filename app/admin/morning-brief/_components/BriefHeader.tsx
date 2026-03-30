"use client";

import React, { useState } from "react";
import { Sun, Share2, Download, Loader2 } from "lucide-react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { MorningBriefData } from "../_hooks/useMorningBrief";
import { OVERLOAD_PCT, HIGH_TEMP_C } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";

interface BriefHeaderProps {
  yesterdayLabel: string;
  unitLabel: string;
  data: MorningBriefData | null;
}

const canShare = typeof navigator !== "undefined" && !!navigator.share;

function formatBriefText(data: MorningBriefData, unitLabel: string): string {
  const lines: string[] = [];

  lines.push(`☀️ *MORNING BRIEF — ${data.yesterdayLabel.toUpperCase()}*`);
  lines.push(`_${unitLabel}_`);
  lines.push("");

  // Gangguan
  const g = data.gangguan;
  lines.push(`🔴 *GANGGUAN PENYULANG*`);
  if (g.items.length === 0) {
    lines.push(`✅ Tidak ada gangguan kemarin`);
  } else {
    lines.push(`Kemarin: *${g.items.length} gangguan*`);
    for (const item of g.items) {
      lines.push(`  • ${item.penyulang} (${item.ulp}) — ${item.jamPadam}, ${item.penyebab}`);
    }
  }
  lines.push(`Bulan ini: ${g.totalBulanIni} gangguan`);
  lines.push("");

  // Pengukuran
  const p = data.pengukuran;
  lines.push(`⚡ *PENGUKURAN GARDU*`);
  lines.push(`Kemarin diukur: *${p.total} gardu*`);
  lines.push(`Overload ≥${OVERLOAD_PCT}%: *${p.overload.length}* (s/d kmrn: ${p.overloadBulanIni})`);
  lines.push(`Suhu >${HIGH_TEMP_C}°C: *${p.highTemp.length}* (s/d kmrn: ${p.highTempBulanIni})`);
  lines.push(`WO Dikirim: *${p.woDone.length}* (bulan ini: ${p.woDoneBulanIni})`);
  lines.push(`AMG di-Input: *${p.amgDone.length}* (bulan ini: ${p.amgDoneBulanIni})`);
  if (p.overload.length > 0) {
    lines.push(`_Overload: ${p.overload.map((r) => `${r.no_gardu} ${r.persen_beban.toFixed(0)}%`).join(", ")}_`);
  }
  if (p.highTemp.length > 0) {
    lines.push(`_Suhu tinggi: ${p.highTemp.map((r) => `${r.no_gardu} ${r.suhu_trafo}°C`).join(", ")}_`);
  }
  lines.push("");

  // Eksekusi
  const e = data.eksekusi;
  const totalKemarin = e.totalJaringan + e.totalPohon;
  const totalBulan = e.totalJaringanBulanIni + e.totalPohonBulanIni;
  lines.push(`🔧 *REKAPITULASI PEKERJAAN*`);
  lines.push(`Kemarin: *${totalKemarin}* pekerjaan | Bulan ini: *${totalBulan}*`);
  for (const tim of e.byEksekutor) {
    const kmrn = tim.jaringan + tim.pohon;
    const bulan = tim.jaringanBulanIni + tim.pohonBulanIni;
    if (bulan > 0 || kmrn > 0) {
      lines.push(`  • ${tim.eksekutor}: bulan ini ${bulan}, kemarin ${kmrn}`);
    }
  }
  lines.push("");

  // Inspeksi Jaringan
  const ij = data.inspeksiJaringan;
  lines.push(`🔍 *INSPEKSI JARINGAN*`);
  lines.push(`Temuan kemarin: *${ij.newTemuan.length}* | Selesai: *${ij.selesai.length}*`);
  lines.push(`Bulan ini: ${ij.newTemuanBulanIni} temuan | ${ij.selesaiBulanIni} selesai`);
  lines.push("");

  // Inspeksi Pohon
  const ip = data.inspeksiPohon;
  lines.push(`🌳 *INSPEKSI POHON / RABAS*`);
  lines.push(`Temuan kemarin: *${ip.newTemuan.length}* | Selesai: *${ip.selesai.length}*`);
  lines.push(`Bulan ini: ${ip.newTemuanBulanIni} temuan | ${ip.selesaiBulanIni} selesai`);
  if (ip.sanggatUrgent.length > 0) {
    lines.push(`⚠️ Sangat Urgent perlu tindakan: *${ip.sanggatUrgent.length} pohon*`);
  }
  lines.push("");

  lines.push(`_Dibuat otomatis oleh SMART Mataram_`);

  return lines.join("\n");
}

export default function BriefHeader({ yesterdayLabel, unitLabel, data }: BriefHeaderProps) {
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleShare() {
    if (!data) return;
    setGenerating(true);
    setErr(null);
    try {
      const [{ pdf }, { default: MorningBriefDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./_MorningBriefDocument"),
      ]);

      const element = React.createElement(
        MorningBriefDocument as React.ComponentType<{ data: MorningBriefData; unitLabel: string }>,
        { data, unitLabel }
      ) as React.ReactElement<DocumentProps>;

      const blob = await pdf(element).toBlob();
      const fileName = `Morning-Brief-${data.yesterday}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      const briefText = formatBriefText(data, unitLabel);

      if (canShare && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Morning Brief ${data.yesterdayLabel}`,
          text: briefText,
        });
      } else {
        // Fallback: download PDF + copy text to clipboard
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        await navigator.clipboard.writeText(briefText).catch(() => null);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user cancelled
      setErr(e instanceof Error ? e.message : "Gagal membuat PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6 print:rounded-none print:bg-none print:text-black print:border-b-2 print:border-[#00897B]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-white/15 rounded-xl p-3 print:hidden">
            <Sun size={28} className="text-amber-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Morning Brief</h1>
            <p className="text-teal-100 text-sm mt-0.5">
              Rangkuman kejadian <span className="font-semibold text-white">{yesterdayLabel}</span>
            </p>
            <p className="text-teal-200/70 text-xs mt-0.5">{unitLabel}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 print:hidden">
          <button
            onClick={handleShare}
            disabled={!data || generating}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Membuat PDF...
              </>
            ) : canShare ? (
              <>
                <Share2 size={15} />
                Bagikan / WA
              </>
            ) : (
              <>
                <Download size={15} />
                Download PDF
              </>
            )}
          </button>
          {err && (
            <p className="text-red-300 text-xs">{err}</p>
          )}
        </div>
      </div>
    </div>
  );
}
