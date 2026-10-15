"use client";

import { useOverloadMonitor, type WeekStats, type WeekDelta, type WeekBounds } from "../_hooks/useOverloadMonitor";

const TODAY = new Date().toISOString().slice(0, 10);

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  bulan: number;
  tahun: number;
  ulp: string;
  bulanLabel: string;
  presentMode?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Delta({ val }: { val: number }) {
  if (val === 0) return <span className="text-gray-400 text-xs ml-1.5 font-medium">─</span>;
  if (val > 0)
    return <span className="text-red-500 text-xs font-bold ml-1.5">▲+{val}</span>;
  return <span className="text-green-600 text-xs font-bold ml-1.5">▼{val}</span>;
}

function WeekLabel({ bounds }: { bounds: WeekBounds }) {
  return (
    <div className="text-center">
      <p className="font-bold text-sm">{bounds.label}</p>
      <p className="text-[10px] text-ink-soft mt-0.5">
        {bounds.startDay}–{bounds.endDay}
      </p>
    </div>
  );
}

interface DataCellProps {
  stats: WeekStats;
  delta: WeekDelta | null;
  field: "overload" | "overbalast" | "total";
  endDate: string;
  presentMode?: boolean;
}

function DataCell({ stats, delta, field, endDate, presentMode }: DataCellProps) {
  // Tampilkan blank jika minggu belum selesai (endDate >= hari ini)
  if (endDate >= TODAY) {
    return (
      <td className="text-center px-2 py-3 border-l border-line">
        <span className="text-ink-soft text-xs">—</span>
      </td>
    );
  }

  const val = stats[field];
  const colorMap = {
    overload:   val > 0 ? "text-red-600 font-bold"   : "text-gray-500",
    overbalast: val > 0 ? "text-amber-600 font-bold" : "text-gray-500",
    total:      val > 0 ? "text-brand-800 font-bold" : "text-gray-500",
  };

  return (
    <td className="text-center px-2 py-3 border-l border-line">
      <div className="flex items-center justify-center">
        <span className={`${presentMode ? "text-2xl" : "text-lg"} ${colorMap[field]}`}>
          {val}
        </span>
        {delta !== null && <Delta val={delta[field]} />}
      </div>
    </td>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OverloadMonitorSection({
  bulan, tahun, ulp, bulanLabel, presentMode,
}: Props) {
  const { data, loading, error } = useOverloadMonitor(bulan, tahun, ulp);

  const rows = [
    {
      icon: "🔴",
      label: "Trafo Overload",
      sub: "beban ≥ 80%",
      field: "overload" as const,
      bg: "bg-red-50",
    },
    {
      icon: "🟡",
      label: "Overbalast",
      sub: "1 fasa > I nominal",
      field: "overbalast" as const,
      bg: "bg-amber-50",
    },
    {
      icon: "📊",
      label: "Total Perlu Tindakan",
      sub: "overload + overbalast",
      field: "total" as const,
      bg: "bg-brand-50",
    },
  ];

  const cardCls = presentMode
    ? "bg-white rounded-2xl border border-line shadow-sm overflow-hidden"
    : "bg-white rounded-xl border border-line shadow-sm overflow-hidden";

  return (
    <div className={cardCls}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-line bg-brand-50 flex items-center justify-between">
        <div>
          <h3 className={`font-bold text-brand-800 ${presentMode ? "text-xl" : "text-base"}`}>
            Monitoring Overload &amp; Overbalast Trafo
          </h3>
          <p className="text-xs text-ink-soft mt-0.5">
            Kumulatif terbaru per gardu sampai akhir tiap minggu · {bulanLabel} · ULP {ulp}
          </p>
        </div>
        <div className="text-[10px] text-brand-700 bg-white rounded-lg px-2.5 py-1.5 border border-brand-200 font-medium">
          ISO 8601 · Senin–Minggu
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-ink-soft text-sm">
          <div className="w-5 h-5 border-4 border-line border-t-brand-600 rounded-full animate-spin" />
          Memuat data pengukuran...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="m-4 bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      {!loading && !error && data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface border-b border-line">
                <th className="text-left px-5 py-2.5 text-ink-soft font-semibold w-48 text-xs uppercase tracking-wide">
                  Indikator
                </th>
                {data.bounds.map((b) => (
                  <th key={b.label} className="px-2 py-2.5 border-l border-line">
                    <WeekLabel bounds={b} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Gardu Terpantau */}
              <tr className="border-b border-line bg-white hover:bg-surface transition-colors">
                <td className="px-5 py-3">
                  <p className="text-xs font-semibold text-ink">Gardu Terpantau</p>
                  <p className="text-[10px] text-ink-soft">gardu unik terukur s.d. akhir minggu</p>
                </td>
                {data.weeks.map((w, i) => (
                  <td key={i} className="text-center px-2 py-3 border-l border-line">
                    {data.bounds[i].endDate < TODAY ? (
                      <span className={`${presentMode ? "text-2xl" : "text-lg"} font-semibold text-ink`}>
                        {w.diukur}
                      </span>
                    ) : (
                      <span className="text-ink-soft text-xs">—</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Dynamic rows: overload, overbalast, total */}
              {rows.map((row) => (
                <tr
                  key={row.field}
                  className={`border-b border-line ${row.bg} hover:opacity-90 transition-opacity`}
                >
                  <td className="px-5 py-3">
                    <p className="text-xs font-semibold text-ink">
                      {row.icon} {row.label}
                    </p>
                    <p className="text-[10px] text-ink-soft">{row.sub}</p>
                  </td>
                  {data.weeks.map((w, i) => (
                    <DataCell
                      key={i}
                      stats={w}
                      delta={data.deltas[i]}
                      field={row.field}
                      endDate={data.bounds[i].endDate}
                      presentMode={presentMode}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend */}
          <div className="px-5 py-3 border-t border-line flex flex-wrap items-center gap-4 text-[10px] text-ink-soft bg-surface">
            <span className="flex items-center gap-1">
              <span className="text-red-500 font-bold text-xs">▲+N</span> Jumlah bertambah (perlu perhatian)
            </span>
            <span className="flex items-center gap-1">
              <span className="text-green-600 font-bold text-xs">▼−N</span> Jumlah berkurang (progres baik)
            </span>
            <span className="flex items-center gap-1">
              <span className="text-gray-400 text-xs">─</span> Tidak berubah dari minggu sebelumnya
            </span>
            <span className="ml-auto">
              Overbalast: arus salah satu fasa ≥ I nominal (kVA×1000 / (√3×400)) namun beban trafo &lt;80%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
