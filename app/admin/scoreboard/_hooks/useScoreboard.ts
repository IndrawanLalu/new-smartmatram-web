"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RealisasiField = "realisasi_m1" | "realisasi_m2" | "realisasi_m3" | "realisasi_m4";
export type TargetField = "target_m1" | "target_m2" | "target_m3" | "target_m4";

export interface LMItem {
  id: string;
  lead_measure_id: string;
  nama_item: string;
  satuan: string;
  komitmen: string;
  target_m1: number;
  target_m2: number;
  target_m3: number;
  target_m4: number;
  realisasi_m1: number;
  realisasi_m2: number;
  realisasi_m3: number;
  realisasi_m4: number;
  urutan: number;
}

export interface LeadMeasure {
  id: string;
  nama: string;
  pic: string;
  ulp: string;
  bulan: number;
  tahun: number;
  komitmen: string;
  urutan: number;
  items: LMItem[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useScoreboard(bulan: number, tahun: number, ulp: string) {
  const [data, setData] = useState<LeadMeasure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rows, error: err } = await supabaseBrowser
      .from("lead_measures")
      .select("*, items:lead_measure_items(*)")
      .eq("bulan", bulan)
      .eq("tahun", tahun)
      .eq("ulp", ulp)
      .order("urutan", { ascending: true });

    if (err) { setError(err.message); setLoading(false); return; }

    setData(
      (rows ?? []).map((lm) => ({
        ...lm,
        items: ((lm.items ?? []) as LMItem[]).sort((a, b) => a.urutan - b.urutan),
      }))
    );
    setLoading(false);
  }, [bulan, tahun, ulp]);

  useEffect(() => { refresh(); }, [refresh]);

  const addLM = async (nama: string, pic: string, komitmen: string) => {
    const nextUrutan = data.length > 0 ? Math.max(...data.map((d) => d.urutan)) + 1 : 0;
    const { error: err } = await supabaseBrowser
      .from("lead_measures")
      .insert({ nama, pic, komitmen, bulan, tahun, ulp, urutan: nextUrutan });
    if (!err) refresh();
    return err;
  };

  const deleteLM = async (id: string) => {
    await supabaseBrowser.from("lead_measures").delete().eq("id", id);
    setData((prev) => prev.filter((lm) => lm.id !== id));
  };

  const addItem = async (
    lead_measure_id: string,
    nama_item: string,
    satuan: string,
    targets: { m1: number; m2: number; m3: number; m4: number }
  ) => {
    const lm = data.find((l) => l.id === lead_measure_id);
    const nextUrutan = lm && lm.items.length > 0
      ? Math.max(...lm.items.map((i) => i.urutan)) + 1 : 0;
    const { error: err } = await supabaseBrowser.from("lead_measure_items").insert({
      lead_measure_id, nama_item, satuan, komitmen: "",
      target_m1: targets.m1, target_m2: targets.m2,
      target_m3: targets.m3, target_m4: targets.m4,
      realisasi_m1: 0, realisasi_m2: 0, realisasi_m3: 0, realisasi_m4: 0,
      urutan: nextUrutan,
    });
    if (!err) refresh();
    return err;
  };

  const deleteItem = async (id: string) => {
    await supabaseBrowser.from("lead_measure_items").delete().eq("id", id);
    setData((prev) => prev.map((lm) => ({
      ...lm,
      items: lm.items.filter((item) => item.id !== id),
    })));
  };

  const updateRealisasi = async (id: string, field: RealisasiField, value: number) => {
    await supabaseBrowser.from("lead_measure_items").update({ [field]: value }).eq("id", id);
    setData((prev) => prev.map((lm) => ({
      ...lm,
      items: lm.items.map((item) => item.id === id ? { ...item, [field]: value } : item),
    })));
  };

  const updateKomitmen = async (id: string, komitmen: string) => {
    await supabaseBrowser.from("lead_measures").update({ komitmen }).eq("id", id);
    setData((prev) => prev.map((lm) => lm.id === id ? { ...lm, komitmen } : lm));
  };

  const updateLM = async (id: string, nama: string, pic: string, komitmen: string) => {
    await supabaseBrowser.from("lead_measures").update({ nama, pic, komitmen }).eq("id", id);
    setData((prev) => prev.map((lm) => lm.id === id ? { ...lm, nama, pic, komitmen } : lm));
  };

  const updateItemMeta = async (id: string, nama_item: string, satuan: string) => {
    await supabaseBrowser.from("lead_measure_items").update({ nama_item, satuan }).eq("id", id);
    setData((prev) => prev.map((lm) => ({
      ...lm,
      items: lm.items.map((item) => item.id === id ? { ...item, nama_item, satuan } : item),
    })));
  };

  const updateItemKomitmen = async (id: string, komitmen: string) => {
    await supabaseBrowser.from("lead_measure_items").update({ komitmen }).eq("id", id);
    setData((prev) => prev.map((lm) => ({
      ...lm,
      items: lm.items.map((item) => item.id === id ? { ...item, komitmen } : item),
    })));
  };

  const updateTarget = async (id: string, field: TargetField, value: number) => {
    await supabaseBrowser.from("lead_measure_items").update({ [field]: value }).eq("id", id);
    setData((prev) => prev.map((lm) => ({
      ...lm,
      items: lm.items.map((item) => item.id === id ? { ...item, [field]: value } : item),
    })));
  };

  const duplicateToMonth = async (targetBulan: number, targetTahun: number): Promise<string | null> => {
    if (data.length === 0) return "Tidak ada LM untuk disalin.";
    for (const lm of data) {
      const { data: newLM, error: lmErr } = await supabaseBrowser
        .from("lead_measures")
        .insert({ nama: lm.nama, pic: lm.pic, ulp: lm.ulp, bulan: targetBulan, tahun: targetTahun, komitmen: "", urutan: lm.urutan })
        .select("id")
        .single();
      if (lmErr) return lmErr.message;
      if (newLM && lm.items.length > 0) {
        const { error: itemErr } = await supabaseBrowser.from("lead_measure_items").insert(
          lm.items.map((item) => ({
            lead_measure_id: newLM.id,
            nama_item: item.nama_item,
            satuan: item.satuan,
            komitmen: item.komitmen ?? "",
            target_m1: item.target_m1, target_m2: item.target_m2,
            target_m3: item.target_m3, target_m4: item.target_m4,
            realisasi_m1: 0, realisasi_m2: 0, realisasi_m3: 0, realisasi_m4: 0,
            urutan: item.urutan,
          }))
        );
        if (itemErr) return itemErr.message;
      }
    }
    return null;
  };

  return { data, loading, error, refresh, addLM, deleteLM, addItem, deleteItem, updateRealisasi, updateKomitmen, updateLM, updateItemMeta, updateItemKomitmen, updateTarget, duplicateToMonth };
}
