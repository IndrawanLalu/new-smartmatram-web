"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
// CHIP_ON/CHIP_OFF tidak dipakai: chip periode berdiri di atas bidang navy,
// sementara pasangan itu dirancang untuk latar terang.
import { BTN_ON_NAVY, CARD, CHIP, DISPLAY } from "@/app/admin/_ui";
import {
  PERIOD_OPTIONS, useDashboardOverview, type PeriodKey,
} from "./_hooks/useDashboardOverview";
import ActionBar from "./_components/ActionBar";
import KpiStrip from "./_components/KpiStrip";
import RisikoPanel from "./_components/RisikoPanel";
import DomainGrid from "./_components/DomainGrid";

/** Recharts berat dan hanya dipakai satu panel — jangan ikut membebani muat awal. */
const TrenGangguan = dynamic(() => import("./_components/TrenGangguan"), {
  ssr: false,
  loading: () => <div className={`${CARD} h-full min-h-[300px] animate-pulse`} />,
});

export default function DashboardPage() {
  const user = useCurrentUser();
  const [period, setPeriod] = useState<PeriodKey>("bulan");
  const [ulp, setUlp] = useState("");

  const o = useDashboardOverview(user, period, ulp);
  const bisaPilihUlp = canSeeAllUnits(user.role);

  return (
    // Halaman terang menetapkan warna tinta di root-nya sendiri — `text-ink`
    // sengaja tidak dipasang global di layout admin selama masih ada halaman gelap.
    <div className="space-y-3 text-ink">
      {/* ── Header ── */}
      <div className="bg-navy-600 rounded-2xl px-5 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/12 grid place-items-center shrink-0">
              <LayoutDashboard size={19} />
            </div>
            <div className="min-w-0">
              <h1 className={`${DISPLAY} text-lg font-bold leading-tight`}>Dashboard Operasional</h1>
              <p className="text-white/70 text-xs truncate">
                Seluruh jenis pekerjaan dalam satu ringkasan
                {ulp ? ` · ULP ${ulp}` : user.unit ? ` · ULP ${user.unit}` : " · Semua ULP"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {bisaPilihUlp && (
              <select
                value={ulp}
                onChange={(e) => setUlp(e.target.value)}
                className="h-9 rounded-xl bg-white/12 border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-white/40 cursor-pointer"
              >
                <option value="" className="text-ink">Semua ULP</option>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value} className="text-ink">
                    {u.label}
                  </option>
                ))}
              </select>
            )}

            <button onClick={o.refresh} disabled={o.loading} className={BTN_ON_NAVY}>
              <RefreshCw size={14} className={o.loading ? "animate-spin" : ""} />
              Muat Ulang
            </button>
          </div>
        </div>

        {/* Periode */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`${CHIP} ${
                period === p.key
                  ? "bg-white text-navy-600 border-white"
                  : "bg-white/10 border-white/20 text-white/80 hover:bg-white/20"
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="text-[11px] text-white/55 ml-1">
            {o.window.start} s.d. {o.window.end}
          </span>
        </div>
      </div>

      {o.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {o.error}
        </div>
      )}

      {/* ── Butuh tindakan ── */}
      <ActionBar items={o.agenda} loading={o.loading} />

      {/* ── KPI lintas domain ── */}
      <KpiStrip
        kpi={o.kpi}
        wo={{ pct: o.wo.pct, total: o.wo.total, selesai: o.wo.selesai }}
        produktivitas={o.produktivitas}
        tren={o.tren}
        prevLabel={o.window.prevLabel}
        loading={o.loading}
      />

      {/* ── Tren gangguan + prediksi risiko ── */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrenGangguan data={o.trenChart} period={o.period} loading={o.loading} />
        </div>
        <RisikoPanel
          tgl={o.risiko.tgl}
          kritis={o.risiko.kritis}
          waspada={o.risiko.waspada}
          teratas={o.risiko.teratas}
          loading={o.loading}
        />
      </div>

      {/* ── Rincian per domain ── */}
      <DomainGrid
        inspeksi={o.inspeksi}
        wo={o.wo}
        gardu={o.gardu}
        pemerataan={o.pemerataan}
        produktivitas={o.produktivitas}
        gangguan={o.gangguan}
      />

      <div className="h-2" />
    </div>
  );
}
