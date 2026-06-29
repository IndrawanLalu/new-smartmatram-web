import { X, ShieldAlert } from "lucide-react";
import type { FeederRisk } from "../_hooks/useFeederRisk";

const LEVEL_COLOR = {
  kritis: "text-red-400",
  waspada: "text-amber-400",
  aman: "text-emerald-400",
};
const LEVEL_LABEL = { kritis: "🔴 Kritis", waspada: "🟡 Waspada", aman: "🟢 Aman" };

interface Props {
  risk: FeederRisk;
  onClose: () => void;
}

export default function RiskDetailModal({ risk, onClose }: Props) {
  const { breakdown } = risk;
  const drivers = breakdown?.drivers ?? [];
  const fitur = breakdown?.fitur ?? {};
  const maxKontribusi = Math.max(...drivers.map((d) => d.kontribusi), 1);

  const DRIVER_COLORS = ["bg-red-500", "bg-orange-400", "bg-amber-400", "bg-yellow-400"];

  const RAW_FEATURES: [string, string][] = [
    ["Curah hujan", `${fitur.precip_mm ?? "—"} mm`],
    ["Angin maks", `${fitur.wind_max_kmh ?? "—"} km/j`],
    ["Petir", fitur.thunder ? "Ya ⚡" : "Tidak"],
    ["Trip 30 hari", String(fitur.trip_30d ?? "—")],
    ["Trip 90 hari", String(fitur.trip_90d ?? "—")],
    ["Trip 365 hari", String(fitur.trip_365d ?? "—")],
    ["Temuan pohon", String(fitur.temuan_pohon_terbuka ?? "—")],
    ["Temuan kritis", String(fitur.temuan_kritis_terbuka ?? "—")],
    ["Umur temuan", fitur.umur_temuan_tertua_hari != null ? `${fitur.umur_temuan_tertua_hari} hari` : "—"],
    ["Rasio hujan", fitur.rate_hujan != null ? (fitur.rate_hujan as number).toFixed(2) : "—"],
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0d1b2a] border border-[#1e3552] rounded-2xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#162334] border-b border-[#1e3552]">
          <ShieldAlert size={16} className={LEVEL_COLOR[risk.risk_level]} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[#e2e8f0] truncate">{risk.penyulang}</div>
            <div className="text-[10px] text-[#94a3b8]">ULP {risk.ulp} · {risk.model_version}</div>
          </div>
          <div className={`text-xs font-bold font-mono shrink-0 ${LEVEL_COLOR[risk.risk_level]}`}>
            {LEVEL_LABEL[risk.risk_level]} · {risk.risk_score.toFixed(0)}/100
          </div>
          <button onClick={onClose} className="shrink-0 text-[#94a3b8] hover:text-white ml-1">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Driver bars */}
          {drivers.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-[#5eead4] uppercase tracking-wider mb-2">
                Faktor Risiko Dominan
              </div>
              <div className="space-y-2">
                {drivers.map((d, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-[#e2e8f0]">{d.faktor}</span>
                      <span className="text-[#94a3b8] font-mono">{d.kontribusi}%</span>
                    </div>
                    <div className="h-1.5 bg-[#1e3552] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${DRIVER_COLORS[i] ?? "bg-slate-400"}`}
                        style={{ width: `${(d.kontribusi / maxKontribusi) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Predicted cause */}
          {risk.predicted_cause && (
            <div className="bg-[#1e3552] rounded-lg px-3 py-2">
              <div className="text-[10px] font-bold text-[#5eead4] uppercase tracking-wider mb-1">
                Prediksi Penyebab
              </div>
              <div className="text-xs text-[#e2e8f0]">{risk.predicted_cause}</div>
              {risk.cause_confidence != null && (
                <div className="text-[10px] text-[#94a3b8] mt-0.5">
                  Kepercayaan: {risk.cause_confidence.toFixed(0)}%
                </div>
              )}
            </div>
          )}

          {/* Raw features */}
          <div>
            <div className="text-[10px] font-bold text-[#5eead4] uppercase tracking-wider mb-2">
              Data Fitur
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {RAW_FEATURES.map(([k, v]) => (
                <div key={k} className="flex justify-between text-[10px]">
                  <span className="text-[#64748b]">{k}</span>
                  <span className="text-[#94a3b8] font-mono">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Catatan */}
          {breakdown?.catatan && (
            <div className="text-[10px] text-amber-400 bg-amber-900/20 rounded px-2 py-1.5">
              ⚠ {breakdown.catatan}
            </div>
          )}

          {/* Footer */}
          <div className="text-[10px] text-[#475569] text-center pt-1">
            Prediksi untuk {risk.tgl} · Klik di luar untuk tutup
          </div>
        </div>
      </div>
    </div>
  );
}
