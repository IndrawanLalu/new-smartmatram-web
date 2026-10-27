"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { GarduPilihan } from "@/app/admin/_components/SusunWoGardu";
import type { TierGardu } from "./useInspeksiGardu";

/**
 * WO Inspeksi Gardu (wo_igardu / wo_igardu_item, scripts/inspeksi-gardu.sql).
 *
 * `ulp` = ULP akun (huruf besar); null hanya UP3. Disaring di KUERI, jadi akun
 * ULP tidak pernah menerima WO ULP lain. Semua daftar lewat fetchAllRows dengan
 * urutan berkunci unik (batas 1000 baris PostgREST).
 */

export interface WoIgarduRingkas {
  wo_id: string;
  ulp: string;
  tier: TierGardu;
  nama: string;
  tgl_wo: string;
  target: number | null;
  status: "Terbit" | "Selesai" | "Dibatalkan";
  item: number;
  item_terkirim: number;
  item_selesai: number;
}

export interface ItemWoIgardu {
  id: string;
  wo_id: string;
  wo_nama: string;
  tgl_wo: string;
  tier: TierGardu;
  ulp: string;
  gardu_kode: string;
  gardu_nama: string | null;
  penyulang: string | null;
  regu: string | null;
  inspeksi_status: string | null;
  inspeksi_petugas: string | null;
}

/** Kunci gardu lintas ULP. */
export const kunciGardu = (ulp: string, kode: string) => `${ulp.toUpperCase()}|${kode.toUpperCase()}`;

