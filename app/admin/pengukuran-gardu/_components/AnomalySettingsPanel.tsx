"use client";

import { useState, useCallback } from "react";
import { ChevronDown, SlidersHorizontal, Save, RotateCcw, CheckCircle2 } from "lucide-react";
import type { AnomalySettings } from "../_utils/detectAnomali";

// ── Slider ranges per kriteria ─────────────────────────────────────────────

const CRITERIA = [
  {
    key: "max_beban_trafo_pct" as keyof AnomalySettings,
    label: "Beban Trafo",
    unit: "%",
    min: 50,
    max: 150,
    step: 5,
    color: "#f97316",
    trackColor: "#7c2d12",
    description: "Beban trafo melebihi threshold",
  },
  {
    key: "max_arus_jurusan_a" as keyof AnomalySettings,
    label: "Arus Jurusan",
    unit: "A",
    min: 50,
    max: 400,
    step: 10,
    color: "#ef4444",
    trackColor: "#7f1d1d",
    description: "Arus R/S/T salah satu jurusan melebihi threshold",
  },
  {
    key: "max_unbalance_pct" as keyof AnomalySettings,
    label: "Unbalance Fasa",
    unit: "%",
    min: 5,
    max: 50,
    step: 1,
    color: "#a855f7",
    trackColor: "#581c87",
    description: "Ketidakseimbangan antar fasa R/S/T",
  },
  {
    key: "max_suhu_trafo_c" as keyof AnomalySettings,
    label: "Suhu Trafo",
    unit: "°C",
    min: 30,
    max: 100,
    step: 5,
    color: "#22d3ee",
    trackColor: "#164e63",
    description: "Suhu trafo melebihi threshold",
  },
] as const;

const KVA_SLIDER_MIN  = 25;
const KVA_SLIDER_MAX  = 1000;
const KVA_SLIDER_STEP = 25;
const KVA_COLOR       = "#22c55e";
const KVA_TRACK_COLOR = "#14532d";

// ── SliderRow ─────────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  unit: string;
  description: string;
  min: number;
  max: number;
  step: number;
  color: string;
  trackColor: string;
  value: number | null;
  onChange: (v: number | null) => void;
}

function SliderRow({
  label, unit, description, min, max, step,
  color, trackColor, value, onChange,
}: SliderRowProps) {
  const active  = value !== null;
  const sliderV = value ?? Math.round((min + max) / 2);
  const pct     = ((sliderV - min) / (max - min)) * 100;

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      active ? "border-[#1e3552] bg-[#0d1b2a]" : "border-[#1e3552]/40 bg-[#0a1220] opacity-60"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onChange(active ? null : sliderV)}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
              active ? "bg-[#00897B]" : "bg-[#1e3552]"
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
              active ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
          <div>
            <p className="text-sm font-semibold text-[#e2e8f0]">{label}</p>
            <p className="text-[11px] text-[#475569]">{description}</p>
          </div>
        </div>
        <div
          className={`min-w-16 text-center text-sm font-bold px-3 py-1 rounded-full border transition-all ${
            active ? "border-transparent text-[#0a1628]" : "border-[#1e3552] text-[#475569]"
          }`}
          style={active ? { background: color } : undefined}
        >
          {active ? `>${sliderV}${unit}` : "—"}
        </div>
      </div>

      <div className="relative pt-1" style={{ opacity: active ? 1 : 0.3, pointerEvents: active ? "auto" : "none" }}>
        <div className="relative h-2 rounded-full" style={{ background: trackColor }}>
          <div className="absolute left-0 top-0 h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        </div>
        <input
          type="range" min={min} max={max} step={step} value={sliderV}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-2 top-1"
          style={{ WebkitAppearance: "none" }}
        />
        <div
          className="absolute -top-1 w-4 h-4 rounded-full shadow-lg border-2 border-white transition-all"
          style={{ left: `calc(${pct}% - 8px)`, background: color }}
        />
        <div className="flex justify-between mt-3 text-[10px] text-[#475569]">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ── KvaRangeRow ───────────────────────────────────────────────────────────

interface KvaRangeRowProps {
  minValue: number | null;
  maxValue: number | null;
  onChange: (min: number | null, max: number | null) => void;
}

