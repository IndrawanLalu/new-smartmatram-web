"use client";

import { useState, useEffect } from "react";
import { type CurrentUser, canSeeAllUnits, CATEGORY_CONFIG, type InspeksiCategory } from "@/lib/roles";
import { useInspeksiPohon, type InspeksiPohon, type FilterPohon } from "../_hooks/useInspeksiPohon";
import InlineStatusSelect from "./InlineStatusSelect";
import InlineEksekutorSelect from "./InlineEksekutorSelect";
import InlineTeamSelect from "./InlineTeamSelect";
import InlineCategorySelect from "./InlineCategorySelect";
import InspeksiPohonDetailModal from "./_InspeksiPohonDetailModal";
import { useMemo } from "react";
import {
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileSearch,
} from "lucide-react";
import { CARD, FIELD } from "@/app/admin/_ui";

const STATUS_OPTIONS = [
  "Temuan",
  "Perlu Tindakan",
  "Ditugaskan",
  "Dalam Proses",
  "Selesai",
];
const RISIKO_OPTIONS = ["Rendah", "Sedang", "Tinggi", "Sangat Tinggi"];
const URGENCY_OPTIONS = ["SANGAT URGENT", "URGENT", "PERLU TINDAKAN", "AMAN"];
const CATEGORY_OPTIONS = Object.keys(CATEGORY_CONFIG) as InspeksiCategory[];


function exportExcel(filter: FilterPohon) {
  const params = new URLSearchParams({ jenis: "pohon" });
  if (filter.search)       params.set("search",        filter.search);
  if (filter.startDate)    params.set("startDate",     filter.startDate);
  if (filter.endDate)      params.set("endDate",       filter.endDate);
  if (filter.ulp)          params.set("ulp",           filter.ulp);
  if (filter.penyulang)    params.set("penyulang",     filter.penyulang);
  if (filter.status)       params.set("status",        filter.status);
  if (filter.category)     params.set("category",      filter.category);
  if (filter.tingkatRisiko) params.set("tingkat_risiko", filter.tingkatRisiko);
  window.open(`/api/export/inspeksi?${params.toString()}`);
}

const RISIKO_COLOR: Record<string, string> = {
  Rendah: "bg-green-50 text-green-700",
  Sedang: "bg-yellow-50 text-yellow-700",
  Tinggi: "bg-orange-50 text-orange-700",
  "Sangat Tinggi": "bg-red-50 text-red-700",
};

interface Props {
  user: CurrentUser;
  filterUlp?: string;
}

