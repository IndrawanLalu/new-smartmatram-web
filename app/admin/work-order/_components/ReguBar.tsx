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
        <span className={`font-medium ${muted ? "text-orange-500" : "text-[#1B2631]"}`}>{label}</span>
        <span className="text-[#5D6D7E] tabular-nums">
          {fmt(done)}/{fmt(total)}{suffix ? ` ${suffix}` : ""} ·{" "}
          <span className="font-semibold text-[#00695C]">{pct}%</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#EEF2F6] overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-[#004D40] to-[#00897B] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
