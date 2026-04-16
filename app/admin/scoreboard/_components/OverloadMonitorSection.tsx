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
      <p className="text-[10px] text-[#5D6D7E] mt-0.5">
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
      <td className="text-center px-2 py-3 border-l border-[#E2E8F0]">
        <span className="text-gray-300 text-xs">—</span>
      </td>
    );
  }

  const val = stats[field];
  const colorMap = {
    overload:   val > 0 ? "text-red-600 font-bold"   : "text-gray-500",
    overbalast: val > 0 ? "text-amber-600 font-bold" : "text-gray-500",
    total:      val > 0 ? "text-[#004D40] font-bold" : "text-gray-500",
  };

  return (
    <td className="text-center px-2 py-3 border-l border-[#E2E8F0]">
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
      bg: "bg-[#E0F2F1]",
    },
  ];

  const cardCls = presentMode
    ? "bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden"
    : "bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden";

  return (
    <div className={cardCls}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#E0F2F1] flex items-center justify-between">
        <div>
          <h3 className={`font-bold text-[#004D40] ${presentMode ? "text-xl" : "text-base"}`}>
            Monitoring Overload &amp; Overbalast Trafo
          </h3>
          <p className="text-xs text-[#5D6D7E] mt-0.5">
            Kumulatif terbaru per gardu sampai akhir tiap minggu · {bulanLabel} · ULP {ulp}
          </p>
        </div>
        <div className="text-[10px] text-[#00695C] bg-white rounded-lg px-2.5 py-1.5 border border-[#B2DFDB] font-medium">
          ISO 8601 · Senin–Minggu
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-[#5D6D7E] text-sm">
          <div className="w-5 h-5 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
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
              <tr className="bg-[#F4F6F8] border-b border-[#E2E8F0]">
                <th className="text-left px-5 py-2.5 text-[#5D6D7E] font-semibold w-48 text-xs uppercase tracking-wide">
                  Indikator
                </th>
                {data.bounds.map((b) => (
                  <th key={b.label} className="px-2 py-2.5 border-l border-[#E2E8F0]">
                    <WeekLabel bounds={b} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Gardu Terpantau */}
              <tr className="border-b border-[#E2E8F0] bg-white hover:bg-[#F4F6F8] transition-colors">
                <td className="px-5 py-3">
                  <p className="text-xs font-semibold text-[#1B2631]">Gardu Terpantau</p>
                  <p className="text-[10px] text-[#5D6D7E]">gardu unik terukur s.d. akhir minggu</p>
                </td>
                {data.weeks.map((w, i) => (
                  <td key={i} className="text-center px-2 py-3 border-l border-[#E2E8F0]">
                    {data.bounds[i].endDate < TODAY ? (
                      <span className={`${presentMode ? "text-2xl" : "text-lg"} font-semibold text-[#1B2631]`}>
                        {w.diukur}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Dynamic rows: overload, overbalast, total */}
              {rows.map((row) => (
                <tr
                  key={row.field}
                  className={`border-b border-[#E2E8F0] ${row.bg} hover:opacity-90 transition-opacity`}
                >
                  <td className="px-5 py-3">
                    <p className="text-xs font-semibold text-[#1B2631]">
                      {row.icon} {row.label}
                    </p>
                    <p className="text-[10px] text-[#5D6D7E]">{row.sub}</p>
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
          <div className="px-5 py-3 border-t border-[#E2E8F0] flex flex-wrap items-center gap-4 text-[10px] text-[#5D6D7E] bg-[#F4F6F8]">
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
