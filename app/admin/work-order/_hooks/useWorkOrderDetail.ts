"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useToast } from "@/app/admin/_components/Toast";
import type { UpdateBatchInput, WoBatch, WoItem, WoStatus } from "../_types";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Batas aman panjang URL PostgREST untuk filter `.in(...)`. */
const ID_CHUNK = 200;

/** Nilai lama dari field yang akan diubah — untuk rollback bila DB menolak. */
function snapshot(item: WoItem, patch: Partial<WoItem>): Partial<WoItem> {
  const prev: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) prev[k] = (item as unknown as Record<string, unknown>)[k];
  return prev as Partial<WoItem>;
}

/** Field yang dibersihkan saat status dikembalikan ke "Belum". */
const RESET_ON_BELUM: Partial<WoItem> = {
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

/**
 * Muat satu batch + semua item-nya (paginasi penuh), dengan mutasi patch-lokal.
 * Setiap mutasi dikembalikan (rollback) + toast bila DB menolak — UI tidak pernah
 * menampilkan sukses palsu.
 */
export function useWorkOrderDetail(batchId: string) {
  const toast = useToast();
  const [batch, setBatch] = useState<WoBatch | null>(null);
  const [items, setItems] = useState<WoItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Cermin state terbaru — dipakai untuk snapshot rollback tanpa masuk dependency.
  const itemsRef = useRef<WoItem[]>([]);
  itemsRef.current = items;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: b, error: bErr }, rows] = await Promise.all([
        supabaseBrowser.from("wo_batch").select("*").eq("id", batchId).single(),
        fetchAllRows<WoItem>(() =>
          supabaseBrowser
            .from("wo_item")
            .select("*")
            .eq("batch_id", batchId)
            .order("urutan", { ascending: true })
            .order("id", { ascending: true }),
        ),
      ]);
      if (bErr) throw new Error(bErr.message);
      setBatch((b as WoBatch) ?? null);
      setItems(rows);
    } catch (e) {
      toast.error(`Gagal memuat WO: ${e instanceof Error ? e.message : e}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [batchId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchItem = useCallback((id: string, patch: Partial<WoItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  /** Patch lokal + simpan. Gagal → kembalikan nilai lama + toast. */
  const mutate = useCallback(
    async (id: string, patch: Partial<WoItem>, label: string): Promise<boolean> => {
      const current = itemsRef.current.find((it) => it.id === id);
      if (!current) return false;
      const prev = snapshot(current, patch);
      patchItem(id, patch);

      const { error } = await supabaseBrowser
        .from("wo_item")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        patchItem(id, prev);
        toast.error(`${label} gagal disimpan: ${error.message}`);
        return false;
      }
      return true;
    },
    [patchItem, toast],
  );

  /** Patch banyak baris sekaligus (aksi massal). `notify=false` untuk menahan toast. */
  const bulkMutate = useCallback(
    async (ids: string[], patch: Partial<WoItem>, label: string, notify = true): Promise<boolean> => {
      if (ids.length === 0) return false;
      const idSet = new Set(ids);
      const prevById = new Map<string, Partial<WoItem>>();
      for (const it of itemsRef.current) {
        if (idSet.has(it.id)) prevById.set(it.id, snapshot(it, patch));
      }

      setItems((prev) => prev.map((it) => (idSet.has(it.id) ? { ...it, ...patch } : it)));

      const stamped = { ...patch, updated_at: new Date().toISOString() };
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const part = ids.slice(i, i + ID_CHUNK);
        const { error } = await supabaseBrowser.from("wo_item").update(stamped).in("id", part);
        if (error) {
          setItems((prev) =>
            prev.map((it) => (prevById.has(it.id) ? { ...it, ...prevById.get(it.id)! } : it)),
          );
          toast.error(`${label} gagal: ${error.message}`);
          return false;
        }
      }
      if (notify) toast.success(`${label}: ${ids.length} baris.`);
      return true;
    },
    [toast],
  );

  /** Toggle Belum ↔ Selesai. Kembali ke Belum → bersihkan bukti & alur persetujuan. */
  const toggleStatus = useCallback(
    (item: WoItem) => {
      const next: WoStatus = item.status === "Selesai" ? "Belum" : "Selesai";
      const patch: Partial<WoItem> =
        next === "Selesai"
          ? { status: next, tgl_realisasi: item.tgl_realisasi ?? todayISO() }
          : { status: next, ...RESET_ON_BELUM };
      void mutate(item.id, patch, "Perubahan status");
    },
    [mutate],
  );

  const setRealisasiDate = useCallback(
    (id: string, date: string | null) => void mutate(id, { tgl_realisasi: date }, "Tanggal realisasi"),
    [mutate],
  );

  const updateCell = useCallback(
    (item: WoItem, colKey: string, value: string) =>
      void mutate(item.id, { data: { ...item.data, [colKey]: value } }, "Perubahan sel"),
    [mutate],
  );

  const updateRegu = useCallback(
    (id: string, regu: string | null) => void mutate(id, { regu }, "Penetapan regu"),
    [mutate],
  );

  const updateVerifier = useCallback(
    (id: string, verifier_role: string | null) =>
      void mutate(id, { verifier_role }, "Penetapan verifikator"),
    [mutate],
  );

  /** Koordinator/Staff Teknik memverifikasi (+SLA). */
  const verifyItem = useCallback(
    (id: string, p: { by: string; role: string; slaOk: boolean; note: string | null }) =>
      void mutate(
        id,
        {
          verified_by: p.by,
          verified_role: p.role,
          verified_at: new Date().toISOString(),
          sla_ok: p.slaOk,
          verified_note: p.note,
        },
        "Verifikasi",
      ),
    [mutate],
  );

  /** Batalkan verifikasi (ikut membatalkan approval). */
  const unverifyItem = useCallback(
    (id: string) =>
      void mutate(
        id,
        {
          verified_by: null, verified_role: null, verified_at: null,
          sla_ok: null, verified_note: null, approved_by: null, approved_at: null,
        },
        "Pembatalan verifikasi",
      ),
    [mutate],
  );

  /** Supervisor menyetujui akhir. */
  const approveItem = useCallback(
    (id: string, by: string) =>
      void mutate(id, { approved_by: by, approved_at: new Date().toISOString() }, "Persetujuan"),
    [mutate],
  );

  const unapproveItem = useCallback(
    (id: string) =>
      void mutate(id, { approved_by: null, approved_at: null }, "Pembatalan persetujuan"),
    [mutate],
  );

  // ── Aksi massal ────────────────────────────────────────────────────────────

  const bulkSetRegu = useCallback(
    (ids: string[], regu: string | null) => bulkMutate(ids, { regu }, "Regu ditetapkan"),
    [bulkMutate],
  );

  const bulkSetVerifier = useCallback(
    (ids: string[], verifier_role: string | null) =>
      bulkMutate(ids, { verifier_role }, "Verifikator ditetapkan"),
    [bulkMutate],
  );

  const bulkVerify = useCallback(
    (ids: string[], p: { by: string; role: string; slaOk: boolean }) =>
      bulkMutate(
        ids,
        {
          verified_by: p.by,
          verified_role: p.role,
          verified_at: new Date().toISOString(),
          sla_ok: p.slaOk,
        },
        "Terverifikasi",
      ),
    [bulkMutate],
  );

  /**
   * Tandai selesai massal. Tanggal realisasi yang sudah terisi tidak ditimpa —
   * yang kosong diisi hari ini, jadi perlu dua update terpisah.
   */
  const bulkMarkDone = useCallback(
    async (ids: string[]): Promise<boolean> => {
      const idSet = new Set(ids);
      const targets = itemsRef.current.filter((it) => idSet.has(it.id) && it.status !== "Selesai");
      if (targets.length === 0) return false;

      const keepDate = targets.filter((it) => it.tgl_realisasi).map((it) => it.id);
      const fillDate = targets.filter((it) => !it.tgl_realisasi).map((it) => it.id);

      const ok =
        (keepDate.length === 0 ||
          (await bulkMutate(keepDate, { status: "Selesai" }, "Ditandai selesai", false))) &&
        (fillDate.length === 0 ||
          (await bulkMutate(
            fillDate,
            { status: "Selesai", tgl_realisasi: todayISO() },
            "Ditandai selesai",
            false,
          )));

      if (ok) toast.success(`Ditandai selesai: ${targets.length} baris.`);
      return ok;
    },
    [bulkMutate, toast],
  );

  const bulkApprove = useCallback(
    (ids: string[], by: string) =>
      bulkMutate(ids, { approved_by: by, approved_at: new Date().toISOString() }, "Disetujui"),
    [bulkMutate],
  );

  const bulkDelete = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (ids.length === 0) return false;
      const idSet = new Set(ids);
      const removed = itemsRef.current.filter((it) => idSet.has(it.id));
      setItems((prev) => prev.filter((it) => !idSet.has(it.id)));

      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const { error } = await supabaseBrowser
          .from("wo_item")
          .delete()
          .in("id", ids.slice(i, i + ID_CHUNK));
        if (error) {
          setItems((prev) =>
            [...prev, ...removed].sort((a, b) => a.urutan - b.urutan || a.id.localeCompare(b.id)),
          );
          toast.error(`Gagal menghapus: ${error.message}`);
          return false;
        }
      }
      toast.success(`${ids.length} baris dihapus.`);
      return true;
    },
    [toast],
  );

  const addRow = useCallback(async () => {
    const urutan = itemsRef.current.reduce((m, it) => Math.max(m, it.urutan), -1) + 1;
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

    const { error } = await supabaseBrowser.from("wo_item").insert({
      id: newItem.id,
      batch_id: batchId,
      data: {},
      status: "Belum",
      urutan,
    });
    if (error) {
      setItems((prev) => prev.filter((it) => it.id !== newItem.id));
      toast.error(`Gagal menambah baris: ${error.message}`);
    }
  }, [batchId, toast]);

  const deleteRow = useCallback((id: string) => void bulkDelete([id]), [bulkDelete]);

  /** Ubah header WO (judul, periode, definisi & pemetaan kolom). */
  const updateBatch = useCallback(
    async (input: UpdateBatchInput): Promise<boolean> => {
      const prev = batch;
      if (!prev) return false;

      setBatch({
        ...prev,
        judul: input.judul,
        bulan: input.bulan,
        tahun: input.tahun,
        columns: input.columns,
        regu_column: input.reguColumn,
        verifier_column: input.verifierColumn,
        title_column: input.titleColumn,
        measure_column: input.measureColumn,
        measure_unit: input.measureUnit,
      });

      const { error } = await supabaseBrowser
        .from("wo_batch")
        .update({
          judul: input.judul,
          bulan: input.bulan,
          tahun: input.tahun,
          columns: input.columns,
          regu_column: input.reguColumn,
          verifier_column: input.verifierColumn,
          title_column: input.titleColumn,
          measure_column: input.measureColumn,
          measure_unit: input.measureUnit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", batchId);

      if (error) {
        setBatch(prev);
        toast.error(`Gagal menyimpan perubahan WO: ${error.message}`);
        return false;
      }
      toast.success("Pengaturan WO diperbarui.");
      return true;
    },
    [batch, batchId, toast],
  );

  return {
    batch,
    items,
    loading,
    reload: load,
    updateBatch,
    toggleStatus,
    setRealisasiDate,
    updateCell,
    updateRegu,
    updateVerifier,
    verifyItem,
    unverifyItem,
    approveItem,
    unapproveItem,
    bulkSetRegu,
    bulkSetVerifier,
    bulkVerify,
    bulkApprove,
    bulkMarkDone,
    bulkDelete,
    addRow,
    deleteRow,
  };
}
