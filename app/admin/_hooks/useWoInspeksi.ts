"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { ReguPilihan, SegmenPilihan } from "@/app/admin/_components/SusunWoSegmen";

/**
 * WO Inspeksi JTM & JTR — bahan tab Susun WO (J4/J5c `rencana-mobile-jtm-jtr.md`).
 *
 * Pola WO Perabasan, ukuran KMS. Satuannya SEGMEN (JTM) atau GARDU (JTR);
 * selebihnya sama: tim tidak wajib (keputusan d), WO hanya TARGET (keputusan
 * e), dan tahap tiap item DITURUNKAN dari inspeksinya lewat view status.
 *
 * Gardu tidak unik antar ULP, jadi kunci objek JTR = `ULP|KODE`.
 */

export type JenisWoInspeksi = "JTM" | "JTR";
/** Tier WO inspeksi JTM (`rencana-wo-jtm-tier2.md`). JTR selalu "1". */
export type TierWo = "1" | "2";

export interface ItemWoInspeksi {
  id: string;
  /** Kunci objek — segmen_id (JTM) atau `ULP|KODE` gardu (JTR). */
  objek: string;
  wo_id: string;
  wo_nama: string;
  tgl_wo: string;
  ulp: string;
  penyulang: string | null;
  objek_nama: string;
  panjang_km: number | null;
  panjang_dari: string | null;
  regu: string | null;
  status: "Terbuka" | "Selesai" | "Dibatalkan";
  inspeksi_status: string | null;
  inspeksi_petugas: string | null;
  tier: TierWo;
}

const kunciGardu = (ulp: string, kode: string) => `${ulp.toUpperCase()}|${kode.toUpperCase()}`;
const kodeDariKunci = (k: string) => k.split("|")[1] ?? k;

const SUMBER = {
  JTM: {
    view: "wo_inspeksi_item_status",
    kolom:
      // `as string`: daftar kolom sepanjang ini melewati batas pengurai tipe
      // supabase-js ("ParserError") — kuerinya sendiri sah.
      "id,wo_id,wo_nama,tgl_wo,ulp,penyulang,segmen_id,objek_nama,panjang_km,panjang_dari,regu,status,inspeksi_status,inspeksi_petugas,tier" as string,
    rpc: "terbitkan_wo_inspeksi_jtm",
    sql: "scripts/wo-inspeksi-jtm.sql",
  },
  JTR: {
    view: "wo_inspeksi_item_status_jtr",
    kolom:
      "id,wo_id,wo_nama,tgl_wo,ulp,penyulang,gardu_kode,objek_nama,panjang_km,panjang_dari,regu,status,inspeksi_status,inspeksi_petugas",
    rpc: "terbitkan_wo_inspeksi_jtr",
    sql: "scripts/wo-inspeksi-jtr.sql",
  },
} as const;

type BarisItem = Omit<ItemWoInspeksi, "objek" | "tier"> & {
  segmen_id?: string | null;
  gardu_kode?: string | null;
  tier?: string | null;
};

const keItem = (jenis: JenisWoInspeksi) => (r: BarisItem): ItemWoInspeksi => ({
  ...r,
  objek: jenis === "JTM" ? (r.segmen_id as string) : kunciGardu(r.ulp, r.gardu_kode ?? ""),
  tier: r.tier === "2" ? "2" : "1",
});

/** Objek yang bisa dipilih, dalam bentuk `SegmenPilihan` yang dipakai Susun WO. */
async function ambilObjek(jenis: JenisWoInspeksi): Promise<SegmenPilihan[]> {
  if (jenis === "JTM") {
    return fetchAllRows<SegmenPilihan>(() =>
      supabaseBrowser.from("master_segmen")
        .select("segmen_id,nama,penyulang,ulp,panjang_pakai_km,panjang_dari,umur_inspeksi_bulan,sumber")
        .eq("status", "aktif").order("penyulang").order("nama").order("segmen_id"),
    );
  }
  const gardu = await fetchAllRows<{
    gardu_kode: string; ulp: string; nama: string | null; penyulang: string | null;
    panjang_km: number | string | null; umur_inspeksi_bulan: number | null;
  }>(() =>
    supabaseBrowser.from("master_gardu_jtr")
      .select("gardu_kode,ulp,nama,penyulang,panjang_km,umur_inspeksi_bulan")
      .order("ulp").order("gardu_kode"),
  );
  return gardu.map((g) => {
    const km = Number(g.panjang_km ?? 0);
    return {
      segmen_id: kunciGardu(g.ulp, g.gardu_kode),
      nama: g.nama ? `${g.gardu_kode} · ${g.nama}` : g.gardu_kode,
      penyulang: g.penyulang ?? "(penyulang belum tercatat)",
      ulp: g.ulp,
      // Gardu yang jaringannya belum dititik memang belum punya KMS.
      panjang_pakai_km: km > 0 ? km : null,
      panjang_dari: km > 0 ? "hitungan" : "kosong",
      umur_inspeksi_bulan: g.umur_inspeksi_bulan,
    };
  });
}

