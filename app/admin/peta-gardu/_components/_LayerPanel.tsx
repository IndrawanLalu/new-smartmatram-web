"use client";

import { Search, Download, Loader2 } from "lucide-react";
import type { Gardu, Jalur, Tiang, PetaFilter, PetaStats } from "../_hooks/types";

const ULP_OPTIONS = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];
const INPUT_CLS =
  "border border-[#1e3552] rounded-lg px-2.5 py-1.5 text-xs text-[#e2e8f0] bg-[#0d1b2a] focus:outline-none focus:border-[#00897B] focus:ring-1 focus:ring-[#00897B]/20 w-full";

interface Props {
  filter: PetaFilter;
  setFilter: (patch: Partial<PetaFilter>) => void;
  stats: PetaStats;
  feederOptions: string[];
  isUP3: boolean;
  garduList: Gardu[];
  jalurList: Jalur[];
  tiangList: Tiang[];
  // TiangRef props
  tiangRefCount: number;
  tiangRefLoading: boolean;
  tiangRefError: string | null;
  tiangRefSelectedFeeders: string[];
  toggleTiangFeeder: (f: string) => void;
  showTiangRef: boolean;
  setShowTiangRef: (v: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
}

export default function LayerPanel({
  filter,
  setFilter,
  stats,
  feederOptions,
  isUP3,
  garduList,
  jalurList,
  tiangList,
  tiangRefCount,
  tiangRefLoading,
  tiangRefError,
  tiangRefSelectedFeeders,
  toggleTiangFeeder,
  showTiangRef,
  setShowTiangRef,
  snapEnabled,
  setSnapEnabled,
}: Props) {
  const exportGeoJSON = (type: "gardu" | "jalur" | "tiang") => {
    let features: object[] = [];
    if (type === "gardu") {
      features = garduList.map((g) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [g.lng, g.lat] },
        properties: {
          kode: g.kode, nama: g.nama, feeder: g.feeder, daya: g.daya,
          merk: g.merk, status: g.status, beban_persen: g.beban_persen, ulp: g.ulp,
        },
      }));
    } else if (type === "jalur") {
      features = jalurList.map((j) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: j.koordinat.map(([lat, lng]) => [lng, lat]) },
        properties: {
          id: j.id, nama: j.nama, feeder: j.feeder, penghantar: j.penghantar,
          jarak: j.jarak, status: j.status, ulp: j.ulp,
        },
      }));
    } else {
      features = tiangList.map((t) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [t.lng, t.lat] },
        properties: {
          kode: t.kode, jenis: t.jenis, tinggi: t.tinggi, kondisi: t.kondisi,
          feeder: t.feeder, alamat: t.alamat, ulp: t.ulp,
        },
      }));
    }
    const fc = { type: "FeatureCollection", features };
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${type}.geojson`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = (type: "gardu" | "tiang") => {
    const list = type === "gardu" ? garduList : tiangList;
    if (list.length === 0) return;
    const keys = Object.keys(list[0]);
    const rows = [keys.join(","), ...list.map((row) =>
      keys.map((k) => JSON.stringify((row as unknown as Record<string, unknown>)[k] ?? "")).join(",")
    )];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${type}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Per-feeder stats
  const feederStats = feederOptions.map((f) => ({
    feeder: f,
    gardu: garduList.filter((g) => g.feeder === f).length,
    km: (jalurList.filter((j) => j.feeder === f).reduce((s, j) => s + (j.jarak ?? 0), 0) / 1000).toFixed(1),
  }));

  return (
    <div className="w-[220px] shrink-0 bg-[#0a1628] border-r border-[#1e3552] flex flex-col overflow-y-auto">
      {/* Search */}
      <div className="p-3 border-b border-[#1e3552]">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Cari kode, nama, feeder..."
            value={filter.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            className={`${INPUT_CLS} pl-7`}
          />
        </div>
      </div>

      {/* Layer toggles */}
      <div className="p-3 border-b border-[#1e3552] space-y-2">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">
          Layer
        </p>
        {[
          { key: "showGardu" as const, label: "Gardu", count: stats.garduCount, color: "#10B981" },
          { key: "showJalur" as const, label: "Jalur", count: stats.jalurCount, color: "#00897B" },
          { key: "showTiang" as const, label: "Tiang", count: stats.tiangCount, color: "#F59E0B" },
        ].map(({ key, label, count, color }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={filter[key]}
              onChange={(e) => setFilter({ [key]: e.target.checked })}
              className="sr-only"
            />
            <span
              className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                filter[key] ? "border-transparent" : "border-[#1e3552] bg-[#0d1b2a]"
              }`}
              style={filter[key] ? { backgroundColor: color } : {}}
            >
              {filter[key] && (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <span className="text-xs text-gray-300 flex-1">{label}</span>
            <span className="text-[10px] font-mono text-gray-500">{count}</span>
          </label>
        ))}
      </div>

      {/* Tiang Referensi — auto-load dari filter feeder */}
      <div className="p-3 border-b border-[#1e3552] space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold flex-1">
            Tiang Referensi
          </p>
          {tiangRefLoading && <Loader2 size={10} className="animate-spin text-cyan-500" />}
          {!tiangRefLoading && tiangRefCount > 0 && (
            <span className="text-[10px] font-mono text-cyan-500">{tiangRefCount} tiang</span>
          )}
        </div>

        {/* Checkbox per feeder */}
        {feederOptions.length === 0 ? (
          <p className="text-[10px] text-gray-600 italic">Tidak ada data feeder</p>
        ) : (
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {feederOptions.map((f) => {
              const checked = tiangRefSelectedFeeders.includes(f);
              return (
                <label key={f} className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={checked}
                    onChange={() => toggleTiangFeeder(f)} className="sr-only" />
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                    checked ? "border-transparent bg-cyan-500" : "border-[#1e3552] bg-[#0d1b2a]"
                  }`}>
                    {checked && (
                      <svg width="9" height="9" viewBox="0 0 10 10">
                        <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[11px] text-gray-400 truncate group-hover:text-gray-200 transition-colors">{f}</span>
                </label>
              );
            })}
          </div>
        )}

        {tiangRefError && (
          <p className="text-[10px] text-red-400">{tiangRefError}</p>
        )}

        {/* Toggle + snap */}
        {tiangRefCount > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-[#1e3552]/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTiangRef}
                onChange={(e) => setShowTiangRef(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                  showTiangRef ? "border-transparent bg-cyan-500" : "border-[#1e3552] bg-[#0d1b2a]"
                }`}
              >
                {showTiangRef && (
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <span className="text-xs text-gray-300">Tampilkan di peta</span>
              <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={snapEnabled}
                onChange={(e) => setSnapEnabled(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                  snapEnabled ? "border-transparent bg-[#00897B]" : "border-[#1e3552] bg-[#0d1b2a]"
                }`}
              >
                {snapEnabled && (
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <span className="text-xs text-gray-300">Snap saat draw jalur</span>
            </label>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-[#1e3552] space-y-2">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">
          Filter
        </p>
        <select
          value={filter.feeder}
          onChange={(e) => setFilter({ feeder: e.target.value })}
          className={INPUT_CLS}
        >
          <option value="">Semua Feeder</option>
          {feederOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {isUP3 && (
          <select
            value={filter.ulp}
            onChange={(e) => setFilter({ ulp: e.target.value })}
            className={INPUT_CLS}
          >
            <option value="">Semua ULP</option>
            {ULP_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}

        {(filter.feeder || filter.ulp || filter.search) && (
          <button
            onClick={() => setFilter({ feeder: "", ulp: "", search: "", status: "" })}
            className="text-[10px] text-[#00897B] hover:text-[#5eead4] transition-colors"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="p-3 border-b border-[#1e3552]">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">
          Statistik
        </p>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Total jaringan</span>
            <span className="font-mono text-[#5eead4]">{stats.jalurKm.toFixed(1)} km</span>
          </div>
          {feederStats.slice(0, 6).map(({ feeder, gardu, km }) => (
            <div key={feeder} className="text-[10px] text-gray-500 flex justify-between">
              <span className="truncate mr-2">{feeder}</span>
              <span className="font-mono shrink-0">{gardu}g · {km}km</span>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="p-3 border-b border-[#1e3552]">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">
          Legenda Gardu
        </p>
        <div className="space-y-1">
          {[
            { color: "#10B981", label: "Normal (<60%)" },
            { color: "#F59E0B", label: "Warning (60–79%)" },
            { color: "#EF4444", label: "Overload (≥80%)" },
            { color: "#4B5563", label: "Belum diukur" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <div className="p-3 mt-auto">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">
          Export
        </p>
        <div className="space-y-1">
          {[
            { label: "Gardu GeoJSON", onClick: () => exportGeoJSON("gardu") },
            { label: "Jalur GeoJSON", onClick: () => exportGeoJSON("jalur") },
            { label: "Tiang GeoJSON", onClick: () => exportGeoJSON("tiang") },
            { label: "Gardu CSV", onClick: () => exportCSV("gardu") },
            { label: "Tiang CSV",  onClick: () => exportCSV("tiang") },
          ].map(({ label, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex items-center gap-1.5 w-full text-left text-[10px] text-gray-500 hover:text-gray-300 transition-colors py-0.5"
            >
              <Download size={10} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
