import type { LucideIcon } from "lucide-react";

type Tone = "slate" | "green" | "orange" | "teal";

const TONE: Record<Tone, { chip: string; icon: string; value: string }> = {
  slate: { chip: "bg-[#EEF2F6]", icon: "text-[#5D6D7E]", value: "text-[#1B2631]" },
  green: { chip: "bg-green-50", icon: "text-green-600", value: "text-green-600" },
  orange: { chip: "bg-orange-50", icon: "text-orange-500", value: "text-orange-500" },
  teal: { chip: "bg-[#E0F2F1]", icon: "text-[#00897B]", value: "text-[#00897B]" },
};

interface StatTileProps {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: LucideIcon;
}

export default function StatTile({ label, value, tone = "slate", icon: Icon }: StatTileProps) {
  const t = TONE[tone];
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 flex items-center gap-3">
      {Icon && (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${t.chip}`}>
          <Icon size={18} className={t.icon} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-medium truncate">{label}</p>
        <p className={`text-xl font-bold leading-tight ${t.value}`}>{value}</p>
      </div>
    </div>
  );
}
