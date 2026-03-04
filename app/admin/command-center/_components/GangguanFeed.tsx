import { Zap } from "lucide-react";
import type { GangguanItem } from "../_hooks/useCommandCenter";

const ULP_COLOR: Record<string, string> = {
  AMPENAN: "bg-blue-100 text-blue-700",
  CAKRANEGARA: "bg-purple-100 text-purple-700",
  GERUNG: "bg-teal-100 text-teal-700",
  TANJUNG: "bg-orange-100 text-orange-700",
};

function getDotColor(parsedDate: Date | null): string {
  if (!parsedDate) return "bg-gray-300";
  const diffDays = (Date.now() - parsedDate.getTime()) / 86_400_000;
  if (diffDays <= 1) return "bg-red-500 animate-pulse";
  if (diffDays <= 7) return "bg-amber-400";
  if (diffDays <= 30) return "bg-yellow-300";
  return "bg-gray-300";
}

function formatTanggal(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  items: GangguanItem[];
  loading: boolean;
}

export default function GangguanFeed({ items, loading }: Props) {
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-amber-300" />
          <span className="text-white text-xs font-bold tracking-wider uppercase">Gangguan Penyulang · Bulan Ini</span>
          <span className="ml-auto bg-white/20 text-white text-xs font-mono px-1.5 py-0.5 rounded-md">
            {items.length}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <LoadingSkeleton />
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-[#5D6D7E]">Tidak ada data</div>
        ) : (
          <ul className="divide-y divide-[#F4F6F8]">
            {items.map((g, i) => (
              <li key={i} className="px-3 py-2 hover:bg-[#F4F6F8] transition-colors">
                <div className="flex items-start gap-2">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${getDotColor(g.parsedDate)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-[#1B2631] truncate max-w-[120px]">
                        {g.penyulang || "—"}
                      </span>
                      {g.ulp && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${ULP_COLOR[g.ulp.toUpperCase()] ?? "bg-gray-100 text-gray-600"}`}>
                          {g.ulp}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {g.durasi && (
                        <span className="text-[10px] font-mono text-red-600 font-medium">{g.durasi}</span>
                      )}
                      {g.indikator && (
                        <span className="text-[10px] bg-gray-100 text-[#5D6D7E] px-1 rounded">{g.indikator}</span>
                      )}
                      <span className="text-[10px] text-[#5D6D7E] ml-auto font-mono">
                        {formatTanggal(g.parsedDate)}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-3 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-2 items-start animate-pulse">
          <div className="w-2 h-2 rounded-full bg-gray-200 mt-1 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-gray-200 rounded w-3/4" />
            <div className="h-2.5 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
