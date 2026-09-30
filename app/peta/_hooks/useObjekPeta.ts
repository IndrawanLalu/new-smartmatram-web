"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Rincian benda yang diklik di peta — tiang atau gardu — beserta daftar
 * pilihan untuk menyunting atributnya. Dibaca hanya saat sebuah benda dipilih;
 * peta sendiri cuma membawa titik dan nama.
 */

export type Terpilih =
  | { jenis: "tiang"; id: string; kelompok: string; lat: number; lng: number; kode: string }
  | { jenis: "gardu"; kode: string; ulp: string; lat: number; lng: number };

export interface RincianTiang {
  id: string;
  kode: string;
  ulp: string | null;
  penyulang: string | null;
  gardu_kode: string | null;
  jurusan: string | null;
  jenis: string | null;
  konstruksi: string | null;
  tinggi: number | null;
  kondisi: string | null;
  nomor_lama: string | null;
  penanda: string | null;
  percabangan: boolean;
  sumber: string | null;
  dikonfirmasi_at: string | null;
  dikonfirmasi_oleh: string | null;
  induk_id: string | null;
  lat: number;
  lng: number;
  /** Nama tiang di tiap penyulang yang melewatinya (JTM). */
  nama: { penyulang: string; kode: string; utama: boolean }[];
  induk: string | null;
  /** Keadaan terakhir yang BUKAN normal — temuan terbuka. */
  temuan: { item: string; bagian: string; nilai: string }[];
}

export interface RincianGardu {
  kode: string;
  nama: string | null;
  ulp: string;
  feeder: string | null;
  alamat: string | null;
  daya: number | null;
  lat: number | null;
  lng: number | null;
  usulanTitikMenunggu: boolean;
}

/** Daftar pilihan atribut — JTM dari isian inspeksi JTM, JTR dari Pengaturan JTR. */
export interface PilihanAtribut {
  jenis: string[];
  konstruksi: string[];
  tinggi: string[];
}

const KOLOM_TIANG =
  "id,kode,ulp,penyulang,gardu_kode,jurusan,jenis,konstruksi,tinggi,kondisi,nomor_lama,penanda,percabangan,sumber,dikonfirmasi_at,dikonfirmasi_oleh,induk_id,lat,lng";

async function muatTiang(id: string): Promise<RincianTiang> {
  const [t, n, k] = await Promise.all([
    supabaseBrowser.from("tiang").select(KOLOM_TIANG).eq("id", id).single(),
    supabaseBrowser.from("tiang_kode_penyulang").select("penyulang,kode,utama").eq("tiang_id", id),
    supabaseBrowser
      .from("tiang_kondisi_terakhir")
      .select("item_nama,bagian,nilai_label,nilai,normal")
      .eq("tiang_id", id)
      .eq("normal", false),
  ]);
  if (t.error) throw new Error(t.error.message);
  const r = t.data as Record<string, unknown>;
  let induk: string | null = null;
  if (r.induk_id) {
    const i = await supabaseBrowser.from("tiang").select("kode").eq("id", r.induk_id as string).maybeSingle();
    induk = (i.data?.kode as string) ?? null;
  }
  return {
    ...(r as unknown as RincianTiang),
    tinggi: r.tinggi === null ? null : Number(r.tinggi),
    percabangan: !!r.percabangan,
    lat: Number(r.lat),
    lng: Number(r.lng),
    nama: (n.data ?? []) as RincianTiang["nama"],
    induk,
    temuan: (k.data ?? []).map((x) => ({
      item: x.item_nama as string,
      bagian: x.bagian as string,
      nilai: (x.nilai_label as string) ?? (x.nilai as string),
    })),
  };
}

