"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export interface GangguanDetail {
  id: string;
  ulp: string;
  bulan: number;
  tahun: number;
  titik_gangguan: string;
  tgl_gangguan: string;
  jam_padam: string;
  durasi: string;
  jml_plgn: number;
  jml_x_plgn_padam: number;
  penyebab: string;
  pain_point: string;
  lesson_learned: string;
  tindak_lanjut: string;
  urutan: number;
}

export type GangguanDetailInput = Omit<GangguanDetail, "id" | "created_at">;

export function useGangguanDetail(bulan: number, tahun: number, ulp: string) {
  const [data, setData] = useState<GangguanDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rows, error: err } = await supabaseBrowser
      .from("gangguan_detail")
      .select("*")
      .eq("bulan", bulan)
      .eq("tahun", tahun)
      .eq("ulp", ulp)
      .order("urutan", { ascending: true });

    if (err) { setError(err.message); setLoading(false); return; }
    setData(rows ?? []);
    setLoading(false);
  }, [bulan, tahun, ulp]);

  useEffect(() => { refresh(); }, [refresh]);

  const addItem = async (input: Omit<GangguanDetailInput, "ulp" | "bulan" | "tahun" | "urutan">) => {
    const nextUrutan = data.length > 0 ? Math.max(...data.map((d) => d.urutan)) + 1 : 0;
    const { error: err } = await supabaseBrowser.from("gangguan_detail").insert({
      ...input, ulp, bulan, tahun, urutan: nextUrutan,
    });
    if (!err) refresh();
    return err;
  };

  const bulkAdd = async (items: Omit<GangguanDetailInput, "ulp" | "bulan" | "tahun" | "urutan">[]) => {
    const base = data.length > 0 ? Math.max(...data.map((d) => d.urutan)) + 1 : 0;
    const { error: err } = await supabaseBrowser.from("gangguan_detail").insert(
      items.map((item, i) => ({ ...item, ulp, bulan, tahun, urutan: base + i }))
    );
    if (!err) refresh();
    return err;
  };

  const updateItem = async (id: string, input: Partial<GangguanDetailInput>) => {
    const { error: err } = await supabaseBrowser.from("gangguan_detail").update(input).eq("id", id);
    if (!err) setData((prev) => prev.map((d) => d.id === id ? { ...d, ...input } : d));
    return err;
  };

  const deleteItem = async (id: string) => {
    await supabaseBrowser.from("gangguan_detail").delete().eq("id", id);
    setData((prev) => prev.filter((d) => d.id !== id));
  };

  return { data, loading, error, refresh, addItem, bulkAdd, updateItem, deleteItem };
}
