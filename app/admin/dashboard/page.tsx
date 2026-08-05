"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
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
      {/* ── Toolbar ── Judulnya sudah ada di topbar, jadi di sini cukup kendali. */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`${CHIP} ${period === p.key ? CHIP_ON : CHIP_OFF}`}
          >
            {p.label}
          </button>
        ))}

        <span className="text-[11px] text-ink-muted">
          {o.window.start} s.d. {o.window.end}
          {ulp ? ` · ULP ${ulp}` : user.unit ? ` · ULP ${user.unit}` : " · Semua ULP"}
        </span>

        <div className="flex-1" />

        {bisaPilihUlp && (
          <select value={ulp} onChange={(e) => setUlp(e.target.value)} className={`${FIELD} cursor-pointer`}>
            <option value="">Semua ULP</option>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        )}

        <button onClick={o.refresh} disabled={o.loading} className={BTN_GHOST}>
          <RefreshCw size={14} className={o.loading ? "animate-spin" : ""} />
          Muat Ulang
        </button>
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
