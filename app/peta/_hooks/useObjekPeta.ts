"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { muatUsulanAsalKabel, type UsulanAsalKabel } from "@/lib/jtrAsalKabel";
import type { KesehatanGardu } from "./useKesehatanPeta";

/**
 * Rincian benda yang diklik di peta — tiang atau gardu — beserta daftar
 * pilihan untuk menyunting atributnya. Dibaca hanya saat sebuah benda dipilih;
 * peta sendiri cuma membawa titik dan nama.
 */

export type Terpilih =
  | { jenis: "tiang"; id: string; kelompok: string; lat: number; lng: number; kode: string; jaringan?: "jtm" | "jtr" }
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
  /** `induk` = nama induk tiang ini di penyulang itu, bila diatur khusus
   *  (titik pertemuan dua penyulang); null = ikut induk batangnya. */
  nama: { penyulang: string; kode: string; utama: boolean; induk: string | null }[];
  induk: string | null;
  /** Keadaan terakhir yang BUKAN normal — temuan terbuka. */
  temuan: { item: string; bagian: string; nilai: string }[];
  /** Diisi bila tiang dipilih dari lapisan JTR: data tiang ini DI GARDU ITU
   *  (nama, jurusan, induk, kabel) — bisa berbeda dari batangnya bila menumpang. */
  jtr: RincianJtr | null;
  /** Gardu portal (dua tiang): pasangannya, tiang gardunya, atau belum berpasangan. */
  portal: { pasangan: string | null; dari: string | null; tanpaPasangan: boolean };
  /** JTM: kode gardu di tiang ini (AM013) & namanya di Master Gardu — null bila belum ada di Master. */
  gardu_di_tiang: string | null;
  garduNama: string | null;
  /** JTM: nama peralatan di tiang (LBS/recloser …), mis. SAMPOERNA. */
  nama_peralatan: string | null;
}

export interface KabelJtr {
  nomor: number;
  jenis: string | null;
  ukuran: string | null;
  kondisi: string | null;
  /** Kabel ini belum jelas datang dari tiang mana (`jtr_gawang_terputus`). */
  putus: boolean;
  /** Asal yang DITUNJUK: "gardu", kode tiang, atau null = ikut induk tiang. */
  asal: string | null;
  /** Usulan asal dari server untuk kabel yang belum jelas (`usul_asal_kabel_jtr`). */
  usulan: UsulanAsalKabel | null;
  /** Jurusan (huruf panel) yang dibawa kabel ini (`jtr-jurusan-kabel.sql`). */
  jurusan: string | null;
  /** Kabel ke-2 dst. yang jurusannya belum pernah dicatat — dianggap jurusan tiangnya. */
  belumPasti: boolean;
}

export interface RincianJtr {
  gardu: string;
  kode: string;
  jurusan: string | null;
  menumpang: boolean;
  /** Baris pinjaman (`tiang_jtr_tumpang`) — untuk "Lepas dari batang". */
  tumpangId: string | null;
  indukKode: string | null;
  kabel: KabelJtr[];
  /** Jurusan gardu ini yang lewat tiang ini — utama lebih dulu — beserta nama
   *  tiang di deret itu (AM104-A4 / AM104-B5). */
  jurusanLewat: { jurusan: string; kode: string; utama: boolean }[];
  /** Gardu JTR lain di batang ini (tercatat), dan yang dinyatakan regu. */
  garduLain: string[];
  dinyatakanLain: { ada: boolean; kode: string | null };
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
  /** Dari pengukuran terakhir (`kesehatan_gardu`); null = belum pernah diukur
   *  atau view belum dipasang. */
  kesehatan: KesehatanGardu | null;
}

/** Daftar pilihan atribut — JTM dari isian inspeksi JTM, JTR dari Pengaturan JTR. */
export interface PilihanAtribut {
  jenis: string[];
  konstruksi: string[];
  tinggi: string[];
  kabelJenis: string[];
  kabelUkuran: string[];
}

