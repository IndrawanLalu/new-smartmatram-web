"use client";

import { Wrench } from "lucide-react";
import type { EksekutorRekap } from "../_hooks/useMorningBrief";

// Warna berdasarkan prefix role eksekutor
function getEksekutorColor(key: string): string {
  const k = key.toUpperCase();
  if (k.startsWith("HARJAR")) return "bg-blue-500/15 text-blue-600 print:text-blue-700";
  if (k.startsWith("HARGAR")) return "bg-teal-500/15 text-teal-600 print:text-teal-700";
  if (k.startsWith("YANGU")) return "bg-purple-500/15 text-purple-600 print:text-purple-700";
  if (k.startsWith("PDKB")) return "bg-orange-500/15 text-orange-600 print:text-orange-700";
  if (k.startsWith("RABAS") || k.startsWith("PERABASAN")) return "bg-green-500/15 text-green-600 print:text-green-700";
  return "bg-gray-500/15 text-gray-400 print:text-gray-600";
}

interface Props {
  byEksekutor: EksekutorRekap[];
  totalJaringan: number;
  totalPohon: number;
  totalJaringanBulanIni: number;
  totalPohonBulanIni: number;
  monthLabel: string;
}

export default function EksekusiBriefSection({
  byEksekutor, totalJaringan, totalPohon,
  totalJaringanBulanIni, totalPohonBulanIni, monthLabel,
}: Props) {
  const totalKemarin = totalJaringan + totalPohon;
  const totalBulan = totalJaringanBulanIni + totalPohonBulanIni;

  return (
    <div className="bg-white rounded-xl border border-line print:bg-white print:border print:border-gray-300">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-line print:border-gray-300">
        <div className="bg-blue-500/15 rounded-lg p-2 print:hidden">
          <Wrench size={16} className="text-blue-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-ink font-semibold print:text-black">Rekapitulasi Pekerjaan</h2>
          <p className="text-ink-soft text-xs print:text-gray-500">Eksekusi inspeksi jaringan & pohon</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-line text-ink-soft print:text-gray-500">
            {monthLabel}: <span className="font-bold text-ink print:text-black">{totalBulan}</span>
          </span>
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${
            totalKemarin > 0
              ? "bg-blue-500/15 text-blue-600 print:text-blue-700"
              : "bg-line text-ink-soft print:text-gray-500"
          }`}>
            Kemarin: {totalKemarin}
          </span>
        </div>
      </div>

      <div className="p-5">
        {byEksekutor.length === 0 && totalKemarin === 0 ? (
          <p className="text-ink-soft text-sm text-center py-4">
            Tidak ada pekerjaan yang diselesaikan kemarin
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line print:border-gray-300">
                <th className="text-left py-2 pr-3 text-ink-soft font-semibold text-xs print:text-gray-600">Tim</th>
                <th className="text-center py-2 pr-2 text-ink-soft font-semibold text-xs print:text-gray-600" colSpan={2}>
                  {monthLabel}
                </th>
                <th className="text-center py-2 pr-2 text-ink-soft font-semibold text-xs print:text-gray-600" colSpan={2}>
                  Kemarin
                </th>
              </tr>
              <tr className="border-b border-line print:border-gray-200">
                <th className="pb-1.5 pr-3"></th>
                <th className="pb-1.5 pr-2 text-center text-ink-soft font-normal text-xs print:text-gray-500">Jar.</th>
                <th className="pb-1.5 pr-3 text-center text-ink-soft font-normal text-xs print:text-gray-500">Pohon</th>
                <th className="pb-1.5 pr-2 text-center text-ink-soft font-normal text-xs print:text-gray-500">Jar.</th>
                <th className="pb-1.5 text-center text-ink-soft font-normal text-xs print:text-gray-500">Pohon</th>
              </tr>
            </thead>
            <tbody>
              {byEksekutor.map((row) => (
                  <tr key={row.eksekutor} className="border-b border-line last:border-0 print:border-gray-200">
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getEksekutorColor(row.eksekutor)}`}>
                        {row.eksekutor}
                      </span>
                    </td>
                    {/* Bulan ini */}
                    <td className="py-2.5 pr-2 text-center text-ink font-semibold print:text-black">
                      {row.jaringanBulanIni || <span className="text-ink-soft font-normal">—</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-center text-ink font-semibold print:text-black">
                      {row.pohonBulanIni || <span className="text-ink-soft font-normal">—</span>}
                    </td>
                    {/* Kemarin */}
                    <td className="py-2.5 pr-2 text-center text-ink-soft print:text-gray-600">
                      {row.jaringan || "—"}
                    </td>
                    <td className="py-2.5 text-center text-ink-soft print:text-gray-600">
                      {row.pohon || "—"}
                    </td>
                  </tr>
              ))}
              {/* Total row */}
              <tr className="border-t border-line print:border-gray-300">
                <td className="py-2 pr-3 text-ink-soft text-xs font-semibold print:text-gray-600">TOTAL</td>
                <td className="py-2 pr-2 text-center font-bold text-brand-700 print:text-teal-700">{totalJaringanBulanIni}</td>
                <td className="py-2 pr-3 text-center font-bold text-brand-700 print:text-teal-700">{totalPohonBulanIni}</td>
                <td className="py-2 pr-2 text-center font-semibold text-ink print:text-black">{totalJaringan}</td>
                <td className="py-2 text-center font-semibold text-ink print:text-black">{totalPohon}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
