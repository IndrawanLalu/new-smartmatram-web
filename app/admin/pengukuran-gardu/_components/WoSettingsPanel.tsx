"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal, Save, RotateCcw, CheckCircle2 } from "lucide-react";
import { DEFAULT_WO_SETTINGS, type WoSettings } from "../_lib/kandidatWo";

// ── Definisi field ────────────────────────────────────────────────────────────

interface FieldAngka {
  key: "kuota_per_bulan" | "ambang_beban_pct" | "bulan_beban_tinggi" | "bulan_beban_rendah";
  label: string;
  satuan: string;
  min: number;
  max: number;
  petunjuk: string;
}

const ANGKA: FieldAngka[] = [
  {
    key: "kuota_per_bulan",
    label: "Kuota per Bulan",
    satuan: "gardu",
    min: 1,
    max: 2000,
    petunjuk: "Berapa gardu yang diterbitkan tiap bulan. Berlaku per ULP.",
  },
  {
    key: "ambang_beban_pct",
    label: "Ambang Beban Tinggi",
    satuan: "%",
    min: 10,
    max: 200,
    petunjuk: "Di atas angka ini gardu dianggap berbeban tinggi dan diukur lebih sering.",
  },
  {
    key: "bulan_beban_tinggi",
    label: "Umur Maks — Beban Tinggi",
    satuan: "bulan",
    min: 1,
    max: 60,
    petunjuk: "Gardu berbeban tinggi wajib diukur ulang setelah sekian bulan.",
  },
  {
    key: "bulan_beban_rendah",
    label: "Umur Maks — Beban Rendah",
    satuan: "bulan",
    min: 1,
    max: 60,
    petunjuk: "Samakan dengan kolom di kiri kalau ingin satu ambang untuk semua gardu.",
  },
];

interface FieldSaklar {
  key: "sertakan_belum_pernah" | "hanya_gardu_aktif";
  label: string;
  petunjuk: string;
}

const SAKLAR: FieldSaklar[] = [
  {
    key: "sertakan_belum_pernah",
    label: "Sertakan gardu yang belum pernah diukur",
    petunjuk: "Kelompok ini selalu ditempatkan paling atas — kondisinya sama sekali belum diketahui.",
  },
  {
    key: "hanya_gardu_aktif",
    label: "Hanya gardu berstatus Aktif",
    petunjuk: "Gardu Nonaktif tidak di-WO-kan. Gardu tanpa status dianggap Aktif.",
  },
];

// ── Baris kendali ─────────────────────────────────────────────────────────────

function BarisAngka({ f, value, onChange }: { f: FieldAngka; value: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-sm font-semibold text-ink">{f.label}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            min={f.min}
            max={f.max}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              // Angka di luar rentang ditolak diam-diam, bukan disimpan lalu
              // gagal di database dengan pesan constraint yang tidak terbaca.
              if (Number.isFinite(v) && v >= f.min && v <= f.max) onChange(v);
            }}
            className="w-20 h-8 rounded-lg border border-line bg-white px-2 text-sm text-right font-semibold text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
          />
          <span className="text-xs text-ink-muted w-11">{f.satuan}</span>
        </div>
      </div>
      <p className="text-[11px] text-ink-muted leading-relaxed">{f.petunjuk}</p>
    </div>
  );
}

function BarisSaklar({ f, value, onChange }: { f: FieldSaklar; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5 flex items-start gap-3">
      <button
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${value ? "bg-navy-600" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
            value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{f.label}</p>
        <p className="text-[11px] text-ink-muted leading-relaxed">{f.petunjuk}</p>
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface WoSettingsPanelProps {
  settings: WoSettings;
  /** ULP yang kriterianya sedang disunting. 'ALL' = bawaan untuk semua ULP. */
  ulpKey: string;
  saving: boolean;
  savedAt: Date | null;
  onSave: (patch: Partial<WoSettings>) => Promise<boolean>;
  onReset: () => Promise<boolean>;
}

export default function WoSettingsPanel({
  settings, ulpKey, saving, savedAt, onSave, onReset,
}: WoSettingsPanelProps) {
  const [buka, setBuka] = useState(false);
  const [draft, setDraft] = useState<WoSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [settingsTerakhir, setSettingsTerakhir] = useState(settings);

  // Pengaturan datang belakangan (setelah fetch) dan berganti saat ULP berganti.
  // Suntingan yang belum disimpan sengaja tidak ditimpa — kalau tidak, mengetik
  // sambil menunggu muat akan kehilangan angkanya.
  if (settings !== settingsTerakhir) {
    setSettingsTerakhir(settings);
    if (!dirty) setDraft(settings);
  }

  const ubah = <K extends keyof WoSettings>(key: K, nilai: WoSettings[K]) => {
    setDraft((p) => ({ ...p, [key]: nilai }));
    setDirty(true);
  };

  const simpan = async () => {
    if (await onSave(draft)) setDirty(false);
  };

  const reset = async () => {
    if (await onReset()) {
      setDraft(DEFAULT_WO_SETTINGS);
      setDirty(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-line shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-surface transition-colors"
      >
        <SlidersHorizontal size={15} className="text-navy-600 shrink-0" />
        <span className="text-sm font-semibold text-ink">Pengaturan WO</span>
        <span className="text-[11px] text-ink-muted">
          {ulpKey === "ALL" ? "berlaku untuk semua ULP" : `khusus ${ulpKey}`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-600">belum tersimpan</span>}
          <ChevronDown size={16} className={`text-ink-muted transition-transform ${buka ? "rotate-180" : ""}`} />
        </span>
      </button>

      {buka && (
        <div className="px-4 pb-4 pt-1 border-t border-line space-y-3">
          <p className="text-[11px] text-ink-muted leading-relaxed">
            Kriteria ini menentukan gardu mana yang masuk daftar WO. Perubahan berlaku untuk WO
            yang <b>belum diterbitkan</b> — WO yang sudah terbit menyimpan salinan kriterianya sendiri.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ANGKA.map((f) => (
              <BarisAngka key={f.key} f={f} value={draft[f.key]} onChange={(v) => ubah(f.key, v)} />
            ))}
            {SAKLAR.map((f) => (
              <BarisSaklar key={f.key} f={f} value={draft[f.key]} onChange={(v) => ubah(f.key, v)} />
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-line">
            <div className="text-[11px]">
              {savedAt && !dirty && (
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle2 size={11} />
                  Tersimpan {savedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-line text-ink-soft hover:text-ink hover:bg-surface transition-colors disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Reset
              </button>
              <button
                type="button"
                onClick={simpan}
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