export default function InspeksiPohonTab({ user, filterUlp }: Props) {
  const {
    data,
    allData,
    rawData,
    loading,
    error,
    filter,
    setFilter,
    page,
    setPage,
    totalPages,
    totalFiltered,
    ulpOptions,
    penyulangOptions,
    updateStatus,
    updateEksekutor,
    updateTeam,
    updateKeterangan,
    updateDeskripsi,
    updateCategory,
    uploadFotoSesudah,
    deleteInspeksi,
    refresh,
  } = useInspeksiPohon(user);

  // Dihitung langsung dari rawData + filterUlp prop agar reaktif tanpa delay useEffect
  const sanggatUrgentCount = useMemo(
    () => rawData.filter(
      (d) => d.tingkat_risiko === "Sangat Tinggi" &&
             d.status !== "Selesai" &&
             (!filterUlp || d.ulp === filterUlp)
    ).length,
    [rawData, filterUlp]
  );

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  // Derive dari rawData agar selalu up-to-date saat foto/status diupdate
  const selectedRow = selectedRowId ? (rawData.find((r) => r.id === selectedRowId) ?? null) : null;
  const showUlpFilter = canSeeAllUnits(user.role);

  // Sync filterUlp dari page level ke filter internal
  useEffect(() => {
    if (filterUlp !== undefined) {
      setFilter((f) => ({ ...f, ulp: filterUlp, penyulang: "" }));
      setPage(1);
    }
  }, [filterUlp, setFilter, setPage]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
        Gagal memuat data: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Warning banner sangat urgent */}
      {sanggatUrgentCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            {sanggatUrgentCount} pohon dalam kondisi{" "}
            <span className="font-bold">Risiko Sangat Tinggi</span> — segera tindak lanjuti!
          </p>
        </div>
      )}

      {/* Filter bar */}
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
            />
            <input
              type="text"
              placeholder="Cari penyulang, jenis pohon, inspektor..."
              value={filter.search}
              onChange={(e) => {
                setFilter((f) => ({ ...f, search: e.target.value }));
                setPage(1);
              }}
              className="h-9 w-full pl-9 pr-3 rounded-full border border-line bg-surface text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 transition-colors"
            />
          </div>

          <input
            type="date"
            value={filter.startDate}
            onChange={(e) => {
              setFilter((f) => ({ ...f, startDate: e.target.value }));
              setPage(1);
            }}
            className={FIELD}
          />
          <input
            type="date"
            value={filter.endDate}
            onChange={(e) => {
              setFilter((f) => ({ ...f, endDate: e.target.value }));
              setPage(1);
            }}
            className={FIELD}
          />

          {showUlpFilter && (
            <select
              value={filter.ulp}
              onChange={(e) => {
                setFilter((f) => ({
                  ...f,
                  ulp: e.target.value,
                  penyulang: "",
                }));
                setPage(1);
              }}
              className={FIELD}
            >
              <option value="">Semua ULP</option>
              {ulpOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}

          <select
            value={filter.penyulang}
            onChange={(e) => {
              setFilter((f) => ({ ...f, penyulang: e.target.value }));
              setPage(1);
            }}
            className={FIELD}
          >
            <option value="">Semua Penyulang</option>
            {penyulangOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={filter.status}
            onChange={(e) => {
              setFilter((f) => ({ ...f, status: e.target.value }));
              setPage(1);
            }}
            className={FIELD}
          >
            <option value="">Semua Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={filter.tingkatRisiko}
            onChange={(e) => {
              setFilter((f) => ({ ...f, tingkatRisiko: e.target.value }));
              setPage(1);
            }}
            className={FIELD}
          >
            <option value="">Semua Risiko</option>
            {RISIKO_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            value={filter.urgency}
            onChange={(e) => {
              setFilter((f) => ({ ...f, urgency: e.target.value }));
              setPage(1);
            }}
            className={FIELD}
          >
            <option value="">Semua Urgensi</option>
            {URGENCY_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          <select
            value={filter.category}
            onChange={(e) => {
              setFilter((f) => ({ ...f, category: e.target.value }));
              setPage(1);
            }}
            className={FIELD}
          >
            <option value="">Semua Kategori</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>
            ))}
          </select>

          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm text-ink-soft hover:bg-surface transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => exportExcel(filter)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-50 text-navy-600 text-sm font-semibold hover:bg-navy-100 transition-colors"
          >
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-line">
          <p className="text-sm text-ink-soft">
            {loading ? "Memuat..." : `${totalFiltered} data ditemukan`}
          </p>
        </div>

        <div className="overflow-auto max-h-[calc(100vh-var(--topbar-h)-30rem)] min-h-[16rem]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-navy-50">
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold whitespace-nowrap">
                  Tgl Inspeksi
                </th>
                {showUlpFilter && (
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                    ULP
                  </th>
                )}
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Penyulang
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Jenis Pohon
                </th>
                <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Alamat
                </th>
                <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Inspektor
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Kategori
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Risiko
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Eksekutor
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Team
                </th>
                <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                  >
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-line animate-skeleton rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td
                    colSpan={showUlpFilter ? 12 : 11}
                    className="text-center py-12 text-ink-soft text-sm"
                  >
                    Tidak ada data yang sesuai filter
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr
                    key={row.id}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}
                  >
                    <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                      {row.tgl_inspeksi ?? "—"}
                    </td>
                    {showUlpFilter && (
                      <td className="px-4 py-3 text-ink-soft">
                        {row.ulp ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-ink">
                      {row.penyulang ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      <p>{row.jenis_pohon ?? "—"}</p>
                      {row.deskripsi && (
                        <p className="text-xs text-ink-soft truncate max-w-40">
                          {row.deskripsi}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-soft">
                      {row.lokasi != null ? `${row.lokasi} ` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-soft">
                      {row.inspektor != null ? `${row.inspektor} ` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <InlineCategorySelect
                        id={row.id}
                        currentCategory={row.category}
                        onUpdate={updateCategory}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {row.tingkat_risiko ? (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${RISIKO_COLOR[row.tingkat_risiko] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {row.tingkat_risiko}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <InlineStatusSelect
                        id={row.id}
                        currentStatus={row.status}
                        onUpdate={updateStatus}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineEksekutorSelect
                        id={row.id}
                        currentEksekutor={row.eksekutor}
                        onUpdate={updateEksekutor}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineTeamSelect
                        id={row.id}
                        currentTeam={row.team_name}
                        onUpdate={updateTeam}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedRowId(row.id)}
                        className="inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-lg border border-line bg-white text-[11px] font-semibold text-ink-soft hover:border-navy-300 hover:bg-navy-50 hover:text-navy-600 transition-colors"
                        title="Lihat detail"
                      >
                        <FileSearch size={13} /> Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-line flex items-center justify-between">
            <p className="text-xs text-ink-soft">
              Halaman {page} dari {totalPages}
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
      </div>

      {/* Detail Modal */}
      {selectedRow && (
        <InspeksiPohonDetailModal
          data={selectedRow}
          user={user}
          onClose={() => setSelectedRowId(null)}
          updateStatus={updateStatus}
          updateKeterangan={updateKeterangan}
          updateDeskripsi={updateDeskripsi}
          updateCategory={updateCategory}
          uploadFotoSesudah={uploadFotoSesudah}
          deleteInspeksi={async (id) => {
            await deleteInspeksi(id);
            setSelectedRowId(null);
          }}
        />
      )}
    </div>
  );
}
