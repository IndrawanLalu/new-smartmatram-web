"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useCommandCenter } from "./_hooks/useCommandCenter";
import { usePengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import StatusBar from "./_components/StatusBar";
import GangguanFeed from "./_components/GangguanFeed";
import GarduMapPanel from "./_components/GarduMapPanel";
import AlertPanel from "./_components/AlertPanel";
import InspeksiPanel from "./_components/InspeksiPanel";
import BebanStrip from "./_components/BebanStrip";
import AiInsightPanel, { type AiInsightData } from "./_components/AiInsightPanel";
import GangguanPerUlpCard from "./_components/GangguanPerUlpCard";
import GangguanBulanIniCard from "./_components/GangguanBulanIniCard";
import Top10PenyulangCard from "./_components/Top10PenyulangCard";

export default function CommandCenterPage() {
  const user = useCurrentUser();
  const { gangguanFeed, gangguanAll, inspeksiFeed, garduList, loading, lastRefresh, refresh } =
    useCommandCenter(user);
  const { latestData, overloadData, highTempData, highCurrentItems, avgBeban, loading: loadingGardu } =
    usePengukuranGardu(user);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Gangguan bulan ini (untuk StatusBar & AI)
  const gangguanCountThisMonth = useMemo(
    () =>
      gangguanAll.filter(
        (g) =>
          g.parsedDate?.getMonth() === currentMonth &&
          g.parsedDate?.getFullYear() === currentYear
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gangguanAll]
  );

  // Untuk AI: top 3 penyulang bulan ini
  const gangguanTerbanyak = useMemo(() => {
    const map = new Map<string, number>();
    gangguanAll
      .filter(
        (g) =>
          g.parsedDate?.getMonth() === currentMonth &&
          g.parsedDate?.getFullYear() === currentYear
      )
      .forEach((g) => {
        if (g.penyulang) map.set(g.penyulang, (map.get(g.penyulang) ?? 0) + 1);
      });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([penyulang, count]) => ({ penyulang, count }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gangguanAll]);

  const urgentCount = useMemo(
    () => inspeksiFeed.filter((i) => i.status === "Temuan" || i.status === "Perlu Tindakan").length,
    [inspeksiFeed]
  );

  const prosesCount = useMemo(
    () => inspeksiFeed.filter((i) => i.status === "Dalam Proses" || i.status === "Ditugaskan").length,
    [inspeksiFeed]
  );

  // Data untuk Top 10 cards (filtered by period)
  const gangguanTahunIni = useMemo(
    () => gangguanAll.filter((g) => g.parsedDate?.getFullYear() === currentYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gangguanAll]
  );

  const gangguanBulanIni = useMemo(
    () =>
      gangguanAll.filter(
        (g) =>
          g.parsedDate?.getMonth() === currentMonth &&
          g.parsedDate?.getFullYear() === currentYear
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gangguanAll]
  );

  // Data summary untuk AI
  const aiData: AiInsightData = useMemo(
    () => ({
      tanggal: now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      unit: user.unit ?? "Semua ULP",
      gangguanCount: gangguanCountThisMonth,
      gangguanTerbanyak,
      garduTerpantau: latestData.length,
      avgBeban,
      garduOverload: overloadData.map((g) => ({
        no_gardu: g.no_gardu,
        persen_beban: g.persen_beban,
        penyulang: g.penyulang,
      })),
      garduSuhuTinggi: highTempData.map((g) => ({ no_gardu: g.no_gardu, suhu: g.suhu_trafo })),
      inspeksiUrgent: urgentCount,
      inspeksiDalamProses: prosesCount,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gangguanCountThisMonth, gangguanTerbanyak, latestData, avgBeban, overloadData, highTempData, urgentCount, prosesCount]
  );

  return (
    <div className="flex flex-col gap-3">

      {/* ── BAGIAN ATAS: Layar Penuh (above the fold) ─────────────── */}
      <div className="h-[calc(100vh-48px)] flex flex-col gap-3">
        <StatusBar
          gangguanCount={gangguanCountThisMonth}
          overloadCount={overloadData.length}
          urgentCount={urgentCount}
          garduCount={latestData.length}
          lastRefresh={lastRefresh}
          loading={loading || loadingGardu}
          onRefresh={refresh}
        />

        <div className="flex-1 min-h-0 grid grid-cols-[288px_1fr_288px] gap-3">
          {/* Kolom Kiri */}
          <div className="flex flex-col gap-3 min-h-0">
            <div className="flex-1 min-h-0">
              <GangguanFeed items={gangguanFeed} loading={loading} />
            </div>
            <InspeksiPanel items={inspeksiFeed} loading={loading} />
          </div>

          {/* Kolom Tengah */}
          <div className="flex flex-col gap-3 min-h-0">
            <div className="flex-1 min-h-0">
              <GarduMapPanel garduList={garduList} latestData={latestData} />
            </div>
            <BebanStrip latestData={latestData} avgBeban={avgBeban} />
          </div>

          {/* Kolom Kanan */}
          <div className="flex flex-col gap-3 min-h-0">
            <div className="flex-1 min-h-0">
              <AlertPanel
                overloadData={overloadData}
                highTempData={highTempData}
                highCurrentItems={highCurrentItems}
              />
            </div>
            <AiInsightPanel data={aiData} />
          </div>
        </div>
      </div>

      {/* ── BAGIAN BAWAH: Statistik (scroll ke bawah) ─────────────── */}

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-[#E2E8F0]" />
        <span className="text-[11px] font-semibold text-[#5D6D7E] uppercase tracking-widest">
          Statistik Gangguan
        </span>
        <div className="flex-1 h-px bg-[#E2E8F0]" />
      </div>

      {/* Row 1: Gangguan per ULP */}
      <div className="grid grid-cols-2 gap-3">
        <GangguanPerUlpCard items={gangguanAll} />
        <GangguanBulanIniCard items={gangguanAll} />
      </div>

      {/* Row 2: Top 10 Penyulang */}
      <div className="grid grid-cols-2 gap-3 pb-3">
        <Top10PenyulangCard
          items={gangguanTahunIni}
          title="Top 10 Penyulang"
          subtitle={`Tahun ${currentYear}`}
          headerFrom="#004D40"
          headerTo="#00897B"
        />
        <Top10PenyulangCard
          items={gangguanBulanIni}
          title="Top 10 Penyulang"
          subtitle={`Bulan Ini`}
          headerFrom="#7B1FA2"
          headerTo="#9C27B0"
        />
      </div>

    </div>
  );
}
