interface ReguBarProps {
  label: string;
  done: number;
  total: number;
  pct: number;
  suffix?: string; // satuan, mis. "kms"
  fmt?: (n: number) => string;
  muted?: boolean; // "Belum ditugaskan"
}

export default function ReguBar({ label, done, total, pct, suffix, fmt = (n) => String(n), muted }: ReguBarProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-1.5">
        <span className={`font-medium ${muted ? "text-attention" : "text-ink"}`}>{label}</span>
        <span className="text-ink-soft tabular-nums">
          {fmt(done)}/{fmt(total)}{suffix ? ` ${suffix}` : ""} ·{" "}
          <span className="font-semibold text-navy-600">{pct}%</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-navy-100 overflow-hidden">
        <div
          className="h-full bg-navy-600 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
