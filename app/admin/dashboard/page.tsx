"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { BTN_GHOST, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import {
  PERIOD_OPTIONS, useDashboardOverview, type PeriodKey,
} from "./_hooks/useDashboardOverview";
import ActionBar from "./_components/ActionBar";
import KpiStrip from "./_components/KpiStrip";
import SeksiNav from "./_components/SeksiNav";
import SeksiGangguan from "./_components/SeksiGangguan";
import SeksiGardu from "./_components/SeksiGardu";
import SeksiApkt from "./_components/SeksiApkt";
import SeksiInspeksi from "./_components/SeksiInspeksi";
import SeksiPekerjaan from "./_components/SeksiPekerjaan";

/** Garis pemisah antar seksi — cukup tipis supaya tidak jadi elemen sendiri,
 *  tapi ada, karena tanpa jeda kelima seksi terbaca sebagai satu tumpukan. */
const PEMISAH = "border-t border-line pt-4 mt-4";

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

      <SeksiNav />

      {/* ── Seksi per domain ── */}
      <div className={PEMISAH}>
        <SeksiGangguan
          gangguan={o.gangguan}
          padam={o.padam}
          trenChart={o.trenChart}
          period={o.period}
          risiko={{
            tgl: o.risiko.tgl,
            kritis: o.risiko.kritis,
            waspada: o.risiko.waspada,
            teratas: o.risiko.teratas,
            loading: o.loading,
          }}
          loading={o.loading}
        />
      </div>

      <div className={PEMISAH}>
        <SeksiGardu gardu={o.gardu} pemerataan={o.pemerataan} />
      </div>

      <div className={PEMISAH}>
        <SeksiApkt apkt={o.apkt} />
      </div>

      <div className={PEMISAH}>
        <SeksiInspeksi inspeksi={o.inspeksi} />
      </div>

      <div className={PEMISAH}>
        <SeksiPekerjaan wo={o.wo} produktivitas={o.produktivitas} />
      </div>

      <div className="h-2" />
    </div>
  );
}
