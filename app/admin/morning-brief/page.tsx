"use client";

import { useState } from "react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { useMorningBrief } from "./_hooks/useMorningBrief";
import BriefHeader from "./_components/BriefHeader";
import GangguanBriefSection from "./_components/GangguanBriefSection";
import PengukuranBriefSection from "./_components/PengukuranBriefSection";
import EksekusiBriefSection from "./_components/EksekusiBriefSection";
import {
  InspeksiJaringanBriefSection,
  InspeksiPohonBriefSection,
} from "./_components/InspeksiBriefSection";

const PRINT_STYLE = `
@media print {
  @page { margin: 1.5cm; size: A4; }
  body { background: white !important; font-size: 11px; }
  [data-sidebar], nav, header, aside, .print\\:hidden { display: none !important; }
  .brief-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12pt; }
  .brief-section table { font-size: 10px; }
}
`;

export default function MorningBriefPage() {
  const user = useCurrentUser();
  const isUp3 = canSeeAllUnits(user.role);
  const [filterUlp, setFilterUlp] = useState("");

  const { data, loading, error } = useMorningBrief(user, filterUlp);

  const unitLabel = isUp3
    ? filterUlp ? `ULP ${filterUlp} · UP3 Mataram` : "PLN UP3 Mataram — Semua ULP"
    : `ULP ${user.unit ?? ""} · ${user.role}`;

  const month = data?.monthLabel ?? "";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      <div className="space-y-4">
        <BriefHeader yesterdayLabel={data?.yesterdayLabel ?? "—"} unitLabel={unitLabel} data={data} />

        {/* Filter ULP — UP3 only */}
        {isUp3 && (
          <div className="flex items-center gap-3 print:hidden">
            <span className="text-sm text-[#94a3b8] shrink-0">Filter ULP:</span>
            <select
              value={filterUlp}
              onChange={(e) => setFilterUlp(e.target.value)}
              className="border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] bg-[#162334] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            >
              <option value="">Semua ULP</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
              <div className="w-10 h-10 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
              <p className="text-sm">Memuat morning brief...</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-5 py-4 text-sm">
            <p className="font-semibold mb-1">Gagal memuat data</p>
            <p className="text-red-400/70">{error}</p>
          </div>
        )}

        {!loading && data && (
          <>
            <div className="brief-section">
              <GangguanBriefSection
                items={data.gangguan.items}
                byUlp={data.gangguan.byUlp}
                showUlpBreakdown={isUp3 && !filterUlp}
                totalBulanIni={data.gangguan.totalBulanIni}
                monthLabel={month}
              />
            </div>

            <div className="brief-section">
              <PengukuranBriefSection
                total={data.pengukuran.total}
                totalBulanIni={data.pengukuran.totalBulanIni}
                monthLabel={month}
                overload={data.pengukuran.overload}
                highTemp={data.pengukuran.highTemp}
                woDone={data.pengukuran.woDone}
                amgDone={data.pengukuran.amgDone}
                overloadBulanIni={data.pengukuran.overloadBulanIni}
                highTempBulanIni={data.pengukuran.highTempBulanIni}
                woDoneBulanIni={data.pengukuran.woDoneBulanIni}
                amgDoneBulanIni={data.pengukuran.amgDoneBulanIni}
                petugasRekap={data.pengukuran.petugasRekap}
              />
            </div>

            <div className="brief-section">
              <EksekusiBriefSection
                byEksekutor={data.eksekusi.byEksekutor}
                totalJaringan={data.eksekusi.totalJaringan}
                totalPohon={data.eksekusi.totalPohon}
                totalJaringanBulanIni={data.eksekusi.totalJaringanBulanIni}
                totalPohonBulanIni={data.eksekusi.totalPohonBulanIni}
                monthLabel={month}
              />
            </div>

            <div className="brief-section">
              <InspeksiJaringanBriefSection
                newTemuan={data.inspeksiJaringan.newTemuan}
                selesai={data.inspeksiJaringan.selesai}
                newTemuanBulanIni={data.inspeksiJaringan.newTemuanBulanIni}
                selesaiBulanIni={data.inspeksiJaringan.selesaiBulanIni}
                monthLabel={month}
              />
            </div>

            <div className="brief-section">
              <InspeksiPohonBriefSection
                newTemuan={data.inspeksiPohon.newTemuan}
                selesai={data.inspeksiPohon.selesai}
                sanggatUrgent={data.inspeksiPohon.sanggatUrgent}
                newTemuanBulanIni={data.inspeksiPohon.newTemuanBulanIni}
                selesaiBulanIni={data.inspeksiPohon.selesaiBulanIni}
                monthLabel={month}
              />
            </div>

            <p className="text-center text-[#94a3b8] text-xs pb-4 print:text-gray-400">
              Dibuat otomatis oleh SMART Mataram · {data.yesterdayLabel}
            </p>
          </>
        )}
      </div>
    </>
  );
}
