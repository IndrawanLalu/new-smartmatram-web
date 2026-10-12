"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { KOLOM_TIANG, keTiang, type TiangPeta } from "./usePetaIsi";

/**
 * "Segmen ini saja" (12 Okt 2026): satu segmen JTM digambar sendirian —
 * tiangnya, gawangnya — beserta rinciannya. Dipakai dari pohon segmen di
 * folder JTM dan dari Persetujuan JTM, supaya admin yang menilai satu segmen
 * tidak melihat seluruh penyulang di sekitarnya.
 *
 * Tiangnya dibaca LANGSUNG per segmen, bukan dari kotak pandang: segmen
 * puluhan tiang, jadi gerbang zoom & layar yang menahan peta penuh tidak
 * diperlukan, dan segmennya tetap utuh walau diperkecil.
 */

export interface RingkasSegmen {
  segmen_id: string;
  nama: string;
  penyulang: string;
  ulp: string;
  induk_nama: string | null;
  jumlah_anak: number;
  jumlah_tiang: number;
  jumlah_gawang: number;
  panjang_km: number;
  gawang_tanpa_titik: number;
  gawang_terpanjang_m: number | null;
  titik_awal_jenis: string;
  titik_awal_nama: string;
  titik_akhir_jenis: string;
  titik_akhir_nama: string;
  penghantar_jenis: string | null;
  penghantar_ukuran: number | null;
}

type Isi = Record<string, number>;

/** Hasil inspeksi yang sudah dikirim (Selesai/Diverifikasi) — `rekap_data_jtm`. */
export interface RekapSegmen {
  kms: number;
  tiang: number;
  ukuran: Isi;
  jenis: Isi;
  jenis_tiang: Isi;
  peralatan: Isi;
  gardu: number;
  gardu_kva: number;
}

export interface InspeksiTerakhir {
  id: string;
  status: string;
  tier: string;
  tgl_mulai: string | null;
  tgl_selesai: string | null;
  petugas_nama: string | null;
}

/** Label pilihan isian (ukuran/jenis konduktor, jenis tiang, peralatan). */
export type LabelIsian = Record<"ukuran" | "jenis" | "jenis_tiang" | "peralatan", Map<string, string>>;

let labelJanji: Promise<LabelIsian> | null = null;
/** Sekali per halaman — daftar pilihan jarang berubah. Dipakai juga rincian penyulang. */
export function muatLabel(): Promise<LabelIsian> {
  labelJanji ??= (async () => {
    const [opsi, penanda] = await Promise.all([
      supabaseBrowser
        .from("jtm_opsi_ref")
        .select("item_kode,kode,label")
        .in("item_kode", ["ukuran_konduktor", "jenis_konduktor", "jenis_tiang"]),
      supabaseBrowser.from("jtm_ref").select("kode,label").eq("kategori", "penanda"),
    ]);
    const dari = (item: string) =>
      new Map(
        ((opsi.data ?? []) as { item_kode: string; kode: string; label: string }[])
          .filter((o) => o.item_kode === item)
          .map((o) => [o.kode, o.label]),
      );
    return {
      ukuran: dari("ukuran_konduktor"),
      jenis: dari("jenis_konduktor"),
      jenis_tiang: dari("jenis_tiang"),
      peralatan: new Map(
        ((penanda.data ?? []) as { kode: string; label: string | null }[]).map((p) => [p.kode.toLowerCase(), p.label ?? p.kode]),
      ),
    };
  })().catch((e) => {
    labelJanji = null;
    throw e;
  });
  return labelJanji;
}

interface Keadaan {
  id: string;
  ringkas: RingkasSegmen | null;
  rekap: RekapSegmen | null;
  inspeksi: InspeksiTerakhir | null;
  label: LabelIsian | null;
  tiang: TiangPeta[];
}

