"use client";

import { Eye, EyeOff, Users, Type, Ruler, BadgeCheck } from "lucide-react";
import type { WoColumn, WoColumnType } from "../_types";

const TYPES: { value: WoColumnType; label: string }[] = [
  { value: "text", label: "Teks" },
  { value: "number", label: "Angka" },
  { value: "date", label: "Tanggal" },
];

interface ColumnMapperProps {
  columns: WoColumn[];
  setColumns: (c: WoColumn[]) => void;
  reguColKey: string | null;
  setReguColKey: (k: string | null) => void;
  titleColKey: string | null;
  setTitleColKey: (k: string | null) => void;
  measureColKey: string | null;
  setMeasureColKey: (k: string | null) => void;
  measureUnit: string;
  setMeasureUnit: (u: string) => void;
  verifierColKey: string | null;
  setVerifierColKey: (k: string | null) => void;
  /** Bagian pemetaan regu hanya relevan saat impor — dilewati bila tidak diisi. */
  eksekutorRoles?: string[];
  distinctRegu?: string[];
  reguMap?: Record<string, string>;
  onReguMapChange?: (value: string, role: string) => void;
}

export default function ColumnMapper({
  columns,
  setColumns,
  reguColKey,
  setReguColKey,
  titleColKey,
  setTitleColKey,
  measureColKey,
  setMeasureColKey,
  measureUnit,
  setMeasureUnit,
  verifierColKey,
  setVerifierColKey,
  eksekutorRoles = [],
  distinctRegu,
  reguMap = {},
  onReguMapChange,
}: ColumnMapperProps) {
  const patch = (key: string, p: Partial<WoColumn>) =>
    setColumns(columns.map((c) => (c.key === key ? { ...c, ...p } : c)));

  function toggleMeasure(key: string) {
    if (measureColKey === key) {
      setMeasureColKey(null);
    } else {
      setMeasureColKey(key);
      patch(key, { type: "number" }); // ukuran selalu numerik
    }
  }

  const unmapped = (distinctRegu ?? []).filter((v) => !reguMap[v]).length;

  return (
    <div className="space-y-5">
      {/* Konfigurasi kolom */}
      <div>
        <p className="text-sm font-semibold text-ink mb-2">Kolom Tabel</p>
        <p className="text-xs text-ink-soft mb-3">
          Ubah nama/tipe kolom, sembunyikan yang tak perlu, lalu tandai <b>Regu</b> (filter mobile),
          <b> Judul</b> (teks kartu di HP), <b>Ukuran</b> (panjang kms → realisasi volume), dan opsional
          <b> Verifikator</b> (role yang memverifikasi per baris — bisa diatur ulang di tabel).
        </p>
        <div className="space-y-1.5">
          {columns.map((c) => (
            <div
              key={c.key}
              className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5"
            >
              <input
                value={c.label}
                onChange={(e) => patch(c.key, { label: e.target.value })}
                className="flex-1 min-w-0 text-sm px-2 py-1 rounded border border-transparent hover:border-line focus:outline-none focus:border-navy-500"
              />
              <select
                value={c.type}
                onChange={(e) => patch(c.key, { type: e.target.value as WoColumnType })}
                className="text-xs border border-line rounded px-1.5 py-1 focus:outline-none focus:border-navy-500"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setReguColKey(reguColKey === c.key ? null : c.key)}
                title="Tandai sebagai kolom Regu"
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  reguColKey === c.key
                    ? "bg-accent text-white"
                    : "bg-accent-tint text-accent-deep hover:bg-accent/20"
                }`}
              >
                <Users size={12} /> Regu
              </button>
              <button
                type="button"
                onClick={() => setTitleColKey(titleColKey === c.key ? null : c.key)}
                title="Tandai sebagai judul kartu mobile"
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  titleColKey === c.key
                    ? "bg-navy-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Type size={12} /> Judul
              </button>
              <button
                type="button"
                onClick={() => setVerifierColKey(verifierColKey === c.key ? null : c.key)}
                title="Tandai sebagai kolom Verifikator (role yang memverifikasi)"
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  verifierColKey === c.key
                    ? "bg-cyan-600 text-white"
                    : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                }`}
              >
                <BadgeCheck size={12} /> Verifikator
              </button>
              <button
                type="button"
                onClick={() => toggleMeasure(c.key)}
                title="Tandai sebagai kolom ukuran/volume (realisasi kms)"
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  measureColKey === c.key
                    ? "bg-amber-500 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                <Ruler size={12} /> Ukuran
              </button>
              {measureColKey === c.key && (
                <input
                  value={measureUnit}
                  onChange={(e) => setMeasureUnit(e.target.value)}
                  placeholder="kms"
                  title="Satuan ukuran"
                  className="w-16 text-xs border border-amber-300 rounded px-1.5 py-1 focus:outline-none focus:border-amber-500"
                />
              )}
              <button
                type="button"
                onClick={() => patch(c.key, { hidden: !c.hidden })}
                title={c.hidden ? "Tampilkan kolom" : "Sembunyikan kolom"}
                className="text-gray-400 hover:text-accent px-1"
              >
                {c.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Pemetaan regu → eksekutor role (hanya saat impor) */}
      {reguColKey && distinctRegu && onReguMapChange && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-ink">Pemetaan Regu → Eksekutor</p>
            {unmapped > 0 && (
              <span className="text-xs text-orange-600">{unmapped} nilai belum dipetakan (WO tak muncul di HP)</span>
            )}
          </div>
          {distinctRegu.length === 0 ? (
            <p className="text-xs text-ink-soft">Kolom regu terpilih tidak berisi nilai.</p>
          ) : (
            <div className="space-y-1.5">
              {distinctRegu.map((val) => (
                <div key={val} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-ink truncate bg-surface rounded px-2.5 py-1.5">{val}</span>
                  <span className="text-ink-soft">→</span>
                  <select
                    value={reguMap[val] ?? ""}
                    onChange={(e) => onReguMapChange(val, e.target.value)}
                    className={`text-sm border rounded-lg px-2.5 py-1.5 w-44 focus:outline-none focus:border-navy-500 ${
                      reguMap[val] ? "border-line" : "border-orange-300 bg-orange-50"
                    }`}
                  >
                    <option value="">— abaikan —</option>
                    {eksekutorRoles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
