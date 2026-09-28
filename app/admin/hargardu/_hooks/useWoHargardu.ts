"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import {
  DEFAULT_WO_HAR, garduAktif, kunciGardu, susunKandidat, tanggalWo,
  type AlasanWoHar, type KandidatHar, type MasterGardu, type WoHarSettings,
} from "../_lib/kandidatWo";

/**
 * WO Pemeliharaan Gardu (`scripts/wo-hargardu.sql`) — sepola WO Pengukuran.
 * Realisasi dibaca dari view `wo_hargardu_realisasi`, tidak pernah ditulis.
 */

export interface WoHarHeader {
  id: string;
  ulp: string;
  bulan: number;
  tahun: number;
  tgl_wo: string;
  kuota: number;
  kriteria: { sumber?: string; rencana?: number; sisa?: number; otomatis?: boolean } | null;
  created_at: string;
}

export interface BarisWoHar {
  id: string;
  wo_id: string;
  gardu_kode: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  lat: number | null;
  lng: number | null;
  alasan: AlasanWoHar;
  tgl_pelihara_terakhir: string | null;
  umur_bulan: number | null;
  urutan: number;
  bulan: number;
  tahun: number;
  tgl_wo: string;
  pemeliharaan_id: string | null;
  status_pemeliharaan: string | null;
  tgl_realisasi: string | null;
  petugas_nama: string | null;
  terealisasi: boolean;
  disetujui: boolean;
}

export type StatusWoHar = "Belum dikerjakan" | "Sedang dikerjakan" | "Menunggu persetujuan" | "Disetujui";
export const STATUS_WO_HAR: StatusWoHar[] = ["Belum dikerjakan", "Sedang dikerjakan", "Menunggu persetujuan", "Disetujui"];

export const statusWo = (b: Pick<BarisWoHar, "status_pemeliharaan">): StatusWoHar =>
  b.status_pemeliharaan === "Diverifikasi" ? "Disetujui"
  : b.status_pemeliharaan === "Selesai" ? "Menunggu persetujuan"
  : b.status_pemeliharaan === "Dalam Proses" ? "Sedang dikerjakan"
  : "Belum dikerjakan";

const KOLOM_BARIS =
  "id,wo_id,gardu_kode,ulp,nama,alamat,penyulang,lat,lng,alasan,tgl_pelihara_terakhir,umur_bulan,urutan,bulan,tahun,tgl_wo,pemeliharaan_id,status_pemeliharaan,tgl_realisasi,petugas_nama,terealisasi,disetujui";
const UKURAN_BATCH = 500;
const tanggalWita = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" });

interface Muatan {
  /** Gardu Rencana Pemeliharaan bulan ini per ULP (kunci gardu). */
  rencana: Map<string, Set<string>>;
  /** Gardu WO bulan lalu yang belum dikerjakan per ULP — ikut WO dari rencana. */
  sisa: Map<string, Set<string>>;
  settings: Map<string, WoHarSettings>;
  headers: WoHarHeader[];
  rows: BarisWoHar[];
  master: MasterGardu[];
  terakhir: Map<string, string>;
}

