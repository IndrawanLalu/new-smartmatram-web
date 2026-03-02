import { STATUS_CONFIG, type InspeksiStatus } from "@/lib/roles";

interface StatusBadgeProps {
  status: string;
  pulse?: boolean; // untuk Temuan/Emergency
}

export default function StatusBadge({ status, pulse = false }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status as InspeksiStatus];

  if (!cfg) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        {status}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bgColor} ${cfg.color}`}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
      )}
      {cfg.label}
    </span>
  );
}
