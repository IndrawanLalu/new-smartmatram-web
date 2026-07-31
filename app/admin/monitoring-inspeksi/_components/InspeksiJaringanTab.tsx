"use client";

import { useState, useEffect } from "react";
import { type CurrentUser, canSeeAllUnits, CATEGORY_CONFIG, type InspeksiCategory } from "@/lib/roles";
import { useInspeksiJaringan, type InspeksiJaringan, type FilterJaringan } from "../_hooks/useInspeksiJaringan";
import InlineStatusSelect from "./InlineStatusSelect";
import InlineEksekutorSelect from "./InlineEksekutorSelect";
import InlineCategorySelect from "./InlineCategorySelect";
import InspeksiDetailModal from "./_InspeksiDetailModal";
import { Search, RefreshCw, Download, ChevronLeft, ChevronRight, FileSearch } from "lucide-react";
import { CARD, FIELD } from "@/app/admin/_ui";

const STATUS_OPTIONS = ["Temuan", "Perlu Tindakan", "Ditugaskan", "Dalam Proses", "Selesai"];
const CATEGORY_OPTIONS = Object.keys(CATEGORY_CONFIG) as InspeksiCategory[];


function exportExcel(filter: FilterJaringan) {
  const params = new URLSearchParams({ jenis: "jaringan" });
  if (filter.search)    params.set("search",    filter.search);
  if (filter.startDate) params.set("startDate", filter.startDate);
  if (filter.endDate)   params.set("endDate",   filter.endDate);
  if (filter.ulp)       params.set("ulp",       filter.ulp);
  if (filter.penyulang) params.set("penyulang", filter.penyulang);
  if (filter.status)    params.set("status",    filter.status);
  if (filter.category)  params.set("category",  filter.category);
  window.open(`/api/export/inspeksi?${params.toString()}`);
}

interface Props {
  user: CurrentUser;
  filterUlp?: string;
}

export default function InspeksiJaringanTab({ user, filterUlp }: Props) {
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
    updateCategory,
    updateTemuan,
    updateDeskripsi,
    uploadFotoSesudah,
    deleteInspeksi,
    refresh,
  } = useInspeksiJaringan(user);

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
      {/* Filter bar */}
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              type="text"
              placeholder="Cari penyulang, lokasi, temuan..."
              value={filter.search}
              onChange={(e) => { setFilter((f) => ({ ...f, search: e.target.value })); setPage(1); }}
              className="h-9 w-full pl-9 pr-3 rounded-full border border-line bg-surface text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 transition-colors"
            />
          </div>

          {/* Date range */}
          <input type="date" value={filter.startDate} onChange={(e) => { setFilter((f) => ({ ...f, startDate: e.target.value })); setPage(1); }} className={FIELD} />
          <input type="date" value={filter.endDate} onChange={(e) => { setFilter((f) => ({ ...f, endDate: e.target.value })); setPage(1); }} className={FIELD} />

          {/* ULP — hanya UP3 */}
          {showUlpFilter && (
            <select value={filter.ulp} onChange={(e) => { setFilter((f) => ({ ...f, ulp: e.target.value, penyulang: "" })); setPage(1); }} className={FIELD}>
              <option value="">Semua ULP</option>
              {ulpOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}

          {/* Penyulang */}
          <select value={filter.penyulang} onChange={(e) => { setFilter((f) => ({ ...f, penyulang: e.target.value })); setPage(1); }} className={FIELD}>
            <option value="">Semua Penyulang</option>
            {penyulangOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Status */}
          <select value={filter.status} onChange={(e) => { setFilter((f) => ({ ...f, status: e.target.value })); setPage(1); }} className={FIELD}>
            <option value="">Semua Status</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Kategori */}
          <select value={filter.category} onChange={(e) => { setFilter((f) => ({ ...f, category: e.target.value })); setPage(1); }} className={FIELD}>
            <option value="">Semua Kategori</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>)}
          </select>

          {/* Actions */}
          <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm text-ink-soft hover:bg-surface transition-colors">
            <RefreshCw size={14} />
            Refresh
          </button>
          <button onClick={() => exportExcel(filter)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-50 text-navy-600 text-sm font-semibold hover:bg-navy-100 transition-colors">
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <p className="text-sm text-ink-soft">
            {loading ? "Memuat..." : `${totalFiltered} data ditemukan`}
          </p>
        </div>

        <div className="overflow-auto max-h-[calc(100vh-var(--topbar-h)-30rem)] min-h-[16rem]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-navy-50">
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold whitespace-nowrap">Tgl Inspeksi</th>
                {showUlpFilter && <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">ULP</th>}
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">Penyulang</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">Temuan / Deskripsi</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">Lokasi</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">Kategori</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">Status</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">Eksekutor</th>
                <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wide text-navy-600 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-line animate-skeleton rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={showUlpFilter ? 9 : 8} className="text-center py-12 text-ink-soft text-sm">
                    Tidak ada data yang sesuai filter
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                    <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}>
                      <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{row.tgl_inspeksi ?? "—"}</td>
                      {showUlpFilter && <td className="px-4 py-3 text-ink-soft">{row.ulp ?? "—"}</td>}
                      <td className="px-4 py-3 font-medium text-ink">{row.penyulang ?? "—"}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-medium text-ink truncate">{row.temuan ?? "—"}</p>
                        {row.deskripsi && <p className="text-xs text-ink-soft truncate">{row.deskripsi}</p>}
                      </td>
                      <td className="px-4 py-3 text-ink-soft truncate max-w-32">{row.lokasi ?? "—"}</td>
                      <td className="px-4 py-3">
                        <InlineCategorySelect
                          id={row.id}
                          currentCategory={row.category}
                          onUpdate={updateCategory}
                        />
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

        {/* Pagination */}
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
        <InspeksiDetailModal
          data={selectedRow}
          user={user}
          onClose={() => setSelectedRowId(null)}
          updateStatus={updateStatus}
          updateTemuan={updateTemuan}
          updateDeskripsi={updateDeskripsi}
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
