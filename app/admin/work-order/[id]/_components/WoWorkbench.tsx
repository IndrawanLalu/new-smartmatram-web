"use client";

import { useCallback, useMemo, useState } from "react";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useToast } from "@/app/admin/_components/Toast";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { woStage, type WoBatch, type WoStage } from "../../_types";
import type { useWorkOrderDetail } from "../../_hooks/useWorkOrderDetail";
import type { WoPermissions } from "../../_hooks/useWoPermissions";
import WoToolbar, { type Density, type ViewMode } from "./WoToolbar";
import WoBulkBar from "./WoBulkBar";
import BatchTable from "./BatchTable";
import WoKanban from "./WoKanban";
import ApprovalDrawer from "./ApprovalDrawer";

type Detail = ReturnType<typeof useWorkOrderDetail>;

interface ConfirmState {
  title: string;
  message: React.ReactNode;
  tone?: "danger" | "primary";
  confirmLabel?: string;
  onConfirm: () => void;
}

/**
 * Ruang kerja satu WO: satu baris filter yang menyetir dua tampilan
 * (Tabel & Kanban), seleksi + aksi massal, dan drawer tinjau.
 */
export default function WoWorkbench({
  batch,
  detail,
  perms,
  onExport,
  exporting,
}: {
  batch: WoBatch;
  detail: Detail;
  perms: WoPermissions;
  onExport: () => void;
  exporting: boolean;
}) {
  const {
    items, toggleStatus, setRealisasiDate, updateCell, updateRegu, updateVerifier,
    verifyItem, unverifyItem, approveItem, unapproveItem,
    bulkSetRegu, bulkSetVerifier, bulkVerify, bulkApprove, bulkMarkDone, bulkDelete,
    addRow, deleteRow,
  } = detail;

  const { eksekutorRoles, verifierRoles } = useRoles();
  const user = useCurrentUser();
  const toast = useToast();
  const { canManage, canVerify, canApprove } = perms;

  const visibleCols = useMemo(() => batch.columns.filter((c) => !c.hidden), [batch.columns]);

  const [view, setView] = useState<ViewMode>("tabel");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<WoStage | null>(null);
  const [regu, setRegu] = useState<string | null>(null);
  const [myQueue, setMyQueue] = useState(false);
  const [density, setDensity] = useState<Density>("compact");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [confirmDlg, setConfirmDlg] = useState<ConfirmState | null>(null);

  const reguOptions = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.regu) s.add(it.regu);
    return [...s].sort();
  }, [items]);

  const isMyQueueItem = useCallback(
    (it: (typeof items)[number]) =>
      woStage(it) === "Dikerjakan" && (!it.verifier_role || it.verifier_role === user.role),
    [user.role],
  );

  const myQueueCount = useMemo(
    () => items.filter(isMyQueueItem).length,
    [items, isMyQueueItem],
  );

  /** Semua filter kecuali tahap — supaya hitungan chip tahap tetap informatif. */
  const preStage = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (regu && (it.regu ?? "") !== regu) return false;
      if (myQueue && !isMyQueueItem(it)) return false;
      if (!q) return true;
      return (
        visibleCols.some((c) => (it.data[c.key] ?? "").toLowerCase().includes(q)) ||
        (it.regu ?? "").toLowerCase().includes(q) ||
        (it.verifier_role ?? "").toLowerCase().includes(q) ||
        (it.selesai_by ?? "").toLowerCase().includes(q) ||
        (it.verified_by ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, regu, myQueue, isMyQueueItem, visibleCols]);

  const stageCounts = useMemo(() => {
    const c = { Belum: 0, Dikerjakan: 0, Diverifikasi: 0, Disetujui: 0 } as Record<WoStage, number>;
    for (const it of preStage) c[woStage(it)] += 1;
    return c;
  }, [preStage]);

  // Kanban selalu menampilkan keempat kolom; filter tahap hanya berlaku di tabel.
  const filtered = useMemo(
    () => (stage && view === "tabel" ? preStage.filter((it) => woStage(it) === stage) : preStage),
    [preStage, stage, view],
  );

  /** Aksi massal hanya menyentuh baris yang sedang terlihat oleh filter. */
  const selectedIds = useMemo(
    () => filtered.filter((it) => selected.has(it.id)).map((it) => it.id),
    [filtered, selected],
  );

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const runBulk = useCallback(
    (fn: (ids: string[]) => void | Promise<unknown>) => {
      if (selectedIds.length === 0) return;
      void Promise.resolve(fn(selectedIds)).then(clearSelection);
    },
    [selectedIds, clearSelection],
  );

  const handleBulkMarkDone = useCallback(() => {
    const targets = filtered.filter((it) => selected.has(it.id) && it.status !== "Selesai");
    if (targets.length === 0) {
      toast.info("Semua baris terpilih sudah berstatus Selesai.");
      return;
    }
    setConfirmDlg({
      title: `Tandai ${targets.length} baris selesai?`,
      message: "Tanggal realisasi yang masih kosong akan diisi tanggal hari ini.",
      confirmLabel: "Tandai Selesai",
      onConfirm: () => runBulk((ids) => bulkMarkDone(ids)),
    });
  }, [filtered, selected, toast, runBulk, bulkMarkDone]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.length === 0) return;
    setConfirmDlg({
      title: `Hapus ${selectedIds.length} baris?`,
      message: "Baris beserta bukti dan riwayat verifikasinya akan dihapus permanen.",
      tone: "danger",
      confirmLabel: "Hapus",
      onConfirm: () => runBulk((ids) => bulkDelete(ids)),
    });
  }, [selectedIds, runBulk, bulkDelete]);

  const reviewIndex = reviewId ? filtered.findIndex((it) => it.id === reviewId) : -1;
  const reviewItem = reviewIndex >= 0 ? filtered[reviewIndex] : null;

  const gotoReview = useCallback(
    (delta: number) => {
      if (reviewIndex < 0) return;
      const next = filtered[reviewIndex + delta];
      if (next) setReviewId(next.id);
    },
    [reviewIndex, filtered],
  );

  /** Ubah filter → kembali ke keadaan bersih. */
  const withReset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); clearSelection(); };

  return (
    <div className="space-y-3">
      <WoToolbar
        view={view}
        onView={setView}
        search={search}
        onSearch={withReset(setSearch)}
        stage={stage}
        onStage={withReset(setStage)}
        stageCounts={stageCounts}
        stageFilterActive={view === "tabel"}
        regu={regu}
        onRegu={withReset(setRegu)}
        reguOptions={reguOptions}
        myQueue={myQueue}
        onMyQueue={withReset(setMyQueue)}
        myQueueCount={myQueueCount}
        showMyQueue={canVerify}
        density={density}
        onDensity={setDensity}
        shown={filtered.length}
        total={items.length}
        canManage={canManage}
        onAddRow={addRow}
        onExport={onExport}
        exporting={exporting}
      />

      {view === "tabel" ? (
        <BatchTable
          batch={batch}
          rows={filtered}
          itemsTotal={items.length}
          visibleCols={visibleCols}
          canManage={canManage}
          eksekutorRoles={eksekutorRoles}
          verifierRoles={verifierRoles}
          density={density}
          selected={selected}
          onSelect={toggleSelect}
          onSelectMany={selectMany}
          onUpdateCell={updateCell}
          onUpdateRegu={updateRegu}
          onUpdateVerifier={updateVerifier}
          onSetRealisasi={setRealisasiDate}
          onOpen={setReviewId}
          onDeleteRow={(it) =>
            setConfirmDlg({
              title: "Hapus baris?",
              message: "Baris ini akan dihapus permanen.",
              tone: "danger",
              confirmLabel: "Hapus",
              onConfirm: () => deleteRow(it.id),
            })
          }
        />
      ) : (
        <WoKanban batch={batch} items={filtered} onOpen={setReviewId} />
      )}

      {selectedIds.length > 0 && (
        <WoBulkBar
          count={selectedIds.length}
          canManage={canManage}
          canVerify={canVerify}
          canApprove={canApprove}
          eksekutorRoles={eksekutorRoles}
          verifierRoles={verifierRoles}
          onSetRegu={(r) => runBulk((ids) => bulkSetRegu(ids, r))}
          onSetVerifier={(r) => runBulk((ids) => bulkSetVerifier(ids, r))}
          onMarkDone={handleBulkMarkDone}
          onVerify={(slaOk) => runBulk((ids) => bulkVerify(ids, { by: user.name, role: user.role, slaOk }))}
          onApprove={() => runBulk((ids) => bulkApprove(ids, user.name))}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      )}

      {reviewItem && (
        <ApprovalDrawer
          key={reviewItem.id}
          item={reviewItem}
          batch={batch}
          currentUserName={user.name}
          currentUserRole={user.role}
          canManage={canManage}
          canVerify={canVerify}
          canApprove={canApprove}
          position={{ index: reviewIndex, total: filtered.length }}
          onPrev={() => gotoReview(-1)}
          onNext={() => gotoReview(1)}
          onToggleStatus={toggleStatus}
          onVerify={verifyItem}
          onUnverify={unverifyItem}
          onApprove={approveItem}
          onUnapprove={unapproveItem}
          onClose={() => setReviewId(null)}
        />
      )}

      {confirmDlg && (
        <ConfirmDialog
          title={confirmDlg.title}
          message={confirmDlg.message}
          tone={confirmDlg.tone}
          confirmLabel={confirmDlg.confirmLabel}
          onConfirm={confirmDlg.onConfirm}
          onClose={() => setConfirmDlg(null)}
        />
      )}
    </div>
  );
}