async function muatJtr(id: string, gardu: string, ulp: string): Promise<RincianJtr | null> {
  const [j, k, p, gk] = await Promise.all([
    supabaseBrowser.from("jtr_tiang").select("kode,jurusan,induk_id,menumpang,tumpang_id")
      .eq("id", id).ilike("gardu_kode", gardu).eq("status_hidup", "aktif").maybeSingle(),
    supabaseBrowser.from("jtr_kabel").select("nomor,jenis,ukuran,kondisi,jurusan").eq("tiang_id", id).eq("gardu", gardu.toUpperCase()).order("nomor"),
    supabaseBrowser.from("jtr_gawang_terputus").select("nomor_kabel").eq("tiang_id", id).ilike("gardu_kode", gardu),
    // hulu_ditunjuk & hulu_id: asal per kabel (ditunjuk tanpa hulu = langsung dari gardu).
    supabaseBrowser.from("tiang_gawang_kabel").select("nomor_kabel,hulu_id,hulu_ditunjuk").eq("tiang_id", id).ilike("gardu_kode", gardu),
  ]);
  if (j.error) throw new Error(j.error.message);
  if (!j.data) return null;
  let indukKode: string | null = null;
  if (j.data.induk_id) {
    const i = await supabaseBrowser.from("jtr_tiang").select("kode").eq("id", j.data.induk_id).ilike("gardu_kode", gardu).maybeSingle();
    indukKode = (i.data?.kode as string) ?? null;
  }
  const putus = new Set((p.data ?? []).map((x) => Number(x.nomor_kabel)));
  const ditunjuk = (gk.data ?? []).filter((x) => x.hulu_ditunjuk);
  const idHulu = [...new Set(ditunjuk.map((x) => x.hulu_id as string | null).filter((x): x is string => !!x))];
  const kodeHulu = new Map<string, string>();
  if (idHulu.length) {
    const h = await supabaseBrowser.from("jtr_tiang").select("id,kode").in("id", idHulu).ilike("gardu_kode", gardu);
    for (const x of h.data ?? []) kodeHulu.set(x.id as string, x.kode as string);
  }
  const asalKabel = new Map(
    ditunjuk.map((x) => [Number(x.nomor_kabel), x.hulu_id ? (kodeHulu.get(x.hulu_id as string) ?? "tiang lain") : "gardu"]),
  );
  const usulan = putus.size ? (await muatUsulanAsalKabel(gardu, ulp)).filter((u) => u.tiangId === id) : [];
  const [lain, nyata, lewat, belum] = await Promise.all([
    supabaseBrowser.from("jtr_tiang").select("gardu_kode").eq("id", id).eq("status_hidup", "aktif"),
    supabaseBrowser.from("tiang").select("jtr_gardu_lain,jtr_gardu_lain_kode").eq("id", id).maybeSingle(),
    supabaseBrowser.from("jtr_tiang_jurusan").select("jurusan,kode,utama")
      .eq("id", id).eq("gardu_kode", gardu.toUpperCase()).eq("status_hidup", "aktif"),
    supabaseBrowser.from("jtr_kabel_perlu_dipastikan").select("nomor_kabel")
      .eq("tiang_id", id).eq("gardu_kode", gardu.toUpperCase()),
  ]);
  const belumPasti = new Set((belum.data ?? []).map((x) => Number(x.nomor_kabel)));
  return {
    gardu: gardu.toUpperCase(),
    kode: j.data.kode as string,
    jurusan: (j.data.jurusan as string) ?? null,
    menumpang: !!j.data.menumpang,
    tumpangId: (j.data.tumpang_id as string) ?? null,
    indukKode,
    garduLain: [...new Set((lain.data ?? []).map((x) => String(x.gardu_kode).toUpperCase()))].filter(
      (x) => x !== gardu.toUpperCase(),
    ),
    dinyatakanLain: {
      ada: !!nyata.data?.jtr_gardu_lain,
      kode: (nyata.data?.jtr_gardu_lain_kode as string) ?? null,
    },
    kabel: (k.data ?? []).map((x) => ({
      nomor: Number(x.nomor),
      jenis: (x.jenis as string) ?? null,
      ukuran: (x.ukuran as string) ?? null,
      kondisi: (x.kondisi as string) ?? null,
      putus: putus.has(Number(x.nomor)),
      asal: asalKabel.get(Number(x.nomor)) ?? null,
      usulan: usulan.find((u) => u.nomor === Number(x.nomor)) ?? null,
      jurusan: (x.jurusan as string) ?? null,
      belumPasti: belumPasti.has(Number(x.nomor)),
    })),
    jurusanLewat: (lewat.data ?? [])
      .map((x) => ({ jurusan: x.jurusan as string, kode: x.kode as string, utama: !!x.utama }))
      .sort((a, b) => Number(b.utama) - Number(a.utama) || a.jurusan.localeCompare(b.jurusan)),
  };
}

const KOLOM_TIANG =
  "id,kode,ulp,penyulang,gardu_kode,jurusan,jenis,konstruksi,tinggi,kondisi,nomor_lama,penanda,percabangan,sumber,dikonfirmasi_at,dikonfirmasi_oleh,induk_id,lat,lng,pasangan_portal_dari,gardu_di_tiang,nama_peralatan";