async function muat(id: string): Promise<Keadaan> {
  const { data: r, error } = await supabaseBrowser
    .from("segmen_ringkas")
    .select(
      "segmen_id,nama,penyulang,ulp,induk_nama,jumlah_anak,jumlah_tiang,jumlah_gawang,panjang_km,gawang_tanpa_titik,gawang_terpanjang_m,titik_awal_jenis,titik_awal_nama,titik_akhir_jenis,titik_akhir_nama,penghantar_jenis,penghantar_ukuran",
    )
    .eq("segmen_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) throw new Error("Segmen ini sudah tidak ada di master.");
  const ringkas = r as RingkasSegmen;

  const [anggota, rekap, inspeksi, label] = await Promise.all([
    fetchAllRows<{ tiang_id: string }>(() =>
      supabaseBrowser.from("segmen_tiang").select("tiang_id").eq("segmen_id", id).order("tiang_id"),
    ),
    supabaseBrowser.rpc("rekap_data_jtm", { p_ulp: ringkas.ulp }).eq("segmen_id", id).maybeSingle(),
    supabaseBrowser
      .from("inspeksi_jtm_ringkas")
      .select("id,status,tier,tgl_mulai,tgl_selesai,petugas_nama")
      .eq("segmen_id", id)
      .neq("status", "Dibatalkan")
      .order("tgl_selesai", { ascending: false, nullsFirst: false })
      .order("tgl_mulai", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    muatLabel().catch(() => null),
  ]);

  // Satu tiang bisa punya beberapa baris `peta_tiang` (tiang bersama): yang
  // dipakai baris milik penyulang segmen ini, supaya penanda & induknya benar.
  const ids = anggota.map((a) => a.tiang_id);
  const baris: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error: e } = await supabaseBrowser
      .from("peta_tiang")
      .select(KOLOM_TIANG)
      .eq("jaringan", "jtm")
      .in("id", ids.slice(i, i + 100));
    if (e) throw new Error(e.message);
    baris.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const perId = new Map<string, Record<string, unknown>>();
  for (const b of baris) {
    const ada = perId.get(b.id as string);
    if (!ada || b.induk_kelompok === ringkas.penyulang) perId.set(b.id as string, b);
  }

  const rk = rekap.data as RekapSegmen | null;
  return {
    id,
    ringkas,
    rekap: rk ? { ...rk, kms: Number(rk.kms), gardu_kva: Number(rk.gardu_kva) } : null,
    inspeksi: (inspeksi.data as InspeksiTerakhir | null) ?? null,
    label,
    tiang: [...perId.values()].map(keTiang).filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng)),
  };
}

export function useSegmenPeta(id: string | null) {
  const [isi, setIsi] = useState<Keadaan | null>(null);
  const [galat, setGalat] = useState<{ id: string; pesan: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let hidup = true;
    muat(id).then(
      (k) => hidup && setIsi(k),
      (e: Error) => hidup && setGalat({ id, pesan: e.message }),
    );
    return () => { hidup = false; };
  }, [id]);

  // Isi segmen sebelumnya tidak boleh tergambar sesaat di segmen yang baru.
  const kini = id && isi?.id === id ? isi : null;
  const batas = useMemo<[[number, number], [number, number]] | null>(() => {
    if (!kini || kini.tiang.length === 0) return null;
    const lat = kini.tiang.map((t) => t.lat);
    const lng = kini.tiang.map((t) => t.lng);
    const pad = 0.0004;
    return [[Math.min(...lat) - pad, Math.min(...lng) - pad], [Math.max(...lat) + pad, Math.max(...lng) + pad]];
  }, [kini]);

  return {
    ringkas: kini?.ringkas ?? null,
    rekap: kini?.rekap ?? null,
    inspeksi: kini?.inspeksi ?? null,
    label: kini?.label ?? null,
    tiang: kini?.tiang ?? [],
    batas,
    memuat: !!id && !kini && galat?.id !== id,
    galat: galat?.id === id ? galat.pesan : null,
  };
}

export type SegmenPeta = ReturnType<typeof useSegmenPeta>;
