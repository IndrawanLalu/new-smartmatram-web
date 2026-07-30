"use client";

import { useState, useMemo } from "react";
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertTriangle, SlidersHorizontal,
} from "lucide-react";
import { useFilterGardu } from "../_hooks/useFilterGardu";
import {
  OVERLOAD_PCT, HIGH_CURRENT_A, HIGH_TEMP_C, getNominalCurrent,
  type PengukuranGardu,
} from "../_hooks/usePengukuranGardu";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import GarduDetailModal from "./GarduDetailModal";
import EditPengukuranModal from "./EditPengukuranModal";
import { useCurrentUser } from "@/app/admin/_context/UserContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full border border-line rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 bg-white";
const LABEL_CLS = "block text-[10px] text-ink-soft uppercase tracking-wider mb-1";
const KVA_OPTIONS = [25, 50, 100, 160, 200, 250, 315, 400, 630, 1000];
const PAGE_SIZE = 20;

function fmtTanggal(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

const BEBAN_QUICK = [
  { label: "Overload ≥80%", min: "80", max: "" },
  { label: "Warning 60–80%", min: "60", max: "80" },
  { label: "Normal <60%", min: "", max: "60" },
  { label: "Rendah <20%", min: "", max: "20" },
];

const FLAG_OPTIONS = [
  { key: "onlyOverload" as const, label: `Trafo Overload (beban ≥ ${OVERLOAD_PCT}%)` },
  { key: "onlyHighTemp" as const, label: `Suhu Tinggi (suhu > ${HIGH_TEMP_C}°C)` },
  { key: "onlyHighCurrent" as const, label: `High Current (any fasa > ${HIGH_CURRENT_A}A)` },
  { key: "onlyPhaseOverload" as const, label: "Fase Overload (arus ≥ I-nominal)" },
];

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  user: ReturnType<typeof useCurrentUser>;
}

