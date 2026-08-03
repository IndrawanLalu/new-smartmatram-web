"use client";

import { useState, useEffect } from "react";
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
      active ? "border-line bg-white" : "border-line/40 bg-surface opacity-60"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onChange(active ? null : sliderV)}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
              active ? "bg-navy-600" : "bg-line"
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
              active ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
          <div>
            <p className="text-sm font-semibold text-ink">{label}</p>
            <p className="text-[11px] text-ink-muted">{description}</p>
          </div>
        </div>
        <div
          className={`min-w-16 text-center text-sm font-bold px-3 py-1 rounded-full border transition-all ${
            active ? "border-transparent text-ink" : "border-line text-ink-muted"
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
        <div className="flex justify-between mt-3 text-[10px] text-ink-muted">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ── ArusNominalRangeRow ───────────────────────────────────────────────────
//
// Pembebanan arus terhadap arus nominal trafo — RENTANG, bukan satu ambang,
// supaya bisa dipakai untuk "70–100%" maupun ">100%".
//
// Menggeser batas atas sampai mentok = TANPA BATAS (disimpan null). Tanpa itu
// ">100%" tidak bisa diungkapkan: berapa pun angka yang dipilih sebagai batas
// atas akan diam-diam mengecualikan gardu yang lebih parah dari itu.

const ARUS_MIN = 50;
const ARUS_MAX = 150;
const ARUS_STEP = 5;
const ARUS_COLOR = "#e11d48";
const ARUS_TRACK = "#4c0519";

interface ArusNominalRowProps {
  minValue: number | null;
  maxValue: number | null;
  onChange: (min: number | null, max: number | null) => void;
}

function ArusNominalRangeRow({ minValue, maxValue, onChange }: ArusNominalRowProps) {
  const active = minValue !== null || maxValue !== null;
  const minV = minValue ?? 70;
  const maxV = maxValue ?? ARUS_MAX;          // mentok = tanpa batas
  const tanpaBatas = maxValue === null;
  const minPct = ((minV - ARUS_MIN) / (ARUS_MAX - ARUS_MIN)) * 100;
  const maxPct = ((maxV - ARUS_MIN) / (ARUS_MAX - ARUS_MIN)) * 100;

  const label = !active
    ? "—"
    : tanpaBatas
      ? `≥${minV}%`
      : minValue === null
        ? `≤${maxV}%`
        : `${minV}–${maxV}%`;

  return (
    <div className={`rounded-xl border p-4 transition-all md:col-span-2 ${
      active ? "border-line bg-white" : "border-line/40 bg-surface opacity-60"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => (active ? onChange(null, null) : onChange(70, null))}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${active ? "bg-navy-600" : "bg-line"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
              active ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
          <div>
            <p className="text-sm font-semibold text-ink">Arus vs Nominal Trafo</p>
            <p className="text-[11px] text-ink-muted">
              Fasa tertinggi dibanding arus nominal (kVA×1000 ÷ √3×400) — berbeda dari
              beban kVA saat tegangan turun
            </p>
          </div>
        </div>
        <div
          className={`min-w-[110px] text-center text-sm font-bold px-3 py-1 rounded-full border transition-all ${
            active ? "border-transparent text-white" : "border-line text-ink-muted"
          }`}
          style={active ? { background: ARUS_COLOR } : undefined}
        >
          {label}
        </div>
      </div>

      {active && (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[11px] text-ink-soft mb-1">
              <span>Batas bawah</span>
              <span className="font-semibold" style={{ color: ARUS_COLOR }}>{minV}%</span>
            </div>
            <div className="relative pt-1">
              <div className="relative h-2 rounded-full" style={{ background: ARUS_TRACK }}>
                <div className="absolute left-0 top-0 h-2 rounded-full" style={{ width: `${minPct}%`, background: ARUS_COLOR }} />
              </div>
              <input
                type="range"
                min={ARUS_MIN} max={ARUS_MAX} step={ARUS_STEP}
                value={minV}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange(v, tanpaBatas ? null : Math.max(v + ARUS_STEP, maxV));
                }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-2 top-1"
                style={{ WebkitAppearance: "none" }}
              />
              <div
                className="absolute top-[-4px] w-4 h-4 rounded-full shadow-lg border-2 border-white"
                style={{ left: `calc(${minPct}% - 8px)`, background: ARUS_COLOR }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-ink-soft mb-1">
              <span>Batas atas</span>
              <span className="font-semibold" style={{ color: ARUS_COLOR }}>
                {tanpaBatas ? "tanpa batas" : `${maxV}%`}
              </span>
            </div>
            <div className="relative pt-1">
              <div className="relative h-2 rounded-full" style={{ background: ARUS_TRACK }}>
                <div className="absolute left-0 top-0 h-2 rounded-full" style={{ width: `${maxPct}%`, background: ARUS_COLOR }} />
              </div>
              <input
                type="range"
                min={ARUS_MIN} max={ARUS_MAX} step={ARUS_STEP}
                value={maxV}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  // Mentok kanan = tanpa batas atas.
                  onChange(Math.min(minV, v - ARUS_STEP), v >= ARUS_MAX ? null : v);
                }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-2 top-1"
                style={{ WebkitAppearance: "none" }}
              />
              <div
                className="absolute top-[-4px] w-4 h-4 rounded-full shadow-lg border-2 border-white"
                style={{ left: `calc(${maxPct}% - 8px)`, background: ARUS_COLOR }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-ink-muted">
              <span>{ARUS_MIN}%</span>
              <span>geser mentok kanan = tanpa batas</span>
            </div>
          </div>
        </div>
      )}
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
      active ? "border-line bg-white" : "border-line/40 bg-surface opacity-60"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggle}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
              active ? "bg-navy-600" : "bg-line"
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
              active ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
          <div>
            <p className="text-sm font-semibold text-ink">KVA Trafo Range</p>
            <p className="text-[11px] text-ink-muted">Filter — hanya evaluasi gardu dalam rentang kapasitas trafo ini</p>
          </div>
        </div>
        <div
          className={`min-w-[120px] text-center text-sm font-bold px-3 py-1 rounded-full border transition-all ${
            active ? "border-transparent text-ink" : "border-line text-ink-muted"
          }`}
          style={active ? { background: KVA_COLOR } : undefined}
        >
          {active
            ? minValue !== null && maxValue !== null
              ? `${minV}–${maxV} kVA`
              : minValue !== null
              ? `≥${minV} kVA`
              : `≤${maxV} kVA`
            : "—"}
        </div>
      </div>

      {/* Dual sliders */}
      {active && (
        <div className="space-y-3">
          {/* Min slider */}
          <div>
            <div className="flex justify-between text-[11px] text-ink-soft mb-1">
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
            <div className="flex justify-between text-[11px] text-ink-soft mb-1">
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
          <div className="flex justify-between text-[10px] text-ink-muted">
            <span>{KVA_SLIDER_MIN} kVA</span>
            <span>{KVA_SLIDER_MAX} kVA</span>
          </div>

          {!valid && (
            <p className="text-xs text-amber-600">Min KVA harus lebih kecil dari Max KVA</p>
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

  // Sync draft ketika settings dari luar berubah (fetch ulang) — hanya jika belum ada perubahan lokal
  useEffect(() => {
    if (!dirty) setDraft(settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.max_beban_trafo_pct, settings.max_arus_jurusan_a, settings.max_unbalance_pct, settings.max_suhu_trafo_c, settings.min_arus_nominal_pct, settings.max_arus_nominal_pct, settings.min_kva_trafo, settings.max_kva_trafo, dirty]);

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
  const arusActive = draft.min_arus_nominal_pct !== null || draft.max_arus_nominal_pct !== null;
  const activeCount = CRITERIA.filter((c) => draft[c.key] !== null).length + (kvaActive ? 1 : 0) + (arusActive ? 1 : 0);

  return (
    <div className="bg-white rounded-xl border border-line overflow-hidden">
      {/* ── Collapsed header ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal size={15} className="text-navy-600 shrink-0" />
          <span className="text-sm font-semibold text-ink">Kriteria Anomali</span>
          {activeCount > 0 && (
            <span className="text-xs bg-navy-50 text-accent-deep border border-navy-300 px-2 py-0.5 rounded-full font-medium">
              {activeCount} aktif
            </span>
          )}
          {activeCount === 0 && !loading && (
            <span className="text-xs text-ink-muted">semua nonaktif</span>
          )}
          {loading && (
            <span className="w-3 h-3 border-2 border-line border-t-navy-600 rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-ink-muted hidden sm:block">{ulpLabel}</span>
          {savedAt && !dirty && (
            <CheckCircle2 size={13} className="text-green-500 shrink-0" />
          )}
          <ChevronDown
            size={16}
            className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* ── Expanded content ── */}
      {open && (
        <div className="border-t border-line px-5 py-4 space-y-3">
          <p className="text-xs text-ink-muted mb-4">
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
            <ArusNominalRangeRow
              minValue={draft.min_arus_nominal_pct}
              maxValue={draft.max_arus_nominal_pct}
              onChange={(min, max) => {
                setDraft((prev) => ({ ...prev, min_arus_nominal_pct: min, max_arus_nominal_pct: max }));
                setDirty(true);
              }}
            />
            <KvaRangeRow
              minValue={draft.min_kva_trafo}
              maxValue={draft.max_kva_trafo}
              onChange={patchDraftKva}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-line">
            <div className="text-[11px] text-ink-muted">
              {savedAt && !dirty && (
                <span className="flex items-center gap-1 text-green-500">
                  <CheckCircle2 size={11} />
                  Tersimpan {savedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {dirty && <span className="text-amber-600">Belum tersimpan</span>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-line text-ink-soft hover:text-ink hover:bg-line transition-colors disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Reset
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-navy-600 text-white hover:bg-navy-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
