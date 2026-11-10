"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Katalog isian Inspeksi Gardu Tier 1 (scripts/inspeksi-gardu-isian.sql):
 * item per bagian + pilihannya + sakelar perbarui master. Dibaca Pengaturan
 * dan rincian inspeksi.
 */

export type TipeIsian = "pilihan" | "angka" | "tahanan";
export type Prioritas = "Urgent" | "Rawan" | "Biasa";

export interface OpsiIsian {
  kode: string;
  label: string;
  normal: boolean;
  prioritas: Prioritas;
  urutan: number;
  aktif: boolean;
}

export interface ItemIsian {
  kode: string;
  bagian: string;
  nama: string;
  tipe: TipeIsian;
  satuan: string | null;
  rincian: string[];
  perJurusan: boolean;
  foto: boolean;
  wajib: boolean;
  itemTl: string | null;
  kolomMaster: string | null;
  urutan: number;
  aktif: boolean;
  opsi: OpsiIsian[];
}

export interface JawabanIsian {
  item: string;
  rincian: string;
  nilai: string | null;
  angka: number | null;
  foto: string | null;
  catatan: string | null;
}

export const ITEM_KOSONG: ItemIsian = {
  kode: "", bagian: "", nama: "", tipe: "pilihan", satuan: null, rincian: [], perJurusan: false, foto: false,
  wajib: true, itemTl: null, kolomMaster: null, urutan: 100, aktif: true, opsi: [],
};

const petaItem = (r: Record<string, unknown>, opsi: Record<string, unknown>[]): ItemIsian => ({
  kode: r.kode as string,
  bagian: r.bagian as string,
  nama: r.nama as string,
  tipe: (r.tipe as TipeIsian) ?? "pilihan",
  satuan: (r.satuan as string | null) ?? null,
  rincian: (r.rincian as string[] | null) ?? [],
  perJurusan: !!r.per_jurusan,
  foto: !!r.foto,
  wajib: !!r.wajib,
  itemTl: (r.item_tl as string | null) ?? null,
  kolomMaster: (r.kolom_master as string | null) ?? null,
  urutan: Number(r.urutan ?? 100),
  aktif: !!r.aktif,
  opsi: opsi
    .filter((o) => o.item_kode === r.kode)
    .map((o) => ({
      kode: o.kode as string,
      label: o.label as string,
      normal: !!o.normal,
      prioritas: (o.prioritas as Prioritas) ?? "Biasa",
      urutan: Number(o.urutan ?? 100),
      aktif: !!o.aktif,
    }))
    .sort((a, b) => a.urutan - b.urutan),
});

export function useIsianIgardu() {
  const [item, setItem] = useState<ItemIsian[]>([]);
  const [perbaruiMaster, setPerbaruiMaster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void Promise.all([
      supabaseBrowser.from("igardu_isian_ref").select("*").order("urutan").order("kode"),
      supabaseBrowser.from("igardu_isian_opsi").select("*").order("urutan"),
      supabaseBrowser.from("igardu_pengaturan").select("perbarui_master").eq("id", 1).maybeSingle(),
    ]).then(([i, o, p]) => {
      if (!hidup) return;
      const e = i.error ?? o.error ?? p.error;
      setGalat(e ? (/igardu_isian/.test(e.message) ? "Jalankan scripts/inspeksi-gardu-isian.sql di Supabase dulu." : e.message) : null);
      setItem((i.data ?? []).map((r) => petaItem(r, o.data ?? [])));
      setPerbaruiMaster(!!p.data?.perbarui_master);
      setLoading(false);
    });
    return () => { hidup = false; };
  }, []);

  const simpanItem = async (x: ItemIsian, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("simpan_igardu_isian", {
      p_item: {
        kode: x.kode, bagian: x.bagian, nama: x.nama, tipe: x.tipe, satuan: x.satuan, rincian: x.rincian,
        per_jurusan: x.perJurusan, foto: x.foto, wajib: x.wajib, item_tl: x.itemTl, kolom_master: x.kolomMaster,
        urutan: x.urutan, aktif: x.aktif,
      },
      p_opsi: x.opsi.map((o) => ({ kode: o.kode, label: o.label, normal: o.normal, prioritas: o.prioritas, urutan: o.urutan, aktif: o.aktif })),
      p_oleh: oleh,
    });
    if (error) throw new Error(error.message);
    setItem((p) => [...p.filter((y) => y.kode !== x.kode), x].sort((a, b) => a.urutan - b.urutan || a.kode.localeCompare(b.kode)));
  };

  const ubahPerbaruiMaster = async (nilai: boolean, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("simpan_igardu_pengaturan", { p_perbarui_master: nilai, p_oleh: oleh });
    if (error) throw new Error(error.message);
    setPerbaruiMaster(nilai);
  };

  /** Jawaban satu kunjungan (rincian inspeksi). */
  const jawabanDari = useCallback(async (id: string): Promise<JawabanIsian[]> => {
    const { data, error } = await supabaseBrowser
      .from("inspeksi_gardu_isian")
      .select("item_kode,rincian,nilai,angka,foto_url,catatan")
      .eq("inspeksi_id", id);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      item: r.item_kode as string,
      rincian: r.rincian as string,
      nilai: (r.nilai as string | null) ?? null,
      angka: r.angka === null || r.angka === undefined ? null : Number(r.angka),
      foto: (r.foto_url as string | null) ?? null,
      catatan: (r.catatan as string | null) ?? null,
    }));
  }, []);

  return { item, perbaruiMaster, loading, galat, simpanItem, ubahPerbaruiMaster, jawabanDari };
}
