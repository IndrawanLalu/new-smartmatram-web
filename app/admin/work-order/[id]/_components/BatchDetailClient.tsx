"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Table2, BarChart3, ClipboardList, Send, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { monthLabel } from "../../_constants";
import { useWorkOrderDetail } from "../../_hooks/useWorkOrderDetail";
import BatchTable from "./BatchTable";
import BatchDashboard from "./BatchDashboard";

export default function BatchDetailClient({ batchId }: { batchId: string }) {
  const detail = useWorkOrderDetail(batchId);
  const { batch, items, loading } = detail;
  const [tab, setTab] = useState<"tabel" | "dashboard">("tabel");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function syncSheet() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      const res = await fetch("/api/wo-sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ batchId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Gagal kirim");
      setSyncMsg({ ok: true, text: `Terkirim ke Sheet: ${j.updated} baris` });
      await detail.reload();
    } catch (e) {
      setSyncMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal kirim" });
    } finally {
      setSyncing(false);
    }
  }

  const stats = useMemo(() => {
    const total = items.length;
    const selesai = items.filter((i) => i.status === "Selesai").length;
    return { total, selesai, pct: total ? Math.round((selesai / total) * 100) : 0 };
  }, [items]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="p-6">
        <Link href="/admin/work-order" className="text-[#00897B] text-sm flex items-center gap-1.5">
          <ArrowLeft size={15} /> Kembali
        </Link>
        <p className="mt-6 text-[#5D6D7E]">WO tidak ditemukan.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 space-y-5 text-[#1B2631]">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <Link
          href="/admin/work-order"
          className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm mb-3"
        >
          <ArrowLeft size={15} /> Daftar WO
        </Link>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ClipboardList size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight truncate">{batch.judul || "(tanpa judul)"}</h1>
              <p className="text-white/70 text-sm mt-0.5">
                {monthLabel(batch.bulan)} {batch.tahun} · ULP {batch.ulp}
              </p>
            </div>
          </div>
          <div className="bg-white/10 rounded-lg px-4 py-2 text-center shrink-0">
            <p className="text-2xl font-bold tabular-nums">{stats.selesai}/{stats.total}</p>
            <p className="text-xs text-white/70">selesai · {stats.pct}%</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${stats.pct}%` }}
          />
        </div>

        {batch.sheet_id && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={syncSheet}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/15 hover:bg-white/25 disabled:opacity-50 transition-colors"
            >
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Kirim realisasi ke Sheet
            </button>
            {syncMsg && (
              <span className={`text-xs ${syncMsg.ok ? "text-green-200" : "text-red-200"}`}>{syncMsg.text}</span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
        {([
          { key: "tabel", label: "Tabel WO", icon: Table2 },
          { key: "dashboard", label: "Dashboard Realisasi", icon: BarChart3 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? "bg-[#E0F2F1] text-[#00695C]" : "text-[#5D6D7E] hover:bg-[#F4F6F8]"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "tabel" ? (
        <BatchTable batch={batch} detail={detail} />
      ) : (
        <BatchDashboard batch={batch} items={items} />
      )}
    </div>
  );
}
