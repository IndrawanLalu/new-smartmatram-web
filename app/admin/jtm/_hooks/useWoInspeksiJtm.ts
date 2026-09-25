"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { ReguPilihan, SegmenPilihan } from "@/app/admin/_components/SusunWoSegmen";

/**
 * WO Inspeksi JTM — bahan tab Susun WO (J4 `rencana-mobile-jtm-jtr.md`).
 *
 * Pola WO Perabasan: satuan segmen, ukuran KMS. Bedanya dua, keduanya
 * keputusan user: tim TIDAK wajib ditugaskan (semua tim se-ULP bisa
 * mengerjakan, keputusan d), dan WO hanya TARGET — inspeksi di luar WO tetap
 * sah (keputusan e). Tahap tiap item DITURUNKAN dari inspeksinya lewat view
 * `wo_inspeksi_item_status`, bukan disalin.
 */

export interface ItemWoJtm {
  id: string;
  wo_id: string;
  wo_nama: string;
  tgl_wo: string;
  ulp: string;
  penyulang: string | null;
  segmen_id: string;
  objek_nama: string;
  panjang_km: number | null;
  panjang_dari: string | null;
  regu: string | null;
  status: "Terbuka" | "Selesai" | "Dibatalkan";
  inspeksi_status: string | null;
  inspeksi_petugas: string | null;
  inspeksi_mulai: string | null;
}

const KOLOM_SEGMEN = "segmen_id,nama,penyulang,ulp,panjang_pakai_km,panjang_dari,umur_inspeksi_bulan";
const KOLOM_ITEM =
  "id,wo_id,wo_nama,tgl_wo,ulp,penyulang,segmen_id,objek_nama,panjang_km,panjang_dari,regu,status,inspeksi_status,inspeksi_petugas,inspeksi_mulai";

export function useWoInspeksiJtm() {
  const toast = useToast();
  const [segmen, setSegmen] = useState<SegmenPilihan[]>([]);
  const [item, setItem] = useState<ItemWoJtm[]>([]);
  const [tim, setTim] = useState<{ regu: string; ulp: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    Promise.all([
      fetchAllRows<SegmenPilihan>(() =>
        supabaseBrowser.from("master_segmen").select(KOLOM_SEGMEN).eq("status", "aktif")
          .order("penyulang").order("nama").order("segmen_id"),
      ),
      // Hanya item TERBUKA: yang mengikat segmen dan yang masih perlu diurus.
      fetchAllRows<ItemWoJtm>(() =>
        supabaseBrowser.from("wo_inspeksi_item_status").select(KOLOM_ITEM).eq("status", "Terbuka")
          .order("tgl_wo", { ascending: false }).order("id"),
      ),
      supabaseBrowser.from("regu_inspeksi").select("regu,ulp").order("ulp").order("regu"),
    ]).then(
      ([s, i, g]) => {
        if (!hidup) return;
        setSegmen(s);
        setItem(i);
        setTim((g.data ?? []) as { regu: string; ulp: string }[]);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        toast.error(
          e.message.includes("schema cache") || e.message.includes("does not exist")
            ? "Tabel WO inspeksi belum ada — jalankan scripts/wo-inspeksi-jtm.sql di Supabase."
            : e.message,
        );
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [nonce, toast]);

  const muat = () => setNonce((n) => n + 1);

  const segmenTerikat = useMemo(() => new Set(item.map((x) => x.segmen_id)), [item]);

  /** Tim + KMS WO terbuka yang sedang dipikulnya — pembagian timpang terlihat. */
  const regu = useMemo<ReguPilihan[]>(() => {
    const beban = new Map<string, number>();
    for (const x of item) if (x.regu) beban.set(`${x.ulp}|${x.regu}`, (beban.get(`${x.ulp}|${x.regu}`) ?? 0) + (x.panjang_km ?? 0));
    return tim.map((g) => ({ ...g, km_berjalan: beban.get(`${g.ulp}|${g.regu}`) ?? 0 }));
  }, [tim, item]);

  const terbitkan = async (v: {
    ulp: string;
    nama: string;
    targetKm: number;
    segmen: string[];
    regu: Record<string, string>;
    tglWo: string;
    oleh: string;
  }) => {
    const { data, error } = await supabaseBrowser.rpc("terbitkan_wo_inspeksi_jtm", {
      p_ulp: v.ulp,
      p_nama: v.nama,
      p_target_km: v.targetKm,
      p_segmen: v.segmen,
      p_tgl_wo: v.tglWo,
      p_regu: v.regu,
      p_oleh: v.oleh,
    });
    if (error) {
      toast.error(error.message);
      return null;
    }
    const h = data as { item: number; rencana_km: number; dilewati: { segmen: string; sebab: string }[] };
    toast.success(
      `WO terbit: ${h.item} segmen · ${Number(h.rencana_km ?? 0).toFixed(2).replace(".", ",")} KMS` +
        (h.dilewati?.length ? ` · ${h.dilewati.length} dilewati` : ""),
    );
    muat();
    return h;
  };

  const tugaskan = async (itemId: string, reguBaru: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("tugaskan_regu_inspeksi", {
      p_item_id: itemId,
      p_regu: reguBaru,
      p_oleh: oleh,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    // Ditambal di tempat — satu baris berubah, tidak perlu memuat ulang semua.
    setItem((p) => p.map((x) => (x.id === itemId ? { ...x, regu: reguBaru || null } : x)));
  };

  const batalkan = async (itemId: string, alasan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_wo_inspeksi_item", {
      p_item_id: itemId,
      p_alasan: alasan,
      p_oleh: oleh,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Dikeluarkan dari WO — inspeksinya (bila ada) tetap sah sebagai di luar WO.");
    setItem((p) => p.filter((x) => x.id !== itemId));
    return true;
  };

  return { segmen, item, regu, segmenTerikat, loading, terbitkan, tugaskan, batalkan, muat };
}
