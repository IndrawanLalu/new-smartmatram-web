"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import {
  keSurvey, keTitik, pesanSurvey,
  type BarisMaterialSurvey, type SurveyJaringan, type TiangSambung, type TitikSurvey,
} from "@/lib/surveyJaringan";

/**
 * Daftar Survey Jaringan Baru satu ULP ("" = semua, UP3). Semua penulisan
 * lewat fungsi SQL (hak ULP diperiksa di sana); sesudahnya satu baris dibaca
 * ulang dan ditambal.
 */

export function useSurveyJaringan(ulp: string) {
  const [survey, setSurvey] = useState<SurveyJaringan[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const rows = await fetchAllRows<Record<string, unknown>>(() => {
        const q = supabaseBrowser.from("survey_jaringan_daftar").select("*").order("diubah_at", { ascending: false });
        return ulp ? q.eq("ulp", ulp) : q;
      });
      setSurvey(rows.map(keSurvey));
    } catch (e) {
      setGalat(pesanSurvey(e));
      setSurvey([]);
    } finally {
      setMemuat(false);
    }
  }, [ulp]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const tambal = async (id: string) => {
    const { data, error } = await supabaseBrowser.from("survey_jaringan_daftar").select("*").eq("id", id).single();
    if (error) throw error;
    const baru = keSurvey(data);
    setSurvey((xs) => xs.map((x) => (x.id === id ? baru : x)));
  };

  const rpc = async (fn: string, arg: Record<string, unknown>, id: string) => {
    const { error } = await supabaseBrowser.rpc(fn, arg);
    if (error) throw new Error(pesanSurvey(error));
    await tambal(id);
  };

  return {
    survey, memuat, galat, muatUlang: muat,
    setujui: (id: string, oleh: string) => rpc("setujui_survey_jaringan", { p_id: id, p_nama: oleh }, id),
    buka: (id: string, oleh: string) => rpc("buka_survey_jaringan", { p_id: id, p_nama: oleh }, id),
    batalkan: (id: string, alasan: string, oleh: string) => rpc("batalkan_survey_jaringan", { p_id: id, p_alasan: alasan, p_nama: oleh }, id),
    ubahMaterial: (id: string, material: BarisMaterialSurvey[], catatan: string, oleh: string) =>
      rpc("ubah_material_survey", { p_id: id, p_material: material, p_catatan: catatan, p_nama: oleh }, id),
  };
}

export type SurveyJaringanState = ReturnType<typeof useSurveyJaringan>;

/** Gambar satu survey: titik + tiang sambungnya. */
export async function bacaGambarSurvey(id: string): Promise<{ titik: TitikSurvey[]; sambung: Map<string, TiangSambung> }> {
  const { data, error } = await supabaseBrowser.from("survey_titik").select("*").eq("survey_id", id).order("urutan");
  if (error) throw new Error(pesanSurvey(error));
  const titik = (data ?? []).map(keTitik);
  const ids = [...new Set(titik.map((t) => t.induk_tiang_id).filter((x): x is string => !!x))];
  const sambung = new Map<string, TiangSambung>();
  if (ids.length) {
    const { data: tg, error: e2 } = await supabaseBrowser.from("tiang").select("id,kode,penyulang,lat,lng").in("id", ids);
    if (e2) throw e2;
    for (const x of tg ?? []) sambung.set(x.id, { ...x, lat: Number(x.lat), lng: Number(x.lng) } as TiangSambung);
  }
  return { titik, sambung };
}

/** Label penanda JTM (jtm_ref) — untuk material & gambar. */
export async function bacaLabelPenanda(): Promise<Map<string, string>> {
  const { data } = await supabaseBrowser.from("jtm_ref").select("kode,label").eq("kategori", "penanda");
  return new Map((data ?? []).map((x) => [x.kode as string, x.label as string]));
}
