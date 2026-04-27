"use client";

import React, { useState } from "react";
import { ClipboardList, Send, ChevronDown, ChevronRight } from "lucide-react";
import type { RealisasiTimRow } from "../_hooks/useMorningBrief";

interface Props {
  items: RealisasiTimRow[];
  totalWO: number;
  totalRealisasi: number;
}

const GROUP_ID = process.env.NEXT_PUBLIC_WA_GROUP_REALISASI ?? "";

function rowColor(wo: number, realisasi: number) {
  if (wo === 0) return "text-[#94a3b8]";
  if (realisasi >= wo) return "text-green-400";
  if (realisasi > 0) return "text-yellow-400";
  return "text-red-400";
}

function statusIcon(wo: number, realisasi: number) {
  if (wo === 0) return "—";
  if (realisasi >= wo) return "✅";
  if (realisasi > 0) return "⚠️";
  return "❌";
}

export default function RealisasiProbisBriefSection({ items, totalWO, totalRealisasi }: Props) {
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "ok" | "error">("idle");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const totalPct = totalWO > 0 ? Math.round((totalRealisasi / totalWO) * 100) : 0;

  const toggleExpand = (tim: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(tim) ? next.delete(tim) : next.add(tim);
      return next;
    });

  const handleSendWA = async () => {
    const groupId = GROUP_ID || prompt("Group ID WA tujuan:");
    if (!groupId) return;
    setSending(true);
    setSendStatus("idle");
    try {
      const res = await fetch("/api/realisasi-wa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, groupId }),
      });
      setSendStatus(res.ok ? "ok" : "error");
    } catch {
      setSendStatus("error");
    } finally {
      setSending(false);
      setTimeout(() => setSendStatus("idle"), 3000);
    }
  };

  return (
    <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e3552]">
        <div className="flex items-center gap-2 text-[#5eead4]">
          <ClipboardList size={16} />
          <span className="font-semibold text-sm">REALISASI PROBIS</span>
          <span className="text-[#94a3b8] text-xs ml-1">
            {totalWO > 0 ? `${totalPct}% · WO ${totalWO} | Real ${totalRealisasi}` : "Belum ada data"}
          </span>
        </div>
        <button
          onClick={handleSendWA}
          disabled={sending}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors print:hidden ${
            sendStatus === "ok"
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : sendStatus === "error"
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : "bg-[#00897B]/20 text-[#5eead4] border border-[#00897B]/30 hover:bg-[#00897B]/30"
          }`}
        >
          <Send size={12} />
          {sending ? "Mengirim..." : sendStatus === "ok" ? "Terkirim!" : sendStatus === "error" ? "Gagal" : "Kirim WA"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#94a3b8] text-xs border-b border-[#1e3552]">
              <th className="px-5 py-2 text-left font-medium">Tim Pelaksana</th>
              <th className="px-4 py-2 text-center font-medium w-20">WO</th>
              <th className="px-4 py-2 text-center font-medium w-24">Realisasi</th>
              <th className="px-4 py-2 text-center font-medium w-16">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e3552]">
            {items.map(({ tim, wo, realisasi, detail }) => {
              const pct = wo > 0 ? Math.round((realisasi / wo) * 100) : 0;
              const hasDetail = detail.length > 0;
              const isOpen = expanded.has(tim);

              return (
                <React.Fragment key={tim}>
                  <tr
                    className={`hover:bg-[#162334]/50 ${hasDetail ? "cursor-pointer" : ""}`}
                    onClick={hasDetail ? () => toggleExpand(tim) : undefined}
                  >
                    <td className="px-5 py-2 text-[#e2e8f0] text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        {hasDetail && (
                          isOpen
                            ? <ChevronDown size={12} className="text-[#94a3b8] shrink-0" />
                            : <ChevronRight size={12} className="text-[#94a3b8] shrink-0" />
                        )}
                        {statusIcon(wo, realisasi)} {tim}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-[#94a3b8] text-xs">{wo || "—"}</td>
                    <td className={`px-4 py-2 text-center text-xs font-semibold ${rowColor(wo, realisasi)}`}>
                      {wo > 0 ? realisasi : "—"}
                    </td>
                    <td className={`px-4 py-2 text-center text-xs ${rowColor(wo, realisasi)}`}>
                      {wo > 0 ? `${pct}%` : "—"}
                    </td>
                  </tr>

                  {hasDetail && isOpen && detail.map((d) => {
                    const dPct = d.wo > 0 ? Math.round((d.realisasi / d.wo) * 100) : 0;
                    return (
                      <tr key={`${tim}-${d.jenisPekerjaan}`} className="bg-[#0a1628]">
                        <td className="pl-10 pr-5 py-1.5 text-[#94a3b8] text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[#1e3552]">—</span>
                            {d.jenisPekerjaan}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-center text-[#64748b] text-xs">{d.wo || "—"}</td>
                        <td className={`px-4 py-1.5 text-center text-xs ${rowColor(d.wo, d.realisasi)}`}>
                          {d.wo > 0 ? d.realisasi : "—"}
                        </td>
                        <td className={`px-4 py-1.5 text-center text-xs ${rowColor(d.wo, d.realisasi)}`}>
                          {d.wo > 0 ? `${dPct}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
          {totalWO > 0 && (
            <tfoot>
              <tr className="border-t border-[#1e3552] bg-[#162334]">
                <td className="px-5 py-2 text-[#5eead4] text-xs font-semibold">TOTAL</td>
                <td className="px-4 py-2 text-center text-[#94a3b8] text-xs font-semibold">{totalWO}</td>
                <td className="px-4 py-2 text-center text-[#5eead4] text-xs font-semibold">{totalRealisasi}</td>
                <td className="px-4 py-2 text-center text-[#5eead4] text-xs font-semibold">{totalPct}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
