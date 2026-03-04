"use client";

import { type CurrentUser, canSeeAllUnits, CATEGORY_CONFIG, type InspeksiCategory } from "@/lib/roles";
import { useInspeksiJaringan } from "../_hooks/useInspeksiJaringan";
import InlineStatusSelect from "./InlineStatusSelect";
import InlineEksekutorSelect from "./InlineEksekutorSelect";
import { Search, RefreshCw, Download, ChevronLeft, ChevronRight, Image } from "lucide-react";

const STATUS_OPTIONS = ["Temuan", "Perlu Tindakan", "Ditugaskan", "Dalam Proses", "Selesai"];
const CATEGORY_OPTIONS = ["Emergency", "Urgent", "Scheduled", "Preventive", "Normal"];
const EKSEKUTOR_OPTIONS = ["HARJAR", "HARGAR", "YANGU", "PDKB"];

const INPUT_CLASS =
  "border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]";

function exportCsv(data: ReturnType<typeof useInspeksiJaringan>["allData"]) {
  const headers = ["Tgl Inspeksi", "ULP", "Penyulang", "Temuan", "Deskripsi", "Lokasi", "Kategori", "Status", "Eksekutor", "Tgl Eksekusi"];
  const rows = data.map((d) => [
    d.tgl_inspeksi ?? "",
    d.ulp ?? "",
    d.penyulang ?? "",
    d.temuan ?? "",
    d.deskripsi ?? "",
    d.lokasi ?? "",
    d.category ?? "",
    d.status,
    d.eksekutor ?? "",
    d.tgl_eksekusi ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inspeksi-jaringan-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  user: CurrentUser;
}

export default function InspeksiJaringanTab({ user }: Props) {
  const {
    data,
    allData,
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
    refresh,
  } = useInspeksiJaringan(user);

  const showUlpFilter = canSeeAllUnits(user.role);

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
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Actions */}
          <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e3552] text-sm text-[#94a3b8] hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} />
            Refresh
          </button>
          <button onClick={() => exportCsv(allData)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0a2a26] text-[#5eead4] text-sm font-medium hover:bg-[#b2dfdb] transition-colors">
            <Download size={14} />
            Export CSV
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
                <th className="text-center px-4 py-3 text-xs text-[#5eead4] font-semibold">Foto</th>
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
                data.map((row, i) => {
                  const catCfg = CATEGORY_CONFIG[row.category as InspeksiCategory];
                  return (
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
                        {catCfg ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${catCfg.bgColor} ${catCfg.color}`}>
                            {catCfg.label}
                          </span>
                        ) : "—"}
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
                        {row.foto_sebelum_url ? (
                          <a href={row.foto_sebelum_url} target="_blank" rel="noreferrer" className="text-[#00897B] hover:text-[#004D40]">
                            <Image size={16} className="mx-auto" />
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })
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
    </div>
  );
}
