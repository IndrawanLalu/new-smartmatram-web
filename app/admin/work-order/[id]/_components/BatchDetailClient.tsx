"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Table2, BarChart3, ClipboardList, Send, Loader2, Settings2, ShieldAlert,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { monthLabel } from "../../_constants";
import { useWorkOrderDetail } from "../../_hooks/useWorkOrderDetail";
import { useWoPermissions } from "../../_hooks/useWoPermissions";
import { BTN_ON_NAVY, CARD, DISPLAY } from "@/app/admin/_ui";
import EditBatchModal from "../../_components/EditBatchModal";
import WoWorkbench from "./WoWorkbench";
import BatchDashboard from "./BatchDashboard";

const TAB_BTN =
  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors";

export default function BatchDetailClient({ batchId }: { batchId: string }) {
  const toast = useToast();
  const detail = useWorkOrderDetail(batchId);
  const { batch, items, loading } = detail;
  const perms = useWoPermissions(batch);

  const [tab, setTab] = useState<"tabel" | "dashboard">("tabel");
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const stats = useMemo(() => {
    const total = items.length;
    const selesai = items.filter((i) => i.status === "Selesai").length;
    return { total, selesai, pct: total ? Math.round((selesai / total) * 100) : 0 };
  }, [items]);

  const syncSheet = useCallback(async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      const res = await fetch("/api/wo-sheet-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ batchId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Gagal kirim");
      if (j.updated > 0) {
        toast.success(
          j.skipped > 0
            ? `Terkirim ke Sheet: ${j.updated} baris · ${j.skipped} tidak ditemukan kuncinya.`
            : `Terkirim ke Sheet: ${j.updated} baris.`,
        );
      } else {
        toast.info("Tidak ada baris yang cocok untuk dikirim ke Sheet.");
      }
      await detail.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal kirim ke Sheet");
    } finally {
      setSyncing(false);
    }
  }, [batchId, detail, toast]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/export/work-order?batchId=${batchId}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Gagal membuat file Excel");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `WO_${(batch?.judul || "work-order").replace(/[^\w\s-]/g, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("File Excel diunduh.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal ekspor");
    } finally {
      setExporting(false);
    }
  }, [batchId, batch?.judul, toast]);

  if (loading) return <DetailSkeleton />;

  if (!batch) {
    return (
      <div className="p-6">
        <Link href="/admin/work-order" className="text-navy-600 text-sm flex items-center gap-1.5">
          <ArrowLeft size={15} /> Kembali
        </Link>
        <p className="mt-6 text-ink-soft">WO tidak ditemukan.</p>
      </div>
    );
  }

  if (!perms.canView) {
    return (
      <div className="">
        <Link href="/admin/work-order" className="text-navy-600 text-sm inline-flex items-center gap-1.5">
          <ArrowLeft size={15} /> Daftar WO
        </Link>
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <ShieldAlert size={36} className="mx-auto text-attention" />
          <p className="mt-3 font-semibold text-ink">WO ini milik ULP {batch.ulp}</p>
          <p className="text-sm text-ink-soft mt-1">
            Anda hanya dapat membuka Work Order pada unit sendiri.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-ink">
      {/* Header */}
      <header className="rounded-2xl bg-navy-600 px-6 py-5 text-white shadow-card">
        <Link
          href="/admin/work-order"
          className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm"
        >
          <ArrowLeft size={15} /> Daftar WO
        </Link>

        <div className="mt-3 flex items-end justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/12 flex items-center justify-center shrink-0">
              <ClipboardList size={22} />
            </div>
            <div className="min-w-0">
              <h1 className={`${DISPLAY} text-2xl font-extrabold leading-tight truncate`}>
                {batch.judul || "(tanpa judul)"}
              </h1>
              <p className="text-white/60 text-sm mt-0.5">
                {monthLabel(batch.bulan)} {batch.tahun} · ULP {batch.ulp}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {perms.canManage && (
              <button onClick={() => setEditOpen(true)} className={BTN_ON_NAVY}>
                <Settings2 size={14} /> Ubah WO
              </button>
            )}
            {batch.sheet_id && (
              <button onClick={syncSheet} disabled={syncing} className={BTN_ON_NAVY}>
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Kirim ke Sheet
              </button>
            )}
          </div>
        </div>

        {/* Meter realisasi + angka utama */}
        <div className="mt-5 flex items-end gap-4">
          <p className={`${DISPLAY} text-4xl font-extrabold leading-none`}>
            {stats.pct}
            <span className="text-xl font-bold text-white/60">%</span>
          </p>
          <div className="flex-1 pb-1">
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${stats.pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-white/60 tabular-nums">
              {stats.selesai} dari {stats.total} baris selesai
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-line bg-white p-1 w-fit">
        {([
          { key: "tabel", label: "Pekerjaan", icon: Table2 },
          { key: "dashboard", label: "Dashboard Realisasi", icon: BarChart3 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`${TAB_BTN} ${
              tab === key ? "bg-navy-50 text-navy-600" : "text-ink-soft hover:bg-surface"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "tabel" ? (
        <WoWorkbench
          batch={batch}
          detail={detail}
          perms={perms}
          onExport={handleExport}
          exporting={exporting}
        />
      ) : (
        <BatchDashboard batch={batch} items={items} />
      )}

      {editOpen && (
        <EditBatchModal
          batch={batch}
          onClose={() => setEditOpen(false)}
          onSave={detail.updateBatch}
        />
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 text-ink">
      <div className="h-40 rounded-2xl bg-line animate-skeleton" />
      <div className="h-10 w-72 rounded-2xl bg-line animate-skeleton" />
      <div className="h-16 rounded-2xl bg-line animate-skeleton" />
      <div className={`${CARD} p-4 space-y-2.5`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-line animate-skeleton" />
        ))}
      </div>
    </div>
  );
}
