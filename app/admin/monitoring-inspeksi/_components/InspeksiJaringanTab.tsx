"use client";

import { useState, useEffect } from "react";
import { type CurrentUser, canSeeAllUnits, CATEGORY_CONFIG, type InspeksiCategory } from "@/lib/roles";
import { useInspeksiJaringan, type InspeksiJaringan, type FilterJaringan } from "../_hooks/useInspeksiJaringan";
import InlineStatusSelect from "./InlineStatusSelect";
import InlineEksekutorSelect from "./InlineEksekutorSelect";
import InlineCategorySelect from "./InlineCategorySelect";
import InspeksiDetailModal from "./_InspeksiDetailModal";
import { Search, RefreshCw, Download, ChevronLeft, ChevronRight, FileSearch } from "lucide-react";

const STATUS_OPTIONS = ["Temuan", "Perlu Tindakan", "Ditugaskan", "Dalam Proses", "Selesai"];
const CATEGORY_OPTIONS = Object.keys(CATEGORY_CONFIG) as InspeksiCategory[];

const INPUT_CLASS =
  "border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]";

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
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              type="text"
              placeholder="Cari penyulang, lokasi, temuan..."
              value={filter.search}
              onChange={(e) => { setFilter((f) => ({ ...f, search: e.target.value })); setPage(1); }}
              className={`${INPUT_CLASS} pl-8 w-full`}
            />
          </div>

          {/* Date range */}
          <input type="date" value={filter.startDate} onChange={(e) => { setFilter((f) => ({ ...f, startDate: e.target.value })); setPage(1); }} className={INPUT_CLASS} />
          <input type="date" value={filter.endDate} onChange={(e) => { setFilter((f) => ({ ...f, endDate: e.target.value })); setPage(1); }} className={INPUT_CLASS} />

          {/* ULP — hanya UP3 */}
          {showUlpFilter && (
            <select value={filter.ulp} onChange={(e) => { setFilter((f) => ({ ...f, ulp: e.target.value, penyulang: "" })); setPage(1); }} className={INPUT_CLASS}>
              <option value="">Semua ULP</option>
              {ulpOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}

          {/* Penyulang */}
          <select value={filter.penyulang} onChange={(e) => { setFilter((f) => ({ ...f, penyulang: e.target.value })); setPage(1); }} className={INPUT_CLASS}>
            <option value="">Semua Penyulang</option>
            {penyulangOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Status */}
          <select value={filter.status} onChange={(e) => { setFilter((f) => ({ ...f, status: e.target.value })); setPage(1); }} className={INPUT_CLASS}>
            <option value="">Semua Status</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Kategori */}
          <select value={filter.category} onChange={(e) => { setFilter((f) => ({ ...f, category: e.target.value })); setPage(1); }} className={INPUT_CLASS}>
            <option value="">Semua Kategori</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>)}
          </select>

          {/* Actions */}
          <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e3552] text-sm text-[#94a3b8] hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} />
            Refresh
          </button>
          <button onClick={() => exportExcel(filter)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0a2a26] text-[#5eead4] text-sm font-medium hover:bg-[#b2dfdb] transition-colors">
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e3552] flex items-center justify-between">
          <p className="text-sm text-[#94a3b8]">
            {loading ? "Memuat..." : `${totalFiltered} data ditemukan`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0a2a26]">
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold whitespace-nowrap">Tgl Inspeksi</th>
                {showUlpFilter && <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">ULP</th>}
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Penyulang</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Temuan / Deskripsi</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Lokasi</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Kategori</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Status</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Eksekutor</th>
                <th className="text-center px-4 py-3 text-xs text-[#5eead4] font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-[#162334]" : "bg-gray-50/50"}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={showUlpFilter ? 9 : 8} className="text-center py-12 text-[#94a3b8] text-sm">
                    Tidak ada data yang sesuai filter
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                    <tr key={row.id} className={i % 2 === 0 ? "bg-[#162334]" : "bg-gray-50/30"}>
                      <td className="px-4 py-3 text-[#94a3b8] whitespace-nowrap">{row.tgl_inspeksi ?? "—"}</td>
                      {showUlpFilter && <td className="px-4 py-3 text-[#94a3b8]">{row.ulp ?? "—"}</td>}
                      <td className="px-4 py-3 font-medium text-[#e2e8f0]">{row.penyulang ?? "—"}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-medium text-[#e2e8f0] truncate">{row.temuan ?? "—"}</p>
                        {row.deskripsi && <p className="text-xs text-[#94a3b8] truncate">{row.deskripsi}</p>}
                      </td>
                      <td className="px-4 py-3 text-[#94a3b8] truncate max-w-32">{row.lokasi ?? "—"}</td>
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
                          className="w-7 h-7 flex items-center justify-center mx-auto rounded-lg text-[#94a3b8] hover:text-[#5eead4] hover:bg-[#00897B]/10 transition-colors"
                          title="Lihat detail"
                        >
                          <FileSearch size={15} />
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
          <div className="px-5 py-3 border-t border-[#1e3552] flex items-center justify-between">
            <p className="text-xs text-[#94a3b8]">
              Halaman {page} dari {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e3552] text-[#94a3b8] hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e3552] text-[#94a3b8] hover:bg-gray-50 disabled:opacity-40 transition-colors"
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