async function muatTiang(id: string, garduJtr: string | null): Promise<RincianTiang> {
  const [t, n, k] = await Promise.all([
    supabaseBrowser.from("tiang").select(KOLOM_TIANG).eq("id", id).single(),
    supabaseBrowser.from("tiang_kode_penyulang").select("penyulang,kode,utama,induk_id").eq("tiang_id", id),
    supabaseBrowser
      .from("tiang_kondisi_terakhir")
      .select("item_nama,bagian,nilai_label,nilai,normal")
      .eq("tiang_id", id)
      .eq("normal", false),
  ]);
  if (t.error) throw new Error(t.error.message);
  const r = t.data as Record<string, unknown>;
  const jtr = garduJtr ? await muatJtr(id, garduJtr, String(r.ulp ?? "")) : null;
  const [pas, dari, tanpa, gm] = await Promise.all([
    supabaseBrowser.from("tiang").select("kode").eq("pasangan_portal_dari", id).eq("status_hidup", "aktif").limit(1),
    r.pasangan_portal_dari
      ? supabaseBrowser.from("tiang").select("kode").eq("id", r.pasangan_portal_dari as string).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseBrowser.from("jtm_portal_tanpa_pasangan").select("tiang_id").eq("tiang_id", id).limit(1),
    r.gardu_di_tiang
      ? supabaseBrowser.from("gardu").select("nama").eq("kode", r.gardu_di_tiang as string).limit(1)
      : Promise.resolve({ data: null }),
  ]);
  const namaRaw = (n.data ?? []) as { penyulang: string; kode: string; utama: boolean; induk_id: string | null }[];
  const indukPer = namaRaw.filter((x) => x.induk_id);
  const kodeIndukPer = indukPer.length
    ? ((await supabaseBrowser.from("tiang_kode_penyulang").select("tiang_id,penyulang,kode")
        .in("tiang_id", indukPer.map((x) => x.induk_id as string))).data ?? [])
    : [];
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
    nama: namaRaw.map((x) => ({
      penyulang: x.penyulang,
      kode: x.kode,
      utama: x.utama,
      induk: x.induk_id
        ? ((kodeIndukPer.find((k) => k.tiang_id === x.induk_id && k.penyulang === x.penyulang)?.kode as string) ?? "?")
        : null,
    })),
    induk,
    jtr,
    portal: {
      pasangan: (pas.data?.[0]?.kode as string) ?? null,
      dari: ((dari.data as { kode?: string } | null)?.kode as string) ?? null,
      tanpaPasangan: (tanpa.data ?? []).length > 0,
    },
    garduNama: ((gm.data as { nama?: string }[] | null)?.[0]?.nama as string) ?? null,
    temuan: (k.data ?? []).map((x) => ({
      item: x.item_nama as string,
      bagian: x.bagian as string,
      nilai: (x.nilai_label as string) ?? (x.nilai as string),
    })),
  };
}

async function muatGardu(kode: string, ulp: string): Promise<RincianGardu> {
  const [g, u, k] = await Promise.all([
    supabaseBrowser.from("gardu").select("kode,nama,ulp,feeder,alamat,daya,lat,lng").eq("kode", kode).eq("ulp", ulp).maybeSingle(),
    supabaseBrowser
      .from("master_usulan")
      .select("id")
      .eq("entitas", "gardu").eq("entitas_kode", kode.toUpperCase()).eq("field", "koordinat").eq("status", "menunggu")
      .limit(1),
    supabaseBrowser.from("kesehatan_gardu").select("*").eq("kode", kode).eq("ulp", ulp).maybeSingle(),
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
    kesehatan: k.error ? null : ((k.data as KesehatanGardu | null) ?? null),
  };
}

async function muatPilihan(jtr: boolean): Promise<PilihanAtribut> {
  if (jtr) {
    const { data } = await supabaseBrowser
      .from("jtr_ref").select("kategori,kode")
      .in("kategori", ["jenis_tiang", "ukuran_tiang", "jenis_kabel", "ukuran_kabel"]).eq("aktif", true).order("urutan");
    const per = (k: string) => (data ?? []).filter((x) => x.kategori === k).map((x) => x.kode as string);
    return {
      jenis: per("jenis_tiang"), konstruksi: [], tinggi: per("ukuran_tiang"),
      kabelJenis: per("jenis_kabel"), kabelUkuran: per("ukuran_kabel"),
    };
  }
  // tiang.jenis & tiang.konstruksi menyimpan LABEL pilihan (jtm_koreksi_master).
  const { data } = await supabaseBrowser
    .from("jtm_opsi_ref").select("item_kode,label").in("item_kode", ["jenis_tiang", "konstruksi", "konstruksi_mvtic"]).eq("aktif", true).order("urutan");
  const per = (k: string[]) => (data ?? []).filter((x) => k.includes(x.item_kode as string)).map((x) => x.label as string);
  return { jenis: per(["jenis_tiang"]), konstruksi: per(["konstruksi", "konstruksi_mvtic"]), tinggi: [], kabelJenis: [], kabelUkuran: [] };
}

export function useObjekPeta(terpilih: Terpilih | null) {
  const [tiang, setTiang] = useState<RincianTiang | null>(null);
  const [gardu, setGardu] = useState<RincianGardu | null>(null);
  const [pilihan, setPilihan] = useState<PilihanAtribut>({ jenis: [], konstruksi: [], tinggi: [], kabelJenis: [], kabelUkuran: [] });
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const kunci = terpilih
    ? terpilih.jenis === "tiang" ? `t:${terpilih.id}:${terpilih.kelompok}` : `g:${terpilih.kode}:${terpilih.ulp}`
    : "";

  useEffect(() => {
    let hidup = true;
    if (!terpilih) return;
    const kerja = async () => {
      try {
        if (terpilih.jenis === "tiang") {
          const garduJtr = terpilih.jaringan === "jtr" ? terpilih.kelompok : null;
          const t = await muatTiang(terpilih.id, garduJtr);
          const p = await muatPilihan(!!garduJtr || !!t.gardu_kode);
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
