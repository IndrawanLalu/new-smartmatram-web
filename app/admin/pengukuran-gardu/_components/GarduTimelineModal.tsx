"use client";

import { X, Zap, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useGarduTimeline, type GarduLatestState, type TimelineEvent } from "../_hooks/useGarduStatus";
import { detectAnomali, type AnomalySettings } from "../_utils/detectAnomali";
import { HIGH_TEMP_C, OVERLOAD_PCT } from "../_hooks/usePengukuranGardu";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function pctCls(pct: number) {
  if (pct >= OVERLOAD_PCT) return "text-red-400 font-bold";
  if (pct >= 60)           return "text-amber-400 font-semibold";
  return "text-green-400 font-semibold";
}

function BebanBar({ pct }: { pct: number }) {
  const barCls = pct >= OVERLOAD_PCT ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 bg-[#0a1628] rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${barCls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-sm font-bold ${pctCls(pct)}`}>{Math.round(pct)}%</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  gardu: GarduLatestState | null;
  onClose: () => void;
  settings: AnomalySettings;
}

// ── Event Cards ───────────────────────────────────────────────────────────────

function PengukuranCard({ ev, settings }: { ev: Extract<TimelineEvent, { type: "pengukuran" }>; settings: AnomalySettings }) {
  const anomali = detectAnomali(ev, settings);
  const highTemp = ev.suhu_trafo > HIGH_TEMP_C;

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div className="absolute left-0 top-3 w-6 h-6 rounded-full bg-[#00897B]/20 border-2 border-[#00897B] flex items-center justify-center">
        <Zap size={11} className="text-[#5eead4]" />
      </div>

      <div className="bg-[#0d1b2a] rounded-xl border border-[#1e3552] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#00897B]/20 text-[#5eead4] border border-[#00897B]/30 font-medium">
              Pengukuran
            </span>
            <span className="text-sm font-semibold text-[#e2e8f0]">{fmtDate(ev.date)}</span>
          </div>
          <div className="flex items-center gap-2">
            {anomali.isAnomali && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-500/30 font-semibold">
                Anomali
              </span>
            )}
            {ev.wo_sent_at && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-900/40 text-teal-400 border border-teal-500/30 font-semibold">
                WO
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[#475569] mb-1">Beban</p>
            <BebanBar pct={ev.persen_beban} />
          </div>
          <div>
            <p className="text-[#475569] mb-1">Suhu Trafo</p>
            <span className={`font-semibold ${highTemp ? "text-amber-400" : "text-[#94a3b8]"}`}>
              {ev.suhu_trafo}°C {highTemp && "⚠"}
            </span>
          </div>
          <div>
            <p className="text-[#475569] mb-1">Arus R/S/T/N (A)</p>
            <span className="font-mono text-[#94a3b8]">
              {Math.round(ev.total_arus_r)}/{Math.round(ev.total_arus_s)}/{Math.round(ev.total_arus_t)}/{Math.round(ev.total_arus_n)}
            </span>
          </div>
          {ev.jenis_pemeliharaan && (
            <div>
              <p className="text-[#475569] mb-1">Jenis WO</p>
              <span className="text-[#94a3b8]">{ev.jenis_pemeliharaan}</span>
            </div>
          )}
          {ev.petugas_nama && (
            <div>
              <p className="text-[#475569] mb-1">Petugas</p>
              <span className="text-[#94a3b8]">{ev.petugas_nama}</span>
            </div>
          )}
        </div>

        {anomali.reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {anomali.reasons.map((r, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 border border-red-500/30 text-red-300">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PenyeimbanganCard({ ev }: { ev: Extract<TimelineEvent, { type: "penyeimbangan" }> }) {
  const delta = ev.beban_pct_after - ev.beban_pct_before;
  const improved = delta < 0;

  return (
    <div className="relative pl-8">
      <div className="absolute left-0 top-3 w-6 h-6 rounded-full bg-blue-900/30 border-2 border-blue-500/60 flex items-center justify-center">
        <Wrench size={11} className="text-blue-400" />
      </div>

      <div className="bg-[#0d1b2a] rounded-xl border border-blue-500/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-500/30 font-medium">
              Penyeimbangan
            </span>
            <span className="text-sm font-semibold text-[#e2e8f0]">{fmtDate(ev.date)}</span>
          </div>
          {improved ? (
            <CheckCircle2 size={14} className="text-green-400" />
          ) : (
            <AlertTriangle size={14} className="text-amber-400" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[#475569] mb-1.5">Beban Sebelum → Sesudah</p>
            <div className="flex items-center gap-2">
              <span className={`font-bold ${pctCls(ev.beban_pct_before)}`}>{Math.round(ev.beban_pct_before)}%</span>
              <span className="text-[#475569]">→</span>
              <span className={`font-bold ${pctCls(ev.beban_pct_after)}`}>{Math.round(ev.beban_pct_after)}%</span>
              <span className={`text-[10px] font-semibold ${improved ? "text-green-400" : "text-red-400"}`}>
                ({improved ? "" : "+"}{Math.round(delta)}%)
              </span>
            </div>
          </div>
          <div>
            <p className="text-[#475569] mb-1.5">Arus R/S/T Sebelum → Sesudah</p>
            <div className="space-y-0.5 font-mono text-[#94a3b8]">
              <div>{Math.round(ev.arus_r_before)}/{Math.round(ev.arus_s_before)}/{Math.round(ev.arus_t_before)}</div>
              <div className="text-[#475569]">↓</div>
              <div>{Math.round(ev.arus_r_after)}/{Math.round(ev.arus_s_after)}/{Math.round(ev.arus_t_after)}</div>
            </div>
          </div>
          {ev.jenis_pemeliharaan && (
            <div>
              <p className="text-[#475569] mb-1">Jenis Pekerjaan</p>
              <span className="text-[#94a3b8]">{ev.jenis_pemeliharaan}</span>
            </div>
          )}
          {ev.petugas_penyeimbang && (
            <div>
              <p className="text-[#475569] mb-1">Petugas</p>
              <span className="text-[#94a3b8]">{ev.petugas_penyeimbang}</span>
            </div>
          )}
        </div>

        {ev.catatan && (
          <div className="mt-3 bg-[#162334] rounded-lg px-3 py-2 text-xs text-[#94a3b8]">
            <span className="text-[#475569] mr-1">Catatan:</span>{ev.catatan}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function GarduTimelineModal({ gardu, onClose, settings }: Props) {
  const { events, loading } = useGarduTimeline(gardu?.no_gardu ?? null);

  if (!gardu) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1b2a] rounded-2xl border border-[#1e3552] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#1e3552] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[#e2e8f0]">{gardu.no_gardu}</h2>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              {gardu.penyulang ?? "—"} · {gardu.kva_trafo} kVA · {gardu.alamat ?? "—"}
            </p>
          </div>
          <button onClick={onClose} className="text-[#475569] hover:text-[#e2e8f0] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-[#94a3b8] text-sm">
              <div className="w-5 h-5 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
              Memuat riwayat...
            </div>
          )}

          {!loading && events.length === 0 && (
            <p className="text-center text-[#475569] py-12 text-sm">Belum ada riwayat untuk gardu ini.</p>
          )}

          {!loading && events.length > 0 && (
            <div className="relative space-y-4">
              {/* Vertical line */}
              <div className="absolute left-3 top-3 bottom-3 w-px bg-[#1e3552]" />

              {events.map((ev) =>
                ev.type === "pengukuran" ? (
                  <PengukuranCard key={`pg-${ev.id}`} ev={ev} settings={settings} />
                ) : (
                  <PenyeimbanganCard key={`ps-${ev.id}`} ev={ev} />
                )
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1e3552] shrink-0 text-xs text-[#475569] flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-[#00897B] bg-[#00897B]/20" />
            Pengukuran ({events.filter(e => e.type === "pengukuran").length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-blue-500/60 bg-blue-900/30" />
            Penyeimbangan ({events.filter(e => e.type === "penyeimbangan").length})
          </span>
        </div>
      </div>
    </div>
  );
}
