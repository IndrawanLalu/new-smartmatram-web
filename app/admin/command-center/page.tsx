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

export default function CommandCenterPage() {
  const user = useCurrentUser();
  const { gangguanFeed, inspeksiFeed, garduList, loading, lastRefresh, refresh } =
    useCommandCenter(user);
  const { latestData, overloadData, highTempData, highCurrentItems, avgBeban, loading: loadingGardu } =
    usePengukuranGardu(user);

  const now = new Date();

  // Gangguan bulan ini
  const gangguanCountThisMonth = useMemo(
    () =>
      gangguanFeed.filter(
        (g) =>
          g.parsedDate &&
          g.parsedDate.getMonth() === now.getMonth() &&
          g.parsedDate.getFullYear() === now.getFullYear()
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gangguanFeed]
  );

  // Top 3 penyulang terbanyak gangguan bulan ini
  const gangguanTerbanyak = useMemo(() => {
    const map = new Map<string, number>();
    gangguanFeed
      .filter(
        (g) =>
          g.parsedDate &&
          g.parsedDate.getMonth() === now.getMonth() &&
          g.parsedDate.getFullYear() === now.getFullYear()
      )
      .forEach((g) => {
        if (g.penyulang) map.set(g.penyulang, (map.get(g.penyulang) ?? 0) + 1);
      });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([penyulang, count]) => ({ penyulang, count }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gangguanFeed]);

  const urgentCount = useMemo(
    () => inspeksiFeed.filter((i) => i.status === "Temuan" || i.status === "Perlu Tindakan").length,
    [inspeksiFeed]
  );

  const prosesCount = useMemo(
    () => inspeksiFeed.filter((i) => i.status === "Dalam Proses" || i.status === "Ditugaskan").length,
    [inspeksiFeed]
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
    <div className="h-[calc(100vh-48px)] flex flex-col gap-3 overflow-hidden">
      {/* Status Bar */}
      <StatusBar
        gangguanCount={gangguanCountThisMonth}
        overloadCount={overloadData.length}
        urgentCount={urgentCount}
        garduCount={latestData.length}
        lastRefresh={lastRefresh}
        loading={loading || loadingGardu}
        onRefresh={refresh}
      />

      {/* Main Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-[288px_1fr_288px] gap-3">

        {/* Kolom Kiri: Gangguan Feed + Inspeksi */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0">
            <GangguanFeed items={gangguanFeed} loading={loading} />
          </div>
          <InspeksiPanel items={inspeksiFeed} loading={loading} />
        </div>

        {/* Kolom Tengah: Peta + Beban Strip */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0">
            <GarduMapPanel garduList={garduList} latestData={latestData} />
          </div>
          <BebanStrip latestData={latestData} avgBeban={avgBeban} />
        </div>

        {/* Kolom Kanan: Alert Panel + AI Insight */}
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
  );
}
