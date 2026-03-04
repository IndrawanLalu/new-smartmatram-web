"use client";

import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { useInspeksiPohon } from "../_hooks/useInspeksiPohon";
import InlineStatusSelect from "./InlineStatusSelect";
import InlineTeamSelect from "./InlineTeamSelect";
import UrgencyBadge from "./UrgencyBadge";
import {
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

const STATUS_OPTIONS = [
  "Temuan",
  "Perlu Tindakan",
  "Ditugaskan",
  "Dalam Proses",
  "Selesai",
];
const RISIKO_OPTIONS = ["Rendah", "Sedang", "Tinggi", "Sangat Tinggi"];
const URGENCY_OPTIONS = ["SANGAT URGENT", "URGENT", "PERLU TINDAKAN", "AMAN"];

const INPUT_CLASS =
  "border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]";

function exportCsv(data: ReturnType<typeof useInspeksiPohon>["allData"]) {
  const headers = [
    "Tgl Inspeksi",
    "ULP",
    "Penyulang",
    "Jenis Pohon",
    "Alamat",
    "Inspektor",
    "Risiko",
    "Prediksi",
    "Sisa Hari",
    "Urgensi",
    "Status",
    "Team",
    "Tindakan",
  ];
  const rows = data.map((d) => [
    d.tgl_inspeksi ?? "",
    d.ulp ?? "",
    d.penyulang ?? "",
    d.jenis_pohon ?? "",
    d.lokasi ?? "",
    d.inspektor ?? "",
    d.tinggi_pohon ?? "",
    d.jarak_ke_jaringan ?? "",
    d.tingkat_risiko ?? "",
    d.prediksi_inspektur ?? "",
    d.remainingDays === 999 ? "—" : d.remainingDays,
    d.urgency,
    d.status,
    d.team_name ?? "",
    d.tindakan_rekomendasi ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inspeksi-pohon-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const RISIKO_COLOR: Record<string, string> = {
  Rendah: "bg-green-50 text-green-700",
  Sedang: "bg-yellow-50 text-yellow-700",
  Tinggi: "bg-orange-50 text-orange-700",
  "Sangat Tinggi": "bg-red-50 text-red-700",
};

interface Props {
  user: CurrentUser;
}

export default function InspeksiPohonTab({ user }: Props) {
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
    sanggatUrgentCount,
    ulpOptions,
    penyulangOptions,
    updateStatus,
    updateTeam,
    refresh,
  } = useInspeksiPohon(user);

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
      {/* Warning banner sangat urgent */}
      {sanggatUrgentCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            {sanggatUrgentCount} pohon dalam kondisi{" "}
            <span className="font-bold">SANGAT URGENT</span> — prediksi ≤3 hari,
            segera tindak lanjuti!
          </p>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"
            />
            <input
              type="text"
              placeholder="Cari penyulang, jenis pohon, inspektor..."
              value={filter.search}
              onChange={(e) => {
                setFilter((f) => ({ ...f, search: e.target.value }));
                setPage(1);
              }}
              className={`${INPUT_CLASS} pl-8 w-full`}
            />
          </div>

          <input
            type="date"
            value={filter.startDate}
            onChange={(e) => {
              setFilter((f) => ({ ...f, startDate: e.target.value }));
              setPage(1);
            }}
            className={INPUT_CLASS}
          />
          <input
            type="date"
            value={filter.endDate}
            onChange={(e) => {
              setFilter((f) => ({ ...f, endDate: e.target.value }));
              setPage(1);
            }}
            className={INPUT_CLASS}
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
              className={INPUT_CLASS}
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
            className={INPUT_CLASS}
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
            className={INPUT_CLASS}
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
            className={INPUT_CLASS}
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
            className={INPUT_CLASS}
          >
            <option value="">Semua Urgensi</option>
            {URGENCY_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e3552] text-sm text-[#94a3b8] hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => exportCsv(allData)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0a2a26] text-[#5eead4] text-sm font-medium hover:bg-[#b2dfdb] transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e3552]">
          <p className="text-sm text-[#94a3b8]">
            {loading ? "Memuat..." : `${totalFiltered} data ditemukan`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0a2a26]">
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold whitespace-nowrap">
                  Tgl Inspeksi
                </th>
                {showUlpFilter && (
                  <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">
                    ULP
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">
                  Penyulang
                </th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">
                  Jenis Pohon
                </th>
                <th className="text-center px-4 py-3 text-xs text-[#5eead4] font-semibold">
                  Alamat
                </th>
                <th className="text-center px-4 py-3 text-xs text-[#5eead4] font-semibold">
                  Inspektor
                </th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">
                  Risiko
                </th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">
                  Urgensi
                </th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">
                  Team
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className={i % 2 === 0 ? "bg-[#162334]" : "bg-gray-50/50"}
                  >
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td
                    colSpan={showUlpFilter ? 10 : 9}
                    className="text-center py-12 text-[#94a3b8] text-sm"
                  >
                    Tidak ada data yang sesuai filter
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr
                    key={row.id}
                    className={i % 2 === 0 ? "bg-[#162334]" : "bg-gray-50/30"}
                  >
                    <td className="px-4 py-3 text-[#94a3b8] whitespace-nowrap">
                      {row.tgl_inspeksi ?? "—"}
                    </td>
                    {showUlpFilter && (
                      <td className="px-4 py-3 text-[#94a3b8]">
                        {row.ulp ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-[#e2e8f0]">
                      {row.penyulang ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[#e2e8f0]">
                      <p>{row.jenis_pohon ?? "—"}</p>
                      {row.deskripsi && (
                        <p className="text-xs text-[#94a3b8] truncate max-w-40">
                          {row.deskripsi}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-[#94a3b8]">
                      {row.lokasi != null ? `${row.lokasi} ` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-[#94a3b8]">
                      {row.inspektor != null ? `${row.inspektor} ` : "—"}
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
                      <UrgencyBadge
                        urgency={row.urgency}
                        remainingDays={row.remainingDays}
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
                      <InlineTeamSelect
                        id={row.id}
                        currentTeam={row.team_name}
                        onUpdate={updateTeam}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
