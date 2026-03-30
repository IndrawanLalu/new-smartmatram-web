"use client";

import { Gauge, Thermometer, FileCheck, ClipboardCheck, Users } from "lucide-react";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import { OVERLOAD_PCT, HIGH_TEMP_C } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import type { PetugasRekap } from "../_hooks/useMorningBrief";

interface Props {
  total: number;
  totalBulanIni: number;
  monthLabel: string;
  overload: PengukuranGardu[];
  highTemp: PengukuranGardu[];
  woDone: PengukuranGardu[];
  amgDone: PengukuranGardu[];
  overloadBulanIni: number;
  highTempBulanIni: number;
  woDoneBulanIni: number;
  amgDoneBulanIni: number;
  petugasRekap: PetugasRekap[];
}

export default function PengukuranBriefSection({
  total, totalBulanIni, monthLabel,
  overload, highTemp, woDone, amgDone,
  overloadBulanIni, highTempBulanIni, woDoneBulanIni, amgDoneBulanIni,
  petugasRekap,
}: Props) {
  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] print:bg-white print:border print:border-gray-300">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e3552] print:border-gray-300">
        <div className="bg-teal-500/15 rounded-lg p-2 print:hidden">
          <Gauge size={16} className="text-teal-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-[#e2e8f0] font-semibold print:text-black">Pengukuran Gardu</h2>
          <p className="text-[#94a3b8] text-xs print:text-gray-500">Beban & kondisi gardu</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-[#1e3552] text-[#94a3b8] print:text-gray-500">
            {monthLabel}: <span className="font-bold text-[#e2e8f0] print:text-black">{totalBulanIni}</span>
          </span>
          <span className="bg-teal-500/15 text-teal-400 text-sm font-bold px-3 py-1 rounded-full print:text-teal-700">
            Kemarin: {total}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {total === 0 ? (
          <p className="text-[#94a3b8] text-sm text-center py-4">
            Tidak ada data pengukuran kemarin
          </p>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatPill
                label={`Overload ≥${OVERLOAD_PCT}%`}
                value={overload.length}
                colorClass={overload.length > 0
                  ? "bg-red-500/15 text-red-400 print:text-red-700"
                  : "bg-green-500/10 text-green-400 print:text-green-700"}
                subLabel="s/d kmrn"
                subValue={overloadBulanIni}
              />
              <StatPill
                label={`Suhu >${HIGH_TEMP_C}°C`}
                value={highTemp.length}
                colorClass={highTemp.length > 0
                  ? "bg-orange-500/15 text-orange-400 print:text-orange-700"
                  : "bg-green-500/10 text-green-400 print:text-green-700"}
                subLabel="s/d kmrn"
                subValue={highTempBulanIni}
              />
              <StatPill
                label="WO Dikirim"
                value={woDone.length}
                colorClass="bg-blue-500/15 text-blue-400 print:text-blue-700"
                subLabel={monthLabel}
                subValue={woDoneBulanIni}
              />
              <StatPill
                label="AMG di-Input"
                value={amgDone.length}
                colorClass="bg-purple-500/15 text-purple-400 print:text-purple-700"
                subLabel={monthLabel}
                subValue={amgDoneBulanIni}
              />
            </div>

            {/* Petugas rekap */}
            {petugasRekap.length > 0 && (
              <div>
                <p className="text-[#e2e8f0] text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Users size={12} className="text-teal-400" />
                  Rekap Per Petugas
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e3552] print:border-gray-300">
                      <th className="text-left py-1.5 pr-4 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Petugas</th>
                      <th className="text-center py-1.5 pr-4 text-[#94a3b8] font-semibold text-xs print:text-gray-600">{monthLabel}</th>
                      <th className="text-center py-1.5 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Kemarin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {petugasRekap.map((p) => (
                      <tr key={p.nama} className="border-b border-[#1e3552]/50 last:border-0 print:border-gray-200">
                        <td className="py-2 pr-4 text-[#e2e8f0] font-medium text-sm print:text-black">{p.nama}</td>
                        <td className="py-2 pr-4 text-center">
                          <span className="bg-teal-500/15 text-teal-400 text-xs font-bold px-2 py-0.5 rounded print:text-teal-700">
                            {p.jumlahBulanIni}
                          </span>
                        </td>
                        <td className="py-2 text-center text-[#e2e8f0] font-medium print:text-black">
                          {p.jumlah > 0 ? p.jumlah : <span className="text-[#94a3b8]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Overload */}
            {overload.length > 0 && (
              <div>
                <p className="text-[#e2e8f0] text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Gauge size={12} className="text-red-400" />Gardu Overload
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e3552] print:border-gray-300">
                      <th className="text-left py-1.5 pr-4 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Gardu</th>
                      <th className="text-left py-1.5 pr-4 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Penyulang</th>
                      <th className="text-right py-1.5 pr-4 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Beban</th>
                      <th className="text-right py-1.5 text-[#94a3b8] font-semibold text-xs print:text-gray-600">kVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overload.map((r) => (
                      <tr key={r.id} className="border-b border-[#1e3552]/50 last:border-0 print:border-gray-200">
                        <td className="py-2 pr-4 text-[#e2e8f0] font-medium print:text-black">{r.no_gardu}</td>
                        <td className="py-2 pr-4 text-[#94a3b8] text-xs print:text-gray-600">{r.penyulang ?? "-"}</td>
                        <td className="py-2 pr-4 text-right">
                          <span className="bg-red-500/15 text-red-400 text-xs font-bold px-2 py-0.5 rounded print:text-red-700">
                            {r.persen_beban.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2 text-right text-[#94a3b8] text-xs print:text-gray-600">{r.kva_trafo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* High temp */}
            {highTemp.length > 0 && (
              <div>
                <p className="text-[#e2e8f0] text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Thermometer size={12} className="text-orange-400" />Suhu Tinggi (&gt;{HIGH_TEMP_C}°C)
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e3552] print:border-gray-300">
                      <th className="text-left py-1.5 pr-4 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Gardu</th>
                      <th className="text-left py-1.5 pr-4 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Penyulang</th>
                      <th className="text-right py-1.5 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Suhu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highTemp.map((r) => (
                      <tr key={r.id} className="border-b border-[#1e3552]/50 last:border-0 print:border-gray-200">
                        <td className="py-2 pr-4 text-[#e2e8f0] font-medium print:text-black">{r.no_gardu}</td>
                        <td className="py-2 pr-4 text-[#94a3b8] text-xs print:text-gray-600">{r.penyulang ?? "-"}</td>
                        <td className="py-2 text-right">
                          <span className="bg-orange-500/15 text-orange-400 text-xs font-bold px-2 py-0.5 rounded print:text-orange-700">
                            {r.suhu_trafo}°C
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* WO + AMG */}
            {(woDone.length > 0 || amgDone.length > 0) && (
              <div className="flex flex-wrap gap-3">
                {woDone.length > 0 && (
                  <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 print:border-blue-300">
                    <FileCheck size={14} className="text-blue-400 print:text-blue-600" />
                    <span className="text-blue-300 text-sm print:text-blue-700">
                      <span className="font-semibold">{woDone.length}</span> gardu sudah di-WO
                    </span>
                  </div>
                )}
                {amgDone.length > 0 && (
                  <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2 print:border-purple-300">
                    <ClipboardCheck size={14} className="text-purple-400 print:text-purple-600" />
                    <span className="text-purple-300 text-sm print:text-purple-700">
                      <span className="font-semibold">{amgDone.length}</span> gardu sudah di-AMG
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatPill({
  label, value, colorClass, subLabel, subValue,
}: {
  label: string;
  value: number;
  colorClass: string;
  subLabel?: string;
  subValue?: number;
}) {
  return (
    <div className={`rounded-lg px-4 py-3 text-center ${colorClass}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
      {subLabel !== undefined && subValue !== undefined && (
        <p className="text-xs mt-1 opacity-60">
          {subLabel}: <span className="font-semibold">{subValue}</span>
        </p>
      )}
    </div>
  );
}
