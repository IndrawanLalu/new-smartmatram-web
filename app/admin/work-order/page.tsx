"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, ClipboardList, LayoutGrid, BarChart3 } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { MONTHS } from "./_constants";
import { BTN_ON_NAVY, CARD, DISPLAY, FIELD } from "@/app/admin/_ui";
import { useWorkOrderBatches } from "./_hooks/useWorkOrderBatches";
import BatchCard from "./_components/BatchCard";
import CreateBatchModal from "./_components/CreateBatchModal";
import WorkOrderDashboard from "./_components/WorkOrderDashboard";

const NOW = new Date();
const YEARS = [NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1];
const TAB_BTN =
  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors";

export default function WorkOrderPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <WorkOrderPageContent />
    </Suspense>
  );
}

function WorkOrderPageContent() {
  const user = useCurrentUser();
  const isUP3 = canSeeAllUnits(user.role);
  const router = useRouter();
  const sp = useSearchParams();

  // Filter hidup di URL supaya bisa di-refresh & dibagikan lewat tautan.
  const bulan = Number(sp.get("bulan")) || NOW.getMonth() + 1;
  const tahun = Number(sp.get("tahun")) || NOW.getFullYear();
  const ulpFilter = sp.get("ulp") || null;
  const tab = sp.get("tab") === "dashboard" ? "dashboard" : "list";

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      router.replace(`?${p.toString()}`, { scroll: false });
    },
    [sp, router],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const { batches, loading, createBatch, deleteBatch } = useWorkOrderBatches(
    user,
    bulan,
    tahun,
    ulpFilter,
  );

  return (
    <div className="space-y-4 text-ink">
      <header className="rounded-2xl bg-navy-600 px-6 py-5 text-white shadow-card flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className={`${DISPLAY} text-2xl font-extrabold`}>Manajemen Work Order</h1>
          <p className="text-white/60 text-sm mt-0.5">
            Buat WO bulanan, petugas kerjakan di mobile, realisasi terhitung otomatis
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className={BTN_ON_NAVY}
        >
          <Plus size={16} /> Buat WO
        </button>
      </header>

      {/* Satu baris filter untuk seluruh isi halaman */}
      <div className={`${CARD} p-3 flex flex-wrap items-center gap-2`}>
        <select
          value={bulan}
          onChange={(e) => setParams({ bulan: e.target.value })}
          aria-label="Bulan"
          className={FIELD}
        >
          {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select
          value={tahun}
          onChange={(e) => setParams({ tahun: e.target.value })}
          aria-label="Tahun"
          className={FIELD}
        >
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {isUP3 && (
          <select
            value={ulpFilter ?? ""}
            onChange={(e) => setParams({ ulp: e.target.value || null })}
            aria-label="Unit layanan"
            className={FIELD}
          >
            <option value="">Semua ULP</option>
            {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        )}

        <div className="ml-auto flex gap-1 rounded-xl bg-surface p-1">
          {([
            { key: "list", label: "Daftar WO", icon: LayoutGrid },
            { key: "dashboard", label: "Dashboard", icon: BarChart3 },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setParams({ tab: key === "list" ? null : key })}
              className={`${TAB_BTN} ${
                tab === key ? "bg-white text-navy-600 shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "dashboard" ? (
        <WorkOrderDashboard user={user} bulan={bulan} tahun={tahun} ulpFilter={ulpFilter} />
      ) : loading ? (
        <ListSkeleton />
      ) : batches.length === 0 ? (
        <div className={`${CARD} p-12 text-center`}>
          <ClipboardList size={40} className="mx-auto text-navy-200" />
          <p className="mt-3 font-medium text-ink">Belum ada WO untuk periode ini</p>
          <p className="text-sm text-ink-soft mt-1">
            Tempel tabel dari Excel atau tarik langsung dari Google Sheet.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-navy-600 hover:bg-navy-500 text-white transition-colors"
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

function ListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-40 rounded-2xl bg-line animate-skeleton" />
      ))}
    </div>
  );
}
