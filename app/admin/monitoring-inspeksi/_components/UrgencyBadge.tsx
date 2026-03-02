import { URGENCY_CONFIG, type UrgencyLevel } from "@/lib/roles";

interface UrgencyBadgeProps {
  urgency: UrgencyLevel;
  remainingDays: number;
}

export default function UrgencyBadge({ urgency, remainingDays }: UrgencyBadgeProps) {
  const cfg = URGENCY_CONFIG[urgency];
  const isSangatUrgent = urgency === "SANGAT URGENT";

  const daysLabel =
    remainingDays <= 0
      ? "Terlambat"
      : remainingDays === 999
      ? "—"
      : `${remainingDays} hr`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bgColor} ${cfg.color}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {isSangatUrgent && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dotColor} opacity-75`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-1.5 w-1.5 ${cfg.dotColor}`}
        />
      </span>
      {cfg.label} · {daysLabel}
    </span>
  );
}
