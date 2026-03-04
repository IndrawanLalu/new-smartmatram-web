import { AlertTriangle, Thermometer, Zap } from "lucide-react";
import type { PengukuranGardu, HighCurrentItem } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";

interface Props {
  overloadData: PengukuranGardu[];
  highTempData: PengukuranGardu[];
  highCurrentItems: HighCurrentItem[];
}

export default function AlertPanel({ overloadData, highTempData, highCurrentItems }: Props) {
  const hasAnyAlert = overloadData.length + highTempData.length + highCurrentItems.length > 0;

  return (
    <div className="flex flex-col h-full bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
      {/* Header — berkedip saat ada alert */}
      <div className={`bg-linear-to-r from-[#7F1D1D] to-[#B91C1C] px-3 py-2.5 shrink-0 flex items-center gap-2 ${hasAnyAlert ? "animate-pulse" : ""}`}>
        <AlertTriangle size={13} className="text-red-200" />
        <span className="text-white text-xs font-bold tracking-wider uppercase">Alert Gardu</span>
        {hasAnyAlert && (
          <span className="ml-auto bg-white/20 text-white text-xs font-mono font-bold px-1.5 py-0.5 rounded-md">
            {overloadData.length + highTempData.length + highCurrentItems.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!hasAnyAlert && (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
              <span className="text-emerald-500 text-lg">✓</span>
            </div>
            <span className="text-xs text-[#94a3b8]">Semua gardu dalam kondisi normal</span>
          </div>
        )}

        {/* Overload — merah berkedip */}
        {overloadData.length > 0 && (
          <AlertSection
            icon={<AlertTriangle size={11} />}
            label="Overload"
            count={overloadData.length}
            colorClass="text-red-700 bg-red-100 border-red-300"
            pulse
          >
            {overloadData
              .sort((a, b) => b.persen_beban - a.persen_beban)
              .map((g) => (
                <DangerRow key={g.id}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {/* Ping dot merah */}
                      <span className="relative flex shrink-0 h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                      <span className="text-xs font-semibold text-[#e2e8f0] truncate">{g.no_gardu}</span>
                    </div>
                    <div className="text-[10px] text-[#94a3b8] truncate pl-3.5">{g.penyulang ?? "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-red-600">{g.persen_beban.toFixed(0)}%</div>
                    <ProgressBar pct={g.persen_beban} color="bg-red-500" pulse />
                  </div>
                </DangerRow>
              ))}
          </AlertSection>
        )}

        {/* Suhu Tinggi — orange berkedip */}
        {highTempData.length > 0 && (
          <AlertSection
            icon={<Thermometer size={11} />}
            label="Suhu Tinggi"
            count={highTempData.length}
            colorClass="text-orange-700 bg-orange-100 border-orange-300"
            pulse
          >
            {highTempData
              .sort((a, b) => b.suhu_trafo - a.suhu_trafo)
              .map((g) => (
                <DangerRow key={g.id} color="orange">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex shrink-0 h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                      </span>
                      <span className="text-xs font-semibold text-[#e2e8f0] truncate">{g.no_gardu}</span>
                    </div>
                    <div className="text-[10px] text-[#94a3b8] truncate pl-3.5">{g.penyulang ?? "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-orange-600">{g.suhu_trafo}°C</div>
                    <ProgressBar pct={Math.min((g.suhu_trafo / 100) * 100, 100)} color="bg-orange-400" pulse />
                  </div>
                </DangerRow>
              ))}
          </AlertSection>
        )}

        {/* Arus Tinggi — amber */}
        {highCurrentItems.length > 0 && (
          <AlertSection
            icon={<Zap size={11} />}
            label="Arus Tinggi"
            count={highCurrentItems.length}
            colorClass="text-amber-700 bg-amber-100 border-amber-300"
          >
            {highCurrentItems
              .sort((a, b) => b.max_arus - a.max_arus)
              .slice(0, 8)
              .map((item, i) => (
                <DangerRow key={i} color="amber">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#e2e8f0] truncate">{item.no_gardu}</div>
                    <div className="text-[10px] text-[#94a3b8]">Jur. {item.jurusan} · R:{item.arus_r} S:{item.arus_s} T:{item.arus_t}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-amber-600">{item.max_arus.toFixed(0)} A</div>
                    <ProgressBar pct={Math.min((item.max_arus / 250) * 100, 100)} color="bg-amber-400" />
                  </div>
                </DangerRow>
              ))}
          </AlertSection>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AlertSection({
  icon,
  label,
  count,
  colorClass,
  pulse = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  colorClass: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border mb-1.5 ${colorClass} ${pulse ? "animate-pulse" : ""}`}>
        {icon}
        {label}
        <span className="ml-auto font-mono">{count}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DangerRow({
  children,
  color = "red",
}: {
  children: React.ReactNode;
  color?: "red" | "orange" | "amber";
}) {
  const borderColor = {
    red: "border-l-2 border-red-400 bg-red-50/50",
    orange: "border-l-2 border-orange-400 bg-orange-50/50",
    amber: "border-l-2 border-amber-400 bg-amber-50/30",
  }[color];

  return (
    <div className={`flex items-center gap-3 pl-2 pr-2 py-1.5 rounded-r-lg ${borderColor} hover:brightness-95 transition-all`}>
      {children}
    </div>
  );
}

function ProgressBar({
  pct,
  color,
  pulse = false,
}: {
  pct: number;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-0.5">
      <div
        className={`h-full rounded-full transition-all ${color} ${pulse ? "animate-pulse" : ""}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}