/** @param daftar ULP yang dikelola layar ini — satu ULP, atau keempatnya untuk UP3 "Semua". */
export function useWoHargardu(daftar: string[], tahun: number, bulan: number) {
  const [data, setData] = useState<Muatan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [memproses, setMemproses] = useState<string | null>(null);

  const kunciDaftar = daftar.join(",");
  const muat = () => { setData(null); setGalat(null); setNonce((n) => n + 1); };

  const tarik = useCallback(async (): Promise<Muatan> => {
    const ulp = kunciDaftar.split(",").filter(Boolean);
    const lalu = bulan === 1 ? { t: tahun - 1, b: 12 } : { t: tahun, b: bulan - 1 };
    const [set, head, rows, master, kerja, rencana, lewat] = await Promise.all([
      supabaseBrowser.from("wo_hargardu_settings").select("ulp,frekuensi_per_tahun,kuota_per_bulan,hanya_gardu_aktif"),
      supabaseBrowser
        .from("wo_hargardu")
        .select("id,ulp,bulan,tahun,tgl_wo,kuota,kriteria,created_at")
        .eq("tahun", tahun)
        .eq("bulan", bulan)
        .in("ulp", ulp)
        .order("ulp"),
      fetchAllRows<BarisWoHar>(() =>
        supabaseBrowser
          .from("wo_hargardu_realisasi")
          .select(KOLOM_BARIS)
          .eq("tahun", tahun)
          .eq("bulan", bulan)
          .in("ulp", ulp)
          .order("ulp")
          .order("urutan")
          .order("id"),
      ),
      // Wajib paginasi: master 2.500+ gardu, PostgREST memotong di 1.000.
      fetchAllRows<MasterGardu>(() =>
        supabaseBrowser
          .from("gardu_master_state")
          .select("kode,ulp,nama,alamat,penyulang,status,lat,lng")
          .in("ulp", ulp)
          .order("kode")
          .order("ulp"),
      ),
      fetchAllRows<{ id: string; gardu_kode: string; ulp: string; tgl_selesai: string | null }>(() =>
        supabaseBrowser
          .from("pemeliharaan_gardu")
          .select("id,gardu_kode,ulp,tgl_selesai")
          .in("status", ["Selesai", "Diverifikasi"])
          .in("ulp", ulp)
          .order("id"),
      ),
      // Tabel belum ada (SQL rencana belum dijalankan) = tanpa rencana.
      fetchAllRows<{ ulp: string; gardu_kode: string }>(() =>
        supabaseBrowser
          .from("rencana_hargardu")
          .select("ulp,gardu_kode")
          .eq("tahun", tahun)
          .eq("bulan", bulan)
          .in("ulp", ulp)
          .order("id"),
      ).catch(() => []),
      fetchAllRows<{ ulp: string; gardu_kode: string }>(() =>
        supabaseBrowser
          .from("wo_hargardu_realisasi")
          .select("ulp,gardu_kode")
          .eq("tahun", lalu.t)
          .eq("bulan", lalu.b)
          .eq("terealisasi", false)
          .in("ulp", ulp)
          .order("id"),
      ),
    ]);
    if (set.error) throw new Error(set.error.message);
    if (head.error) throw new Error(head.error.message);

    const terakhir = new Map<string, string>();
    for (const k of kerja) {
      if (!k.tgl_selesai) continue;
      const kunci = kunciGardu(k.gardu_kode, k.ulp);
      const tgl = tanggalWita(k.tgl_selesai);
      if (tgl > (terakhir.get(kunci) ?? "")) terakhir.set(kunci, tgl);
    }
    const kelompok = (xs: { ulp: string; gardu_kode: string }[]) => {
      const m = new Map<string, Set<string>>();
      for (const x of xs) {
        if (!m.has(x.ulp)) m.set(x.ulp, new Set());
        m.get(x.ulp)!.add(x.gardu_kode.toUpperCase());
      }
      return m;
    };
    return {
      rencana: kelompok(rencana),
      sisa: kelompok(lewat),
      settings: new Map((set.data ?? []).map((s) => [s.ulp as string, s as WoHarSettings])),
      headers: (head.data ?? []) as WoHarHeader[],
      rows,
      master,
      terakhir,
    };
  }, [kunciDaftar, tahun, bulan]);

  useEffect(() => {
    let hidup = true;
    tarik().then(
      (h) => { if (hidup) setData(h); },
      (e: Error) => { if (hidup) setGalat(e.message); },
    );
    return () => { hidup = false; };
  }, [tarik, nonce]);

  const settingsUntuk = useCallback(
    (ulp: string): WoHarSettings => data?.settings.get(ulp) ?? DEFAULT_WO_HAR,
    [data],
  );

  /** Kandidat LENGKAP per ULP (belum dipotong kuota) + jumlah gardu aktif. */
  const perUlp = useMemo(() => {
    const m = new Map<string, {
      kandidat: KandidatHar[];
      aktif: number;
      header: WoHarHeader | null;
      /** Jumlah gardu dari Rencana Pemeliharaan; 0 = bulan ini disusun sistem. */
      rencana: number;
      /** Sisa WO bulan lalu yang ikut bila bulan ini dari rencana. */
      sisa: number;
    }>();
    if (!data) return m;
    const tglWo = tanggalWo(tahun, bulan);
    for (const ulp of kunciDaftar.split(",").filter(Boolean)) {
      const s = settingsUntuk(ulp);
      const master = data.master.filter((g) => g.ulp === ulp);
      m.set(ulp, {
        kandidat: susunKandidat(master, data.terakhir, s, tglWo),
        aktif: master.filter((g) => !s.hanya_gardu_aktif || garduAktif(g.status)).length,
        header: data.headers.find((h) => h.ulp === ulp) ?? null,
        rencana: data.rencana.get(ulp)?.size ?? 0,
        sisa: [...(data.sisa.get(ulp) ?? [])].filter((k) => !data.rencana.get(ulp)?.has(k)).length,
      });
    }
    return m;
  }, [data, kunciDaftar, tahun, bulan, settingsUntuk]);

  const simpanSetting = async (ulp: string, s: WoHarSettings) => {
    setMemproses(`set-${ulp}`);
    try {
      const { error } = await supabaseBrowser
        .from("wo_hargardu_settings")
        .upsert({ ulp, ...s, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      setData((d) => (d ? { ...d, settings: new Map(d.settings).set(ulp, s) } : d));
    } finally {
      setMemproses(null);
    }
  };

  /**
   * Terbitkan WO satu ULP. ULP yang sudah punya WO bulan ini DITOLAK indeks
   * unik di database — daftar yang sudah dipegang regu tidak boleh ditimpa.
   */
  const terbitkan = async (ulp: string) => {
    const info = perUlp.get(ulp);
    if (!info || info.header) throw new Error(`WO ${ulp} bulan ini sudah terbit.`);

    // Bulan yang ada rencananya disusun server — fungsi yang sama dengan
    // penerbitan otomatis tanggal 1, jadi hasilnya selalu sama.
    if (info.rencana > 0) {
      setMemproses(`wo-${ulp}`);
      try {
        const { data: r, error } = await supabaseBrowser.rpc("terbitkan_wo_hargardu_rencana", {
          p_ulp: ulp, p_tahun: tahun, p_bulan: bulan,
        });
        if (error) throw new Error(error.message);
        muat();
        const h = r as { rencana: number; sisa: number };
        return h.rencana + h.sisa;
      } finally {
        setMemproses(null);
      }
    }

    const s = settingsUntuk(ulp);
    const pilih = info.kandidat.slice(0, s.kuota_per_bulan);
    if (pilih.length === 0) throw new Error(`Tidak ada gardu ${ulp} yang jatuh tempo.`);

    setMemproses(`wo-${ulp}`);
    try {
      const { data: auth } = await supabaseBrowser.auth.getUser();
      const woId = crypto.randomUUID();
      const { error: eWo } = await supabaseBrowser.from("wo_hargardu").insert({
        id: woId,
        ulp,
        bulan,
        tahun,
        tgl_wo: tanggalWo(tahun, bulan),
        kuota: s.kuota_per_bulan,
        kriteria: s,
        created_by: auth?.user?.id ?? null,
      });
      if (eWo) throw new Error(eWo.message);

      const items = pilih.map((k, i) => ({ wo_id: woId, ...k, urutan: i + 1 }));
      for (let i = 0; i < items.length; i += UKURAN_BATCH) {
        const { error: eItem } = await supabaseBrowser.from("wo_hargardu_item").insert(items.slice(i, i + UKURAN_BATCH));
        if (eItem) {
          // Header tanpa baris tampil "sudah terbit" padahal kosong, dan
          // menghalangi percobaan ulang — dibuang.
          await supabaseBrowser.from("wo_hargardu").delete().eq("id", woId);
          throw new Error(eItem.message);
        }
      }
      muat();
      return pilih.length;
    } finally {
      setMemproses(null);
    }
  };

  /** Hapus satu WO beserta barisnya. Pemeliharaan yang sudah dikerjakan tidak tersentuh. */
  const hapus = async (woId: string) => {
    setMemproses(`hapus-${woId}`);
    try {
      const { error } = await supabaseBrowser.from("wo_hargardu").delete().eq("id", woId);
      if (error) throw new Error(error.message);
      muat();
    } finally {
      setMemproses(null);
    }
  };

  return {
    loading: data === null && galat === null,
    galat,
    rows: data?.rows ?? [],
    perUlp,
    settingsUntuk,
    memproses,
    muat,
    simpanSetting,
    terbitkan,
    hapus,
  };
}