async function muatGardu(kode: string, ulp: string): Promise<RincianGardu> {
  const [g, u] = await Promise.all([
    supabaseBrowser.from("gardu").select("kode,nama,ulp,feeder,alamat,daya,lat,lng").eq("kode", kode).eq("ulp", ulp).maybeSingle(),
    supabaseBrowser
      .from("master_usulan")
      .select("id")
      .eq("entitas", "gardu").eq("entitas_kode", kode.toUpperCase()).eq("field", "koordinat").eq("status", "menunggu")
      .limit(1),
  ]);
  if (g.error) throw new Error(g.error.message);
  if (!g.data) throw new Error(`Gardu ${kode} tidak ditemukan`);
  const d = g.data as Record<string, unknown>;
  return {
    kode: d.kode as string,
    nama: (d.nama as string) ?? null,
    ulp: d.ulp as string,
    feeder: (d.feeder as string) ?? null,
    alamat: (d.alamat as string) ?? null,
    daya: d.daya === null ? null : Number(d.daya),
    lat: d.lat === null ? null : Number(d.lat),
    lng: d.lng === null ? null : Number(d.lng),
    usulanTitikMenunggu: (u.data ?? []).length > 0,
  };
}

async function muatPilihan(jtr: boolean): Promise<PilihanAtribut> {
  if (jtr) {
    const { data } = await supabaseBrowser
      .from("jtr_ref").select("kategori,kode").in("kategori", ["jenis_tiang", "ukuran_tiang"]).eq("aktif", true).order("urutan");
    const per = (k: string) => (data ?? []).filter((x) => x.kategori === k).map((x) => x.kode as string);
    return { jenis: per("jenis_tiang"), konstruksi: [], tinggi: per("ukuran_tiang") };
  }
  // tiang.jenis & tiang.konstruksi menyimpan LABEL pilihan (jtm_koreksi_master).
  const { data } = await supabaseBrowser
    .from("jtm_opsi_ref").select("item_kode,label").in("item_kode", ["jenis_tiang", "konstruksi", "konstruksi_mvtic"]).eq("aktif", true).order("urutan");
  const per = (k: string[]) => (data ?? []).filter((x) => k.includes(x.item_kode as string)).map((x) => x.label as string);
  return { jenis: per(["jenis_tiang"]), konstruksi: per(["konstruksi", "konstruksi_mvtic"]), tinggi: [] };
}

export function useObjekPeta(terpilih: Terpilih | null) {
  const [tiang, setTiang] = useState<RincianTiang | null>(null);
  const [gardu, setGardu] = useState<RincianGardu | null>(null);
  const [pilihan, setPilihan] = useState<PilihanAtribut>({ jenis: [], konstruksi: [], tinggi: [] });
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const kunci = terpilih ? (terpilih.jenis === "tiang" ? `t:${terpilih.id}` : `g:${terpilih.kode}:${terpilih.ulp}`) : "";

  useEffect(() => {
    let hidup = true;
    if (!terpilih) return;
    const kerja = async () => {
      try {
        if (terpilih.jenis === "tiang") {
          const t = await muatTiang(terpilih.id);
          const p = await muatPilihan(!!t.gardu_kode);
          if (hidup) { setTiang(t); setGardu(null); setPilihan(p); setGalat(null); }
        } else {
          const g = await muatGardu(terpilih.kode, terpilih.ulp);
          if (hidup) { setGardu(g); setTiang(null); setGalat(null); }
        }
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : String(e));
      }
    };
    void kerja();
    return () => { hidup = false; };
    // `terpilih` objek baru tiap render — kuncinya yang dipakai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci, nonce]);

  const muatUlang = useCallback(() => setNonce((n) => n + 1), []);

  return {
    // Dicocokkan ke yang sedang dipilih: sampai rincian baru datang, panel
    // menunggu — bukan menampilkan benda yang barusan ditinggalkan.
    tiang: terpilih?.jenis === "tiang" && tiang?.id === terpilih.id ? tiang : null,
    gardu: terpilih?.jenis === "gardu" && gardu?.kode === terpilih.kode ? gardu : null,
    pilihan,
    galat,
    muatUlang,
  };
}
