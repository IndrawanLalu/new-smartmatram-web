"use client";

import { useMemo, useState } from "react";
import { type CurrentUser } from "@/lib/roles";
import { type InspeksiJaringan } from "../_hooks/useInspeksiJaringan";
import { type InspeksiPohon } from "../_hooks/useInspeksiPohon";

// ── Constants ─────────────────────────────────────────────────────────────────

const JARINGAN_TEAMS = ["HARJAR", "HARGAR", "YANGU", "PDKB"] as const;
const POHON_TEAMS = ["RABAS 1", "RABAS 2", "RABAS 3", "PDKB"] as const;
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamStats {
  name: string;
  total: number;
  selesai: number;
  dalamProses: number;
  ditugaskan: number;
  perluTindakan: number;
  pct: number;
}

interface SectionStats {
  teamStats: TeamStats[];
  unassigned: number;
  total: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeStats<T extends { status: string }>(
  data: T[],
  teams: readonly string[],
  getTeam: (row: T) => string | null | undefined
): SectionStats {
  const teamStats: TeamStats[] = teams.map((name) => {
    const rows = data.filter((d) => getTeam(d) === name);
    const selesai = rows.filter((d) => d.status === "Selesai").length;
    const dalamProses = rows.filter((d) => d.status === "Dalam Proses").length;
    const ditugaskan = rows.filter((d) => d.status === "Ditugaskan").length;
    const perluTindakan = rows.filter(
      (d) => d.status === "Temuan" || d.status === "Perlu Tindakan"
    ).length;
    return {
      name,
      total: rows.length,
      selesai,
      dalamProses,
      ditugaskan,
      perluTindakan,
      pct: rows.length > 0 ? Math.round((selesai / rows.length) * 100) : 0,
    };
  });

  const unassigned = data.filter((d) => !getTeam(d)).length;
  return { teamStats, unassigned, total: data.length };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  variant = "default",
}: {
  label: string;
  value: number;
  sub: string;
  variant?: "default" | "success" | "warning";
}) {
  const variantClass = {
    default: "border-[#1e3552]",
    success: "border-green-200 bg-green-50",
    warning: "border-orange-200 bg-orange-50",
  }[variant];

  const valueClass = {
    default: "text-[#e2e8f0]",
    success: "text-green-700",
    warning: "text-orange-700",
  }[variant];

  return (
    <div className={`bg-[#162334] rounded-xl border p-4 ${variantClass}`}>
      <p className="text-xs text-[#94a3b8] mb-1">{label}</p>
      <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
      <p className="text-xs text-[#94a3b8] mt-1">{sub}</p>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-[#00897B]" : pct >= 20 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TeamCard({ stats }: { stats: TeamStats }) {
  if (stats.total === 0) {
    return (
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-4 opacity-50">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-[#e2e8f0]">{stats.name}</span>
          <span className="text-xs text-[#94a3b8]">Tidak ada data</span>
        </div>
        <ProgressBar pct={0} />
      </div>
    );
  }

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-[#e2e8f0]">{stats.name}</span>
        <span
          className={`text-sm font-bold px-2 py-0.5 rounded-full ${
            stats.pct >= 80
              ? "bg-green-100 text-green-700"
              : stats.pct >= 50
              ? "bg-[#0a2a26] text-[#5eead4]"
              : stats.pct >= 20
              ? "bg-yellow-50 text-yellow-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {stats.pct}%
        </span>
      </div>

      <ProgressBar pct={stats.pct} />

      <p className="text-xs text-[#94a3b8] mt-2 mb-3">
        {stats.selesai} / {stats.total} selesai
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[#94a3b8]">Selesai</span>
          <span className="ml-auto font-semibold text-[#e2e8f0]">{stats.selesai}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          <span className="text-[#94a3b8]">Dalam Proses</span>
          <span className="ml-auto font-semibold text-[#e2e8f0]">{stats.dalamProses}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[#94a3b8]">Ditugaskan</span>
          <span className="ml-auto font-semibold text-[#e2e8f0]">{stats.ditugaskan}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-[#94a3b8]">Temuan</span>
          <span className="ml-auto font-semibold text-[#e2e8f0]">{stats.perluTindakan}</span>
        </div>
      </div>
    </div>
  );
}

function TeamSection({
  title,
  stats,
  icon,
}: {
  title: string;
  stats: SectionStats;
  icon: string;
}) {
  const assigned = stats.total - stats.unassigned;
  const totalSelesai = stats.teamStats.reduce((s, t) => s + t.selesai, 0);
  const overallPct = assigned > 0 ? Math.round((totalSelesai / assigned) * 100) : 0;

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-[#1e3552] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-semibold text-[#e2e8f0]">{title}</h3>
          <span className="text-xs text-[#94a3b8] bg-gray-100 px-2 py-0.5 rounded-full">
            {stats.total} total
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#94a3b8]">
          {stats.unassigned > 0 && (
            <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              {stats.unassigned} belum ditugaskan
            </span>
          )}
          <span>
            Progress keseluruhan:{" "}
            <span className="font-semibold text-[#e2e8f0]">{overallPct}%</span>
          </span>
        </div>
      </div>

      {/* Team cards grid */}
      <div className="p-5">
        {stats.total === 0 ? (
          <p className="text-center py-8 text-[#94a3b8] text-sm">
            Tidak ada data untuk periode ini
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.teamStats.map((t) => (
              <TeamCard key={t.name} stats={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  user: CurrentUser;
  jaringanData: InspeksiJaringan[];
  pohonData: InspeksiPohon[];
}

export default function InspeksiDashboardTab({ user: _user, jaringanData, pohonData }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const filteredJaringan = useMemo(
    () => jaringanData.filter((d) => d.tgl_inspeksi?.startsWith(monthKey)),
    [jaringanData, monthKey]
  );

  const filteredPohon = useMemo(
    () => pohonData.filter((d) => d.tgl_inspeksi?.startsWith(monthKey)),
    [pohonData, monthKey]
  );

  const jaringanStats = useMemo(
    () => computeStats(filteredJaringan, JARINGAN_TEAMS, (d) => d.eksekutor),
    [filteredJaringan]
  );

  const pohonStats = useMemo(
    () => computeStats(filteredPohon, POHON_TEAMS, (d) => d.team_name),
    [filteredPohon]
  );

  const totalSelesai =
    filteredJaringan.filter((d) => d.status === "Selesai").length +
    filteredPohon.filter((d) => d.status === "Selesai").length;

  const totalBelumDitugaskan = jaringanStats.unassigned + pohonStats.unassigned;

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-[#e2e8f0]">Periode:</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]"
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="text-xs text-[#94a3b8] ml-1">
          Menampilkan data inspeksi bulan {MONTHS[month - 1]} {year}
        </span>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Inspeksi Jaringan"
          value={filteredJaringan.length}
          sub={`${MONTHS[month - 1]} ${year}`}
        />
        <SummaryCard
          label="Total Inspeksi Pohon"
          value={filteredPohon.length}
          sub={`${MONTHS[month - 1]} ${year}`}
        />
        <SummaryCard
          label="Total Selesai"
          value={totalSelesai}
          sub="jaringan + pohon"
          variant="success"
        />
        <SummaryCard
          label="Belum Ditugaskan"
          value={totalBelumDitugaskan}
          sub="jaringan + pohon"
          variant={totalBelumDitugaskan > 0 ? "warning" : "default"}
        />
      </div>

      {/* Jaringan section */}
      <TeamSection
        title="Progress Tim Jaringan"
        stats={jaringanStats}
        icon="⚡"
      />

      {/* Pohon section */}
      <TeamSection
        title="Progress Tim Pohon (PERABASAN)"
        stats={pohonStats}
        icon="🌳"
      />
    </div>
  );
}
