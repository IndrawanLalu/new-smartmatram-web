"use client";

import { Zap } from "lucide-react";
import type { GangguanItem } from "../_hooks/useMorningBrief";

interface Props {
  items: GangguanItem[];
  byUlp: Record<string, number>;
  showUlpBreakdown: boolean;
  totalBulanIni: number;
  monthLabel: string;
}

export default function GangguanBriefSection({ items, byUlp, showUlpBreakdown, totalBulanIni, monthLabel }: Props) {
  return (
    <div className="bg-white rounded-xl border border-line print:bg-white print:border print:border-gray-300">
      {/* Section Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-line print:border-gray-300">
        <div className="bg-red-500/15 rounded-lg p-2 print:hidden">
          <Zap size={16} className="text-red-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-ink font-semibold print:text-black">Gangguan Penyulang</h2>
          <p className="text-ink-soft text-xs print:text-gray-500">Data dari SIAGA</p>
        </div>
        {/* Monthly + daily badges */}
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-line text-ink-soft print:text-gray-500">
            {monthLabel}: <span className="font-bold text-ink print:text-black">{totalBulanIni}</span>
          </span>
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${
            items.length === 0
              ? "bg-green-500/15 text-green-600 print:text-green-700"
              : "bg-red-500/15 text-red-600 print:text-red-700"
          }`}>
            Kemarin: {items.length}
          </span>
        </div>
      </div>

      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-brand-700 text-sm text-center py-4">
            Tidak ada gangguan kemarin ✓
          </p>
        ) : (
          <>
            {/* ULP breakdown (UP3 only) */}
            {showUlpBreakdown && Object.keys(byUlp).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(byUlp).map(([ulp, count]) => (
                  <span
                    key={ulp}
                    className="bg-red-500/10 text-red-700 border border-red-500/20 text-xs font-semibold px-2.5 py-1 rounded-full print:text-red-700 print:border-red-300"
                  >
                    {ulp}: {count}
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line print:border-gray-300">
                    {showUlpBreakdown && (
                      <th className="text-left py-2 pr-4 text-ink-soft font-semibold text-xs print:text-gray-600">ULP</th>
                    )}
                    <th className="text-left py-2 pr-4 text-ink-soft font-semibold text-xs print:text-gray-600">Penyulang</th>
                    <th className="text-left py-2 pr-4 text-ink-soft font-semibold text-xs print:text-gray-600">Jam Padam</th>
                    <th className="text-left py-2 pr-4 text-ink-soft font-semibold text-xs print:text-gray-600">Durasi</th>
                    <th className="text-left py-2 text-ink-soft font-semibold text-xs print:text-gray-600">Penyebab</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-line last:border-0 print:border-gray-200">
                      {showUlpBreakdown && (
                        <td className="py-2.5 pr-4 text-ink-soft text-xs print:text-gray-500">{item.ulp}</td>
                      )}
                      <td className="py-2.5 pr-4 text-ink font-medium print:text-black">{item.penyulang}</td>
                      <td className="py-2.5 pr-4 text-ink print:text-black">{item.jamPadam}</td>
                      <td className="py-2.5 pr-4 text-ink print:text-black">{item.durasi}</td>
                      <td className="py-2.5 text-ink-soft text-xs print:text-gray-600">{item.penyebab}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