export default function FilterGarduTab({ user }: Props) {
  const { filter, setFilter, search, reset, results, loading, error, searched } = useFilterGardu(user);
  const [selectedRow, setSelectedRow] = useState<PengukuranGardu | null>(null);
  const [editRow, setEditRow] = useState<PengukuranGardu | null>(null);
  const [page, setPage] = useState(1);

  const showUlp = canSeeAllUnits(user.role);

  const paginatedResults = useMemo(
    () => results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [results, page]
  );
  const totalPages = Math.ceil(results.length / PAGE_SIZE);

  function handleSearch() {
    setPage(1);
    search(filter);
  }

  function handleReset() {
    reset();
    setPage(1);
  }

  function toggleKva(kva: number) {
    setFilter((f) => ({
      ...f,
      kvaList: f.kvaList.includes(kva)
        ? f.kvaList.filter((k) => k !== kva)
        : [...f.kvaList, kva],
    }));
  }

  function setBebanQuick(min: string, max: string) {
    setFilter((f) => ({ ...f, bebanMin: min, bebanMax: max, onlyOverload: false }));
  }

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs border transition-colors ${
      active
        ? "bg-navy-600 border-navy-600 text-white"
        : "border-line text-ink-soft hover:border-navy-500/50 hover:text-ink"
    }`;

  return (
    <div className="space-y-5">
      {/* ── Filter Form ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Card 1: Identitas & Waktu */}
        <div className="bg-white border border-line rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-accent-deep uppercase tracking-wider flex items-center gap-1.5">
            <SlidersHorizontal size={12} /> Identitas & Waktu
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>No. Gardu</label>
              <input
                type="text" value={filter.noGardu}
                onChange={(e) => setFilter((f) => ({ ...f, noGardu: e.target.value }))}
                placeholder="AM013…" className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Penyulang</label>
              <input
                type="text" value={filter.penyulang}
                onChange={(e) => setFilter((f) => ({ ...f, penyulang: e.target.value }))}
                placeholder="BJB…" className={INPUT_CLS}
              />
            </div>
            {showUlp && (
              <div className="col-span-2">
                <label className={LABEL_CLS}>ULP</label>
                <select
                  value={filter.ulp}
                  onChange={(e) => setFilter((f) => ({ ...f, ulp: e.target.value }))}
                  className={INPUT_CLS}
                >
                  <option value="">Semua ULP</option>
                  {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={LABEL_CLS}>Dari Tanggal</label>
              <input
                type="date" value={filter.tglDari}
                onChange={(e) => setFilter((f) => ({ ...f, tglDari: e.target.value }))}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Sampai Tanggal</label>
              <input
                type="date" value={filter.tglSampai}
                onChange={(e) => setFilter((f) => ({ ...f, tglSampai: e.target.value }))}
                className={INPUT_CLS}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Beban & Kapasitas */}
        <div className="bg-white border border-line rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-accent-deep uppercase tracking-wider">
            Beban & Kapasitas Trafo
          </h3>
          {/* Quick chips */}
          <div className="flex flex-wrap gap-1.5">
            {BEBAN_QUICK.map((q) => (
              <button
                key={q.label}
                onClick={() => setBebanQuick(q.min, q.max)}
                className={chip(filter.bebanMin === q.min && filter.bebanMax === q.max)}
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Beban Min (%)</label>
              <input
                type="number" min={0} max={200} value={filter.bebanMin}
                onChange={(e) => setFilter((f) => ({ ...f, bebanMin: e.target.value, onlyOverload: false }))}
                placeholder="0" className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Beban Maks (%)</label>
              <input
                type="number" min={0} max={200} value={filter.bebanMax}
                onChange={(e) => setFilter((f) => ({ ...f, bebanMax: e.target.value, onlyOverload: false }))}
                placeholder="200" className={INPUT_CLS}
              />
            </div>
          </div>
          {/* KVA multi-select */}
          <div>
            <label className={LABEL_CLS}>Kapasitas KVA — pilih satu atau lebih</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {KVA_OPTIONS.map((kva) => (
                <button key={kva} onClick={() => toggleKva(kva)} className={chip(filter.kvaList.includes(kva))}>
                  {kva}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Suhu & Kondisi Cepat */}
        <div className="bg-white border border-line rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-accent-deep uppercase tracking-wider">
            Suhu & Kondisi Cepat
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Suhu Min (°C)</label>
              <input
                type="number" value={filter.suhuMin}
                onChange={(e) => setFilter((f) => ({ ...f, suhuMin: e.target.value, onlyHighTemp: false }))}
                placeholder="0" className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Suhu Maks (°C)</label>
              <input
                type="number" value={filter.suhuMax}
                onChange={(e) => setFilter((f) => ({ ...f, suhuMax: e.target.value, onlyHighTemp: false }))}
                placeholder="100" className={INPUT_CLS}
              />
            </div>
          </div>
          <div className="border-t border-line pt-3 space-y-2.5">
            <p className="text-[10px] text-ink-soft uppercase tracking-wider">Filter Cepat</p>
            {FLAG_OPTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox" checked={filter[key]}
                  onChange={(e) => setFilter((f) => ({ ...f, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded accent-navy-600 shrink-0"
                />
                <span className="text-xs text-ink-soft group-hover:text-ink transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Card 4: Arus & Tegangan */}
        <div className="bg-white border border-line rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-accent-deep uppercase tracking-wider">
            Arus & Tegangan
          </h3>
          <div>
            <label className={LABEL_CLS}>Arus Maks Fasa (R/S/T) ≥ (A)</label>
            <input
              type="number" value={filter.arusMaxFaseMin}
              onChange={(e) => setFilter((f) => ({ ...f, arusMaxFaseMin: e.target.value }))}
              placeholder={`${HIGH_CURRENT_A} (threshold default)`} className={INPUT_CLS}
            />
            <p className="text-[10px] text-ink-soft mt-1">
              Gardu dengan setidaknya 1 fasa ≥ nilai ini
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { field: "arusRMin" as const, label: "Arus R ≥ (A)" },
                { field: "arusSMin" as const, label: "Arus S ≥ (A)" },
                { field: "arusTMin" as const, label: "Arus T ≥ (A)" },
                { field: "arusNMin" as const, label: "Arus N ≥ (A)" },
              ] as const
            ).map(({ field, label }) => (
              <div key={field}>
                <label className={LABEL_CLS}>{label}</label>
                <input
                  type="number" value={filter[field]}
                  onChange={(e) => setFilter((f) => ({ ...f, [field]: e.target.value }))}
                  placeholder="0" className={INPUT_CLS}
                />
              </div>
            ))}
          </div>
          <div className="border-t border-line pt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Tegangan ≤ (V) — Undervoltage</label>
              <input
                type="number" value={filter.tegUnderMax}
                onChange={(e) => setFilter((f) => ({ ...f, tegUnderMax: e.target.value }))}
                placeholder="210" className={INPUT_CLS}
              />
              <p className="text-[10px] text-ink-soft mt-1">Cari gardu tegangan rendah</p>
            </div>
            <div>
              <label className={LABEL_CLS}>Tegangan ≥ (V) — Overvoltage</label>
              <input
                type="number" value={filter.tegOverMin}
                onChange={(e) => setFilter((f) => ({ ...f, tegOverMin: e.target.value }))}
                placeholder="240" className={INPUT_CLS}
              />
              <p className="text-[10px] text-ink-soft mt-1">Cari gardu tegangan tinggi</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Buttons ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line text-sm text-ink-soft hover:bg-surface transition-colors"
        >
          <RefreshCw size={13} /> Reset Filter
        </button>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2 rounded-lg bg-navy-600 text-white text-sm font-medium hover:bg-navy-500 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? "Mencari..." : "Cari"}
        </button>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
          Gagal mengambil data: {error}
        </div>
      )}

      {/* ── Results Table ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">
            {searched
              ? `Hasil Filter — ${results.length} gardu ditemukan`
              : "Hasil Pencarian"}
          </h3>
          {searched && results.length > 0 && (
            <p className="text-xs text-ink-soft">Klik baris untuk detail</p>
          )}
        </div>

        {!searched ? (
          <div className="py-16 text-center text-ink-soft text-sm">
            Atur filter di atas, lalu klik{" "}
            <span className="text-navy-600 font-medium">Cari</span>
          </div>
        ) : loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-6 h-6 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center text-ink-soft text-sm">
            Tidak ada gardu yang cocok dengan filter yang dipilih
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy-50">
                    <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap">No. Gardu</th>
                    <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold">Penyulang</th>
                    <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold">KVA</th>
                    <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold min-w-32">Beban %</th>
                    <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap">Arus R/S/T (A)</th>
                    <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap">Arus Max (A)</th>
                    <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold">Suhu (°C)</th>
                    <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap">Teg R/S/T (V)</th>
                    <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap">Tgl Ukur</th>
                    <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.map((row, i) => {
                    const maxArus = Math.max(row.total_arus_r, row.total_arus_s, row.total_arus_t);
                    const iNom = getNominalCurrent(row.kva_trafo);
                    const isOverload = row.persen_beban >= OVERLOAD_PCT;
                    const isHighTemp = row.suhu_trafo > HIGH_TEMP_C;
                    const isHighCurrent = maxArus > HIGH_CURRENT_A;
                    const isPhaseOl = maxArus >= iNom;

                    const arusCls = (v: number) => {
                      if (v > HIGH_CURRENT_A) return "text-red-600 font-bold";
                      if (v >= iNom) return "text-red-600 font-semibold";
                      if (v >= iNom * 0.9) return "text-amber-600 font-semibold";
                      return "text-ink-soft";
                    };

                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedRow(row)}
                        className={`cursor-pointer hover:bg-navy-50 transition-colors ${
                          i % 2 === 0 ? "bg-white" : "bg-white"
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">
                          {row.no_gardu}
                        </td>
                        <td className="px-4 py-3 text-ink-soft">{row.penyulang ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-ink font-medium">
                          {row.kva_trafo}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-14 bg-surface rounded-full h-1.5 shrink-0">
                              <div
                                className={`h-1.5 rounded-full ${isOverload ? "bg-red-500" : row.persen_beban >= 60 ? "bg-amber-500" : "bg-emerald-600"}`}
                                style={{ width: `${Math.min(row.persen_beban, 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-semibold ${isOverload ? "text-red-600" : row.persen_beban >= 60 ? "text-amber-600" : "text-accent-deep"}`}>
                              {Math.round(row.persen_beban)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-xs flex items-center justify-center gap-0.5">
                            <span className={arusCls(row.total_arus_r)}>{Math.round(row.total_arus_r)}</span>
                            <span className="text-line">/</span>
                            <span className={arusCls(row.total_arus_s)}>{Math.round(row.total_arus_s)}</span>
                            <span className="text-line">/</span>
                            <span className={arusCls(row.total_arus_t)}>{Math.round(row.total_arus_t)}</span>
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-center font-mono font-medium text-xs ${isHighCurrent ? "text-red-600" : isPhaseOl ? "text-amber-600" : "text-ink-soft"}`}>
                          {Math.round(maxArus)}
                          {(isHighCurrent || isPhaseOl) && (
                            <AlertTriangle size={10} className="inline ml-1" />
                          )}
                        </td>
                        <td className={`px-4 py-3 text-center font-mono text-xs ${isHighTemp ? "text-amber-600 font-medium" : "text-ink-soft"}`}>
                          {row.suhu_trafo}°C
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs text-ink-soft">
                          {Math.round(row.total_teg_rn)}/
                          {Math.round(row.total_teg_sn)}/
                          {Math.round(row.total_teg_tn)}
                        </td>
                        <td className="px-4 py-3 text-ink-soft whitespace-nowrap text-xs">
                          {fmtTanggal(row.tanggal_pengukuran)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {isOverload && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
                                OVERLOAD
                              </span>
                            )}
                            {isHighTemp && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
                                SUHU ↑
                              </span>
                            )}
                            {isHighCurrent && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
                                HI-A
                              </span>
                            )}
                            {!isHighCurrent && isPhaseOl && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 whitespace-nowrap">
                                FASE-OL
                              </span>
                            )}
                            {row.wo_sent_at && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-navy-50 text-navy-600 border border-navy-200 whitespace-nowrap">
                                WO
                              </span>
                            )}
                            {row.amg_sent_at && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 whitespace-nowrap">
                                AMG
                              </span>
                            )}
                            {!row.amg_sent_at && row.amg_queued_at && row.amg_error && (
                              <span
                                title={row.amg_error}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap"
                              >
                                AMG GAGAL{(row.amg_attempts ?? 0) >= 3 ? " 3×" : ""}
                              </span>
                            )}
                            {!row.amg_sent_at && row.amg_queued_at && !row.amg_error && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
                                ANTRIAN
                              </span>
                            )}
                            {!isOverload && !isHighTemp && !isHighCurrent && !isPhaseOl && !row.wo_sent_at && !row.amg_sent_at && !row.amg_queued_at && (
                              <span className="text-[10px] text-accent-deep">Normal</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-line flex items-center justify-between">
                <p className="text-xs text-ink-soft">
                  Halaman {page} dari {totalPages} ({results.length} gardu)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <GarduDetailModal
        key={selectedRow?.id}
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onEdit={setEditRow}
        allData={results}
      />
      <EditPengukuranModal
        row={editRow}
        onClose={() => setEditRow(null)}
        onSaved={() => {
          setEditRow(null);
          setSelectedRow(null);
          search(filter);
        }}
      />
    </div>
  );
}
