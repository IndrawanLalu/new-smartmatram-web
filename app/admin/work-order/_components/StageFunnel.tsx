import { STAGE_RAMP } from "../_constants";
import { CARD, DISPLAY } from "@/app/admin/_ui";
import type { WoStats } from "../_lib/woStats";

interface Step {
  label: string;
  value: number;
  hint: string;
}

/**
 * Funnel kumulatif alur persetujuan: berapa baris yang sudah MENCAPAI tiap tahap.
 * Satu seri → tanpa legenda; nilai dilabeli langsung di ujung bar.
 */
export default function StageFunnel({ stats }: { stats: WoStats }) {
  const steps: Step[] = [
    { label: "Total WO", value: stats.total, hint: "seluruh baris" },
    { label: "Dikerjakan", value: stats.reached.Dikerjakan, hint: "sudah dilaporkan selesai" },
    { label: "Diverifikasi", value: stats.reached.Diverifikasi, hint: "lolos pemeriksaan" },
    { label: "Disetujui", value: stats.reached.Disetujui, hint: "disahkan supervisor" },
  ];

  const max = stats.total || 1;

  return (
    <div className={`${CARD} p-5`}>
      <p className={`${DISPLAY} text-sm font-bold text-ink`}>Alur Persetujuan</p>
      <p className="text-xs text-ink-soft mt-0.5">
        Jumlah baris yang sudah mencapai tiap tahap
      </p>

      <div className="mt-4 space-y-2.5">
        {steps.map((s, i) => {
          const pct = Math.round((s.value / max) * 100);
          const prev = i === 0 ? null : steps[i - 1].value;
          const drop = prev != null ? prev - s.value : 0;

          return (
            <div key={s.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">{s.label}</p>
                <p className="text-[10px] text-ink-muted truncate">{s.hint}</p>
              </div>

              <div className="h-5 rounded-md bg-navy-50 overflow-hidden">
                <div
                  className="h-full rounded-r-md transition-[width] duration-500"
                  style={{ width: `${Math.max(pct, s.value > 0 ? 2 : 0)}%`, backgroundColor: STAGE_RAMP[i] }}
                />
              </div>

              <div className="text-right w-24">
                <span className="text-[13px] font-semibold text-ink tabular-nums">
                  {s.value.toLocaleString("id-ID")}
                </span>
                <span className="text-[11px] text-ink-muted tabular-nums"> · {pct}%</span>
                {drop > 0 && (
                  <p className="text-[10px] text-attention tabular-nums">−{drop.toLocaleString("id-ID")}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {stats.verified > 0 && (
        <p className="mt-4 pt-3 border-t border-line text-xs text-ink-soft">
          Kepatuhan SLA pada baris terverifikasi:{" "}
          <b className="text-green-600">{stats.slaOk} sesuai</b> ·{" "}
          <b className="text-red-600">{stats.slaNot} tidak sesuai</b>
        </p>
      )}
    </div>
  );
}
