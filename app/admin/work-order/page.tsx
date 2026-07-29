"use client";

import { useMemo, useState } from "react";
import { Plus, ClipboardList } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { MONTHS } from "./_constants";
import { useWorkOrderBatches } from "./_hooks/useWorkOrderBatches";
import BatchCard from "./_components/BatchCard";
import CreateBatchModal from "./_components/CreateBatchModal";
import WorkOrderDashboard from "./_components/WorkOrderDashboard";

const NOW = new Date();

export default function WorkOrderPage() {
  const user = useCurrentUser();
  const isUP3 = canSeeAllUnits(user.role);

  const [bulan, setBulan] = useState(NOW.getMonth() + 1);
  const [tahun, setTahun] = useState(NOW.getFullYear());
  const [ulpFilter, setUlpFilter] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<"list" | "dashboard">("list");

  const { batches, loading, createBatch, deleteBatch } = useWorkOrderBatches(
    user,
    bulan,
    tahun,
    ulpFilter,
  );

  const years = useMemo(() => {
    const y = NOW.getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 space-y-5 text-[#1B2631]">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Work Order</h1>
          <p className="text-white/70 text-sm mt-0.5">
            Buat WO bulanan (paste dari Excel), petugas kerjakan di mobile, realisasi otomatis
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white/15 hover:bg-white/25 transition-colors"
        >
          <Plus size={16} /> Buat WO
        </button>
      </div>

      {/* Filter periode */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 flex flex-wrap items-center gap-3">
        <select
          value={bulan}
          onChange={(e) => setBulan(Number(e.target.value))}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
        >
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={tahun}
          onChange={(e) => setTahun(Number(e.target.value))}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {isUP3 && (
          <select
            value={ulpFilter ?? ""}
            onChange={(e) => setUlpFilter(e.target.value || null)}
            className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
          >
            <option value="">Semua ULP</option>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        )}
        <span className="ml-auto text-sm text-[#5D6D7E]">{batches.length} WO</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
        {([["list", "Daftar WO"], ["dashboard", "Dashboard"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? "bg-[#E0F2F1] text-[#00695C]" : "text-[#5D6D7E] hover:bg-[#F4F6F8]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Konten */}
      {tab === "dashboard" ? (
        <WorkOrderDashboard user={user} bulan={bulan} tahun={tahun} ulpFilter={ulpFilter} />
      ) : loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-12 text-center">
          <ClipboardList size={40} className="mx-auto text-[#B2DFDB]" />
          <p className="mt-3 text-[#5D6D7E]">Belum ada WO untuk periode ini.</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-linear-to-r from-[#004D40] to-[#00897B] text-white"
          >
            <Plus size={16} /> Buat WO Pertama
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((b) => (
            <BatchCard key={b.id} batch={b} showUlp={isUP3} onDelete={deleteBatch} />
          ))}
        </div>
      )}

      {createOpen && (
        <CreateBatchModal
          user={user}
          defaultBulan={bulan}
          defaultTahun={tahun}
          onClose={() => setCreateOpen(false)}
          onCreate={createBatch}
        />
      )}
    </div>
  );
}