export function useWoInspeksi(jenis: JenisWoInspeksi) {
  const toast = useToast();
  const src = SUMBER[jenis];
  const [objek, setObjek] = useState<SegmenPilihan[]>([]);
  const [item, setItem] = useState<ItemWoInspeksi[]>([]);
  const [tim, setTim] = useState<{ regu: string; ulp: string }[]>([]);
  /** Semua item yang tidak dibatalkan — bahan "sudah terbit bulan ini" di info SLA. */
  const [terbitan, setTerbitan] = useState<{ ulp: string; tgl_wo: string; panjang_km: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    Promise.all([
      ambilObjek(jenis),
      // Hanya item TERBUKA: yang mengikat objek dan yang masih perlu diurus.
      fetchAllRows<BarisItem>(() =>
        supabaseBrowser.from(src.view).select(src.kolom).eq("status", "Terbuka")
          .order("tgl_wo", { ascending: false }).order("id").returns<BarisItem[]>(),
      ),
      // Hanya petugas yang rolenya boleh jenis inspeksi ini (menu HP jtm / jtr,
      // `scripts/regu-inspeksi-dari-roles.sql`).
      supabaseBrowser.from("regu_inspeksi").select("regu,ulp").eq(jenis === "JTR" ? "jtr" : "jtm", true).order("ulp").order("regu"),
      fetchAllRows<{ ulp: string; tgl_wo: string; panjang_km: number | null }>(() =>
        supabaseBrowser.from(src.view).select("id,ulp,tgl_wo,panjang_km").neq("status", "Dibatalkan").order("id"),
      ),
    ]).then(
      ([o, i, g, t]) => {
        if (!hidup) return;
        setObjek(o);
        setItem(i.map(keItem(jenis)));
        setTerbitan(t);
        setTim((g.data ?? []) as { regu: string; ulp: string }[]);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        toast.error(
          /tier/.test(e.message) && e.message.includes("does not exist")
            ? "Kolom tier WO belum ada — jalankan scripts/wo-jtm-tier.sql di Supabase."
            : e.message.includes("schema cache") || e.message.includes("does not exist")
              ? `Tabel WO inspeksi belum ada — jalankan ${src.sql} di Supabase.`
              : e.message,
        );
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [nonce, toast, jenis, src]);

  const muat = () => setNonce((n) => n + 1);

  /** Objek yang masih terbuka di WO — PER TIER: satu segmen boleh ada di WO
   *  Tier 1 dan WO Tier 2 sekaligus (keputusan 1 `rencana-wo-jtm-tier2.md`). */
  const objekTerikat = useMemo(() => {
    const per: Record<TierWo, Set<string>> = { "1": new Set(), "2": new Set() };
    for (const x of item) per[x.tier].add(x.objek);
    return per;
  }, [item]);

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
    tier: TierWo;
  }) => {
    const umum = { p_ulp: v.ulp, p_nama: v.nama, p_target_km: v.targetKm, p_tgl_wo: v.tglWo, p_oleh: v.oleh };
    const { data, error } = await supabaseBrowser.rpc(
      src.rpc,
      jenis === "JTM"
        ? { ...umum, p_segmen: v.segmen, p_regu: v.regu, p_tier: v.tier }
        : {
            ...umum,
            p_gardu: v.segmen.map(kodeDariKunci),
            p_regu: Object.fromEntries(Object.entries(v.regu).map(([k, r]) => [kodeDariKunci(k), r])),
          },
    );
    if (error) {
      toast.error(error.message);
      return null;
    }
    const h = data as { item: number; rencana_km: number; dilewati: { segmen?: string; gardu?: string; sebab: string }[] };
    toast.success(
      `WO${jenis === "JTM" ? ` Tier ${v.tier}` : ""} terbit: ${h.item} ${jenis === "JTM" ? "segmen" : "gardu"} · ${Number(h.rencana_km ?? 0).toFixed(2).replace(".", ",")} KMS` +
        (h.dilewati?.length ? ` · ${h.dilewati.length} dilewati` : ""),
    );
    muat();
    return { item: h.item, dilewati: (h.dilewati ?? []).map((d) => ({ segmen: d.segmen ?? d.gardu ?? "", sebab: d.sebab })) };
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

  /** Keluarkan beberapa item sekaligus; yang sudah diinspeksi dilewati (`wo-batal-semua.sql`). */
  const keluarkanBanyak = async (itemId: string[], alasan: string, oleh: string) => {
    const { data, error } = await supabaseBrowser.rpc("keluarkan_wo_inspeksi_banyak", {
      p_item_id: itemId,
      p_alasan: alasan,
      p_oleh: oleh,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    const h = data as { keluar: number; dilewati: { objek: string; sebab: string }[] };
    if (h.keluar > 0) toast.success(`${h.keluar} ${jenis === "JTM" ? "segmen" : "gardu"} dikeluarkan dari WO.`);
    if (h.dilewati.length > 0) toast.error(`${h.dilewati.length} dilewati — ${h.dilewati.map((d) => `${d.objek}: ${d.sebab}`).join(" · ")}`);
    muat();
    return true;
  };

  /** Batalkan WO keseluruhan — hanya kalau belum ada yang diinspeksi. */
  const batalkanWo = async (woId: string, alasan: string, oleh: string) => {
    const { data, error } = await supabaseBrowser.rpc("batalkan_wo_inspeksi", { p_wo_id: woId, p_alasan: alasan, p_oleh: oleh });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(`WO dibatalkan — ${data as number} ${jenis === "JTM" ? "segmen" : "gardu"} keluar dari HP.`);
    muat();
    return true;
  };

  /** KMS WO inspeksi yang sudah terbit untuk ULP itu di bulan tanggal itu. */
  const terbitBulan = (u: string, tgl: string) =>
    terbitan
      .filter((x) => x.ulp === u && x.tgl_wo.slice(0, 7) === tgl.slice(0, 7))
      .reduce((n, x) => n + Number(x.panjang_km ?? 0), 0);

  return { objek, item, regu, objekTerikat, loading, terbitkan, tugaskan, batalkan, keluarkanBanyak, batalkanWo, muat, terbitBulan };
}