export function useWoIgardu(ulp: string | null) {
  const toast = useToast();
  const [wo, setWo] = useState<WoIgarduRingkas[]>([]);
  const [item, setItem] = useState<ItemWoIgardu[]>([]);
  const [regu, setRegu] = useState<{ regu: string; ulp: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    Promise.all([
      fetchAllRows<WoIgarduRingkas>(() => {
        const q = supabaseBrowser.from("wo_igardu_capaian").select("wo_id,ulp,tier,nama,tgl_wo,target,status,item,item_terkirim,item_selesai");
        return (ulp ? q.eq("ulp", ulp) : q).order("tgl_wo", { ascending: false }).order("created_at", { ascending: false }).order("wo_id");
      }),
      // Hanya item TERBUKA: yang mengikat gardu dan yang masih perlu diurus.
      fetchAllRows<ItemWoIgardu>(() => {
        const q = supabaseBrowser
          .from("wo_igardu_item_status")
          .select("id,wo_id,wo_nama,tgl_wo,tier,ulp,gardu_kode,gardu_nama,penyulang,regu,inspeksi_status,inspeksi_petugas")
          .eq("status", "Terbuka");
        return (ulp ? q.eq("ulp", ulp) : q).order("tgl_wo", { ascending: false }).order("urutan").order("id");
      }),
      (ulp ? supabaseBrowser.from("regu_inspeksi").select("regu,ulp").eq("ulp", ulp) : supabaseBrowser.from("regu_inspeksi").select("regu,ulp"))
        .eq("igardu", true).order("ulp").order("regu"),
    ]).then(
      ([w, i, g]) => {
        if (!hidup) return;
        setWo(w.map((x) => ({
          ...x,
          tier: x.tier === "2" ? "2" : "1",
          item: Number(x.item), item_terkirim: Number(x.item_terkirim), item_selesai: Number(x.item_selesai),
        })));
        setItem(i.map((x) => ({ ...x, tier: x.tier === "2" ? "2" : "1" })));
        setRegu((g.data ?? []) as { regu: string; ulp: string }[]);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        toast.error(e.message.includes("does not exist") || e.message.includes("schema cache")
          ? "Tabel Inspeksi Gardu belum ada — jalankan scripts/inspeksi-gardu.sql di Supabase."
          : e.message);
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [nonce, ulp, toast]);

  const muat = () => setNonce((n) => n + 1);

  /** Gardu yang masih terbuka di WO, PER TIER (Tier 1 & 2 boleh bersamaan). */
  const terikat = useMemo(() => {
    const per: Record<TierGardu, Set<string>> = { "1": new Set(), "2": new Set() };
    for (const x of item) per[x.tier].add(kunciGardu(x.ulp, x.gardu_kode));
    return per;
  }, [item]);

  /** Master gardu ULP + kunjungan terakhir (tier itu) — bahan Susun WO. */
  const muatGardu = useCallback(async (u: string, tier: TierGardu): Promise<GarduPilihan[]> => {
    const [gardu, kunjungan] = await Promise.all([
      fetchAllRows<{ kode: string; nama: string | null; feeder: string | null; ulp: string; status: string | null }>(() =>
        supabaseBrowser.from("gardu").select("kode,nama,feeder,ulp,status").eq("ulp", u).order("kode").order("id")),
      fetchAllRows<{ gardu_kode: string; tgl: string }>(() =>
        supabaseBrowser.from("inspeksi_gardu").select("gardu_kode,tgl")
          .eq("ulp", u).eq("tier", tier).in("status", ["Selesai", "Diverifikasi"]).order("id")),
    ]);
    const akhir = new Map<string, string>();
    for (const k of kunjungan) {
      const kode = k.gardu_kode.toUpperCase();
      if (!akhir.has(kode) || akhir.get(kode)! < k.tgl) akhir.set(kode, k.tgl);
    }
    return gardu
      // Status kosong = aktif (812 baris master tanpa status).
      .filter((g) => !g.status || g.status.toLowerCase() !== "nonaktif")
      .map((g) => ({
        kode: g.kode,
        nama: g.nama,
        penyulang: g.feeder ?? "(penyulang belum tercatat)",
        ulp: g.ulp,
        terakhir: akhir.get(g.kode.toUpperCase()) ?? null,
      }));
  }, []);

  const rpc = async (nama: string, arg: Record<string, unknown>) => {
    const { data, error } = await supabaseBrowser.rpc(nama, arg);
    if (error) {
      toast.error(error.message);
      return null;
    }
    return data;
  };

  const terbitkan = async (v: {
    ulp: string; nama: string; target: number; gardu: string[]; regu: Record<string, string>; tglWo: string; tier: TierGardu; oleh: string;
  }) => {
    const h = (await rpc("terbitkan_wo_igardu", {
      p_ulp: v.ulp, p_nama: v.nama, p_target: v.target, p_gardu: v.gardu, p_tgl_wo: v.tglWo,
      p_regu: v.regu, p_oleh: v.oleh, p_tier: v.tier,
    })) as { item: number; dilewati: { gardu: string; sebab: string }[] } | null;
    if (!h) return false;
    toast.success(`WO Inspeksi Gardu Tier ${v.tier} terbit: ${h.item} gardu` + (h.dilewati.length ? ` · ${h.dilewati.length} dilewati` : ""));
    muat();
    return true;
  };

  const tambah = async (v: { woId: string; gardu: string[]; regu: Record<string, string>; target: number | null; oleh: string }) => {
    const h = (await rpc("tambah_wo_igardu", {
      p_wo_id: v.woId, p_gardu: v.gardu, p_regu: v.regu, p_target: v.target, p_oleh: v.oleh,
    })) as { item: number; dilewati: { gardu: string; sebab: string }[] } | null;
    if (!h) return false;
    toast.success(`${h.item} gardu ditambahkan` + (h.dilewati.length ? ` · ${h.dilewati.length} dilewati` : ""));
    muat();
    return true;
  };

  const tugaskan = async (itemId: string, reguBaru: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("tugaskan_regu_igardu", { p_item_id: itemId, p_regu: reguBaru, p_oleh: oleh });
    if (error) {
      toast.error(error.message);
      return;
    }
    setItem((p) => p.map((x) => (x.id === itemId ? { ...x, regu: reguBaru || null } : x)));
  };

  const keluarkan = async (itemId: string[], alasan: string, oleh: string) => {
    const h = (await rpc("keluarkan_wo_igardu", { p_item_id: itemId, p_alasan: alasan, p_oleh: oleh })) as
      { keluar: number; dilewati: { gardu: string; sebab: string }[] } | null;
    if (!h) return false;
    toast.success(`${h.keluar} gardu keluar dari WO` + (h.dilewati.length ? ` · ${h.dilewati.length} dilewati (sudah diinspeksi)` : ""));
    muat();
    return true;
  };

  const batalkanWo = async (woId: string, alasan: string, oleh: string) => {
    const n = await rpc("batalkan_wo_igardu", { p_wo_id: woId, p_alasan: alasan, p_oleh: oleh });
    if (n === null) return false;
    toast.success(`WO dibatalkan — ${n as number} gardu keluar dari HP.`);
    muat();
    return true;
  };

  return { wo, item, regu, loading, terikat, muat, muatGardu, terbitkan, tambah, tugaskan, keluarkan, batalkanWo };
}
