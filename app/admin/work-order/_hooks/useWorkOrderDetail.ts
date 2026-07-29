"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { WoBatch, WoItem, WoStatus } from "../_types";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Muat satu batch + semua item-nya, dengan mutasi patch-lokal (tanpa full refetch). */
export function useWorkOrderDetail(batchId: string) {
  const [batch, setBatch] = useState<WoBatch | null>(null);
  const [items, setItems] = useState<WoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: rows }] = await Promise.all([
      supabaseBrowser.from("wo_batch").select("*").eq("id", batchId).single(),
      supabaseBrowser
        .from("wo_item")
        .select("*")
        .eq("batch_id", batchId)
        .order("urutan", { ascending: true }),
    ]);
    setBatch((b as WoBatch) ?? null);
    setItems((rows as WoItem[]) ?? []);
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchItem = useCallback((id: string, patch: Partial<WoItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const persist = useCallback(
    async (id: string, patch: Partial<WoItem>) => {
      await supabaseBrowser
        .from("wo_item")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
    },
    [],
  );

  /** Toggle Belum ↔ Selesai. Selesai → isi tgl_realisasi (jika kosong); Belum → kosongkan. */
  const toggleStatus = useCallback(
    (item: WoItem) => {
      const next: WoStatus = item.status === "Selesai" ? "Belum" : "Selesai";
      const patch: Partial<WoItem> =
        next === "Selesai"
          ? { status: next, tgl_realisasi: item.tgl_realisasi ?? todayISO() }
          : {
              // Admin membatalkan → bersihkan bukti mobile + reset alur persetujuan
              status: next,
              tgl_realisasi: null,
              foto_bukti_url: null,
              catatan_petugas: null,
              selesai_by: null,
              selesai_lat: null,
              selesai_lng: null,
              selesai_alamat: null,
              selesai_geo: null,
              verified_by: null,
              verified_role: null,
              verified_at: null,
              sla_ok: null,
              verified_note: null,
              approved_by: null,
              approved_at: null,
            };
      patchItem(item.id, patch);
      void persist(item.id, patch);
    },
    [patchItem, persist],
  );

  const setRealisasiDate = useCallback(
    (id: string, date: string | null) => {
      patchItem(id, { tgl_realisasi: date });
      void persist(id, { tgl_realisasi: date });
    },
    [patchItem, persist],
  );

  const updateCell = useCallback(
    (item: WoItem, colKey: string, value: string) => {
      const data = { ...item.data, [colKey]: value };
      patchItem(item.id, { data });
      void persist(item.id, { data });
    },
    [patchItem, persist],
  );

  const updateRegu = useCallback(
    (id: string, regu: string | null) => {
      patchItem(id, { regu });
      void persist(id, { regu });
    },
    [patchItem, persist],
  );

  const updateVerifier = useCallback(
    (id: string, verifier_role: string | null) => {
      patchItem(id, { verifier_role });
      void persist(id, { verifier_role });
    },
    [patchItem, persist],
  );

  /** Koordinator/Staff Teknik memverifikasi (+SLA). */
  const verifyItem = useCallback(
    (id: string, p: { by: string; role: string; slaOk: boolean; note: string | null }) => {
      const patch: Partial<WoItem> = {
        verified_by: p.by,
        verified_role: p.role,
        verified_at: new Date().toISOString(),
        sla_ok: p.slaOk,
        verified_note: p.note,
      };
      patchItem(id, patch);
      void persist(id, patch);
    },
    [patchItem, persist],
  );

  /** Batalkan verifikasi (ikut membatalkan approval). */
  const unverifyItem = useCallback(
    (id: string) => {
      const patch: Partial<WoItem> = {
        verified_by: null, verified_role: null, verified_at: null,
        sla_ok: null, verified_note: null, approved_by: null, approved_at: null,
      };
      patchItem(id, patch);
      void persist(id, patch);
    },
    [patchItem, persist],
  );

  /** Supervisor menyetujui akhir. */
  const approveItem = useCallback(
    (id: string, by: string) => {
      const patch: Partial<WoItem> = { approved_by: by, approved_at: new Date().toISOString() };
      patchItem(id, patch);
      void persist(id, patch);
    },
    [patchItem, persist],
  );

  const unapproveItem = useCallback(
    (id: string) => {
      const patch: Partial<WoItem> = { approved_by: null, approved_at: null };
      patchItem(id, patch);
      void persist(id, patch);
    },
    [patchItem, persist],
  );

  const addRow = useCallback(async () => {
    const urutan = items.reduce((m, it) => Math.max(m, it.urutan), -1) + 1;
    const newItem: WoItem = {
      id: crypto.randomUUID(),
      batch_id: batchId,
      data: {},
      regu: null,
      status: "Belum",
      tgl_realisasi: null,
      foto_bukti_url: null,
      catatan_petugas: null,
      selesai_by: null,
      selesai_lat: null,
      selesai_lng: null,
      selesai_alamat: null,
      selesai_geo: null,
      verifier_role: null,
      verified_by: null,
      verified_role: null,
      verified_at: null,
      sla_ok: null,
      verified_note: null,
      approved_by: null,
      approved_at: null,
      sheet_key: null,
      sheet_synced_at: null,
      urutan,
    };
    setItems((prev) => [...prev, newItem]);
    await supabaseBrowser.from("wo_item").insert({
      id: newItem.id,
      batch_id: batchId,
      data: {},
      status: "Belum",
      urutan,
    });
  }, [items, batchId]);

  const deleteRow = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    await supabaseBrowser.from("wo_item").delete().eq("id", id);
  }, []);

  return {
    batch,
    items,
    loading,
    reload: load,
    toggleStatus,
    setRealisasiDate,
    updateCell,
    updateRegu,
    updateVerifier,
    verifyItem,
    unverifyItem,
    approveItem,
    unapproveItem,
    addRow,
    deleteRow,
  };
}
