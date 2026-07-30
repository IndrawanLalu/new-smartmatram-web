import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CARD, DISPLAY, EYEBROW } from "@/app/admin/_ui";

type Tone = "navy" | "accent" | "green" | "attention";

const TONE: Record<Tone, { chip: string; icon: string; spark: string }> = {
  navy:      { chip: "bg-navy-50",      icon: "text-navy-600",      spark: "#2A4A9C" },
  accent:    { chip: "bg-accent-tint",  icon: "text-accent-deep",   spark: "#00897B" },
  green:     { chip: "bg-green-50",     icon: "text-green-700",     spark: "#15803D" },
  attention: { chip: "bg-attention-tint", icon: "text-attention",   spark: "#B3701A" },
};

export interface StatDelta {
  /** Nilai perubahan, mis. 4.5 → "+4,5%". */
  pct: number;
  /** Periode pembanding, mis. "bulan lalu". */
  vs: string;
  /** Naik = bagus? Untuk "sisa pekerjaan", naik justru buruk. */
  upIsGood?: boolean;
}

interface StatTileProps {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: LucideIcon;
  delta?: StatDelta;
  /** Deret nilai untuk sparkline (garis tipis, bukan dekorasi tebal). */
  trend?: number[];
  hint?: string;
}

/**
 * Kartu angka: label · nilai · delta · tren.
 * Nilai memakai font display dengan figur proporsional (bukan tabular —
 * angka besar berdiri sendiri jadi terlihat longgar kalau tabular).
 */
export default function StatTile({
  label,
  value,
  tone = "navy",
  icon: Icon,
  delta,
  trend,
  hint,
}: StatTileProps) {
  const t = TONE[tone];
  const good = delta ? (delta.upIsGood ?? true) === delta.pct >= 0 : true;

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${EYEBROW} truncate`}>{label}</p>
          <p className={`${DISPLAY} text-[26px] font-bold leading-tight text-ink mt-1`}>{value}</p>
        </div>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${t.chip}`}>
            <Icon size={17} className={t.icon} />
          </div>
        )}
      </div>

      {(delta || trend || hint) && (
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {delta && (
              <p
                className={`flex items-center gap-1 text-xs font-semibold ${
                  good ? "text-green-700" : "text-red-600"
                }`}
              >
                {delta.pct >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {delta.pct >= 0 ? "+" : "−"}
                {Math.abs(delta.pct).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                <span className="font-normal text-ink-muted">dari {delta.vs}</span>
              </p>
            )}
            {hint && <p className="text-xs text-ink-muted truncate">{hint}</p>}
          </div>

          {trend && trend.length > 1 && (
            <Sparkline values={trend} color={t.spark} />
          )}
        </div>
      )}
    </div>
  );
}

/** Sparkline 2px, tanpa sumbu — konteks, bukan sumber angka. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 64;
  const h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={w}
        cy={h - ((values[values.length - 1] - min) / span) * h}
        r={2.5}
        fill={color}
        stroke="white"
        strokeWidth={2}
      />
    </svg>
  );
}