function KvaRangeRow({ minValue, maxValue, onChange }: KvaRangeRowProps) {
  const active = minValue !== null || maxValue !== null;
  const minV   = minValue ?? 100;
  const maxV   = maxValue ?? 400;
  const minPct = ((minV - KVA_SLIDER_MIN) / (KVA_SLIDER_MAX - KVA_SLIDER_MIN)) * 100;
  const maxPct = ((maxV - KVA_SLIDER_MIN) / (KVA_SLIDER_MAX - KVA_SLIDER_MIN)) * 100;
  const valid  = minV < maxV;

  function handleToggle() {
    if (active) {
      onChange(null, null);
    } else {
      onChange(100, 400);
    }
  }

  return (
    <div className={`rounded-xl border p-4 transition-all md:col-span-2 ${
      active ? "border-[#1e3552] bg-[#0d1b2a]" : "border-[#1e3552]/40 bg-[#0a1220] opacity-60"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggle}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
              active ? "bg-[#00897B]" : "bg-[#1e3552]"
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
              active ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
          <div>
            <p className="text-sm font-semibold text-[#e2e8f0]">KVA Trafo Range</p>
            <p className="text-[11px] text-[#475569]">Filter — hanya evaluasi gardu dalam rentang kapasitas trafo ini</p>
          </div>
        </div>
        <div
          className={`min-w-[120px] text-center text-sm font-bold px-3 py-1 rounded-full border transition-all ${
            active ? "border-transparent text-[#0a1628]" : "border-[#1e3552] text-[#475569]"
          }`}
          style={active ? { background: KVA_COLOR } : undefined}
        >
          {active ? `${minV}–${maxV} kVA` : "—"}
        </div>
      </div>

      {/* Dual sliders */}
      {active && (
        <div className="space-y-3">
          {/* Min slider */}
          <div>
            <div className="flex justify-between text-[11px] text-[#94a3b8] mb-1">
              <span>Min KVA</span>
              <span className="font-semibold" style={{ color: KVA_COLOR }}>{minV} kVA</span>
            </div>
            <div className="relative pt-1">
              <div className="relative h-2 rounded-full" style={{ background: KVA_TRACK_COLOR }}>
                <div className="absolute left-0 top-0 h-2 rounded-full" style={{ width: `${minPct}%`, background: KVA_COLOR }} />
              </div>
              <input
                type="range"
                min={KVA_SLIDER_MIN} max={KVA_SLIDER_MAX} step={KVA_SLIDER_STEP}
                value={minV}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange(v, v >= maxV ? Math.min(KVA_SLIDER_MAX, v + KVA_SLIDER_STEP) : maxV);
                }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-2 top-1"
                style={{ WebkitAppearance: "none" }}
              />
              <div
                className="absolute top-[-4px] w-4 h-4 rounded-full shadow-lg border-2 border-white"
                style={{ left: `calc(${minPct}% - 8px)`, background: KVA_COLOR }}
              />
            </div>
          </div>

          {/* Max slider */}
          <div>
            <div className="flex justify-between text-[11px] text-[#94a3b8] mb-1">
              <span>Max KVA</span>
              <span className="font-semibold" style={{ color: KVA_COLOR }}>{maxV} kVA</span>
            </div>
            <div className="relative pt-1">
              <div className="relative h-2 rounded-full" style={{ background: KVA_TRACK_COLOR }}>
                <div className="absolute left-0 top-0 h-2 rounded-full" style={{ width: `${maxPct}%`, background: KVA_COLOR }} />
              </div>
              <input
                type="range"
                min={KVA_SLIDER_MIN} max={KVA_SLIDER_MAX} step={KVA_SLIDER_STEP}
                value={maxV}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange(v <= minV ? Math.max(KVA_SLIDER_MIN, v - KVA_SLIDER_STEP) : minV, v);
                }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-2 top-1"
                style={{ WebkitAppearance: "none" }}
              />
              <div
                className="absolute top-[-4px] w-4 h-4 rounded-full shadow-lg border-2 border-white"
                style={{ left: `calc(${maxPct}% - 8px)`, background: KVA_COLOR }}
              />
            </div>
          </div>

          {/* Range labels */}
          <div className="flex justify-between text-[10px] text-[#475569]">
            <span>{KVA_SLIDER_MIN} kVA</span>
            <span>{KVA_SLIDER_MAX} kVA</span>
          </div>

          {!valid && (
            <p className="text-xs text-amber-400">Min KVA harus lebih kecil dari Max KVA</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

interface Props {
  settings: AnomalySettings;
  loading: boolean;
  saving: boolean;
  savedAt: Date | null;
  ulpLabel: string;
  onSave: (patch: Partial<AnomalySettings>) => Promise<boolean>;
  onReset: () => Promise<void>;
}

export default function AnomalySettingsPanel({
  settings, loading, saving, savedAt, ulpLabel, onSave, onReset,
}: Props) {
  const [open, setOpen]   = useState(false);
  const [draft, setDraft] = useState<AnomalySettings>(settings);
  const [dirty, setDirty] = useState(false);

  const syncDraft = useCallback((s: AnomalySettings) => {
    setDraft(s);
    setDirty(false);
  }, []);

  // Sync draft ketika settings dari luar berubah (fetch ulang)
  if (!dirty && (
    draft.max_beban_trafo_pct !== settings.max_beban_trafo_pct ||
    draft.max_arus_jurusan_a  !== settings.max_arus_jurusan_a  ||
    draft.max_unbalance_pct   !== settings.max_unbalance_pct   ||
    draft.max_suhu_trafo_c    !== settings.max_suhu_trafo_c    ||
    draft.min_kva_trafo       !== settings.min_kva_trafo       ||
    draft.max_kva_trafo       !== settings.max_kva_trafo
  )) {
    syncDraft(settings);
  }

  function patchDraft(key: keyof AnomalySettings, v: number | null) {
    setDraft((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
  }

  function patchDraftKva(min: number | null, max: number | null) {
    setDraft((prev) => ({ ...prev, min_kva_trafo: min, max_kva_trafo: max }));
    setDirty(true);
  }

  async function handleSave() {
    const ok = await onSave(draft);
    if (ok) setDirty(false);
  }

  async function handleReset() {
    await onReset();
    setDirty(false);
  }

  const kvaActive  = draft.min_kva_trafo !== null || draft.max_kva_trafo !== null;
  const activeCount = CRITERIA.filter((c) => draft[c.key] !== null).length + (kvaActive ? 1 : 0);

  return (
    <div className="bg-[#0d1b2a] rounded-xl border border-[#1e3552] overflow-hidden">
      {/* ── Collapsed header ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#162334] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal size={15} className="text-[#00897B] shrink-0" />
          <span className="text-sm font-semibold text-[#e2e8f0]">Kriteria Anomali</span>
          {activeCount > 0 && (
            <span className="text-xs bg-[#00897B]/20 text-[#5eead4] border border-[#00897B]/30 px-2 py-0.5 rounded-full font-medium">
              {activeCount} aktif
            </span>
          )}
          {activeCount === 0 && !loading && (
            <span className="text-xs text-[#475569]">semua nonaktif</span>
          )}
          {loading && (
            <span className="w-3 h-3 border-2 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#475569] hidden sm:block">{ulpLabel}</span>
          {savedAt && !dirty && (
            <CheckCircle2 size={13} className="text-green-500 shrink-0" />
          )}
          <ChevronDown
            size={16}
            className={`text-[#475569] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* ── Expanded content ── */}
      {open && (
        <div className="border-t border-[#1e3552] px-5 py-4 space-y-3">
          <p className="text-xs text-[#475569] mb-4">
            Aktifkan toggle dan atur nilai untuk setiap kriteria. Semua kriteria aktif harus terpenuhi (AND logic).
            Kriteria KVA Trafo Range berfungsi sebagai filter rentang — hanya gardu dalam rentang yang dievaluasi.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CRITERIA.map((c) => (
              <SliderRow
                key={c.key}
                label={c.label}
                unit={c.unit}
                description={c.description}
                min={c.min}
                max={c.max}
                step={c.step}
                color={c.color}
                trackColor={c.trackColor}
                value={draft[c.key] as number | null}
                onChange={(v) => patchDraft(c.key, v)}
              />
            ))}
            <KvaRangeRow
              minValue={draft.min_kva_trafo}
              maxValue={draft.max_kva_trafo}
              onChange={patchDraftKva}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1e3552]">
            <div className="text-[11px] text-[#475569]">
              {savedAt && !dirty && (
                <span className="flex items-center gap-1 text-green-500">
                  <CheckCircle2 size={11} />
                  Tersimpan {savedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {dirty && <span className="text-amber-400">Belum tersimpan</span>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#1e3552] text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#1e3552] transition-colors disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Reset
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-[#00897B] text-white hover:bg-[#00695C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
