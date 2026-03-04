import { ClipboardList } from "lucide-react";
import type { InspeksiItem } from "../_hooks/useCommandCenter";

const STATUS_DOT: Record<string, string> = {
  Temuan: "bg-red-500",
  "Perlu Tindakan": "bg-orange-400",
  Ditugaskan: "bg-blue-400",
  "Dalam Proses": "bg-violet-500",
  Selesai: "bg-emerald-500",
};

const STATUS_BADGE: Record<string, string> = {
  Temuan: "bg-red-50 text-red-700",
  "Perlu Tindakan": "bg-orange-50 text-orange-700",
  Ditugaskan: "bg-blue-50 text-blue-700",
  "Dalam Proses": "bg-violet-50 text-violet-700",
  Selesai: "bg-emerald-50 text-emerald-700",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

interface Props {
  items: InspeksiItem[];
  loading: boolean;
}

export default function InspeksiPanel({ items, loading }: Props) {
  const urgentCount = items.filter((i) => i.status === "Temuan" || i.status === "Perlu Tindakan").length;
  const prosesCount = items.filter((i) => i.status === "Dalam Proses" || i.status === "Ditugaskan").length;
  const selesaiCount = items.filter((i) => i.status === "Selesai").length;

  return (
    <div className="flex flex-col bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-3 py-2.5 shrink-0 flex items-center gap-2">
        <ClipboardList size={13} className="text-teal-200" />
        <span className="text-white text-xs font-bold tracking-wider uppercase">Inspeksi Terbaru</span>
      </div>

      {/* KPI chips */}
      <div className="flex gap-2 px-3 py-2 border-b border-[#F4F6F8] shrink-0">
        <KpiChip value={urgentCount} label="Perlu Tindakan" color="text-red-600 bg-red-50" />
        <KpiChip value={prosesCount} label="Dalam Proses" color="text-violet-600 bg-violet-50" />
        <KpiChip value={selesaiCount} label="Selesai" color="text-emerald-600 bg-emerald-50" />
      </div>

      {/* List */}
      <div className="overflow-y-auto max-h-48">
        {loading && items.length === 0 ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-12 text-xs text-[#94a3b8]">Tidak ada data</div>
        ) : (
          <ul className="divide-y divide-[#F4F6F8]">
            {items.map((item) => (
              <li key={item.id} className="px-3 py-2 hover:bg-[#0d1b2a] transition-colors">
                <div className="flex items-start gap-2">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[item.status] ?? "bg-gray-300"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-[#e2e8f0] truncate max-w-[130px]">
                        {item.lokasi ?? item.penyulang ?? "—"}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${STATUS_BADGE[item.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.ulp && <span className="text-[10px] text-[#94a3b8]">{item.ulp}</span>}
                      <span className="text-[10px] text-[#94a3b8] font-mono ml-auto">
                        {formatDate(item.tgl_inspeksi)}
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

function KpiChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium flex-1 justify-center ${color}`}>
      <span className="font-mono font-bold text-xs">{value}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
