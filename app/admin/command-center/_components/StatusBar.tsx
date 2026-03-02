import { RefreshCw, Zap, AlertTriangle, ClipboardList, Building2 } from "lucide-react";

interface Props {
  gangguanCount: number;
  overloadCount: number;
  urgentCount: number;
  garduCount: number;
  lastRefresh: Date | null;
  loading: boolean;
  onRefresh: () => void;
}

export default function StatusBar({
  gangguanCount,
  overloadCount,
  urgentCount,
  garduCount,
  lastRefresh,
  loading,
  onRefresh,
}: Props) {
  const timeStr = lastRefresh
    ? lastRefresh.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-2.5 flex items-center gap-4 shrink-0">
      {/* LIVE indicator */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <span className="text-xs font-bold text-emerald-600 tracking-widest">LIVE</span>
        <span className="text-xs text-[#5D6D7E] font-mono">· {timeStr}</span>
      </div>

      <div className="w-px h-4 bg-[#E2E8F0] shrink-0" />

      {/* Stats chips */}
      <div className="flex items-center gap-2 flex-1 flex-wrap">
        <StatChip
          icon={<Zap size={11} />}
          label="Gangguan bln ini"
          value={gangguanCount}
          color="text-amber-600 bg-amber-50 border-amber-200"
        />
        <StatChip
          icon={<AlertTriangle size={11} />}
          label="Gardu overload"
          value={overloadCount}
          color={overloadCount > 0 ? "text-red-600 bg-red-50 border-red-200" : "text-[#5D6D7E] bg-gray-50 border-[#E2E8F0]"}
          pulse={overloadCount > 0}
        />
        <StatChip
          icon={<ClipboardList size={11} />}
          label="Inspeksi urgent"
          value={urgentCount}
          color={urgentCount > 0 ? "text-orange-600 bg-orange-50 border-orange-200" : "text-[#5D6D7E] bg-gray-50 border-[#E2E8F0]"}
        />
        <StatChip
          icon={<Building2 size={11} />}
          label="Gardu terpantau"
          value={garduCount}
          color="text-[#00695C] bg-[#E0F2F1] border-teal-200"
        />
      </div>

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={loading}
        title="Refresh data"
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-[#E2E8F0] text-[#5D6D7E] hover:bg-[#E0F2F1] hover:text-[#00695C] hover:border-teal-200 transition-colors disabled:opacity-40"
      >
        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  color,
  pulse = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${color} ${pulse ? "animate-pulse" : ""}`}>
      {icon}
      <span className="font-mono font-bold">{value}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
