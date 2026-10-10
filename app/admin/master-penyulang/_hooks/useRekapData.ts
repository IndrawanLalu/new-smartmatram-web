"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Rekap Data JTM per penyulang → per segmen (10 Okt 2026), dari
 * `rekap_data_jtm`. HANYA tiang dari inspeksi Selesai/Diverifikasi — angkanya
 * dihitung di database, layar ini cuma menyusun kolom dan label.
 */

type Isi = Record<string, number>;

export interface BarisRekap {
  penyulang: string;
  ulp: string;
  segmen_id: string | null;
  segmen: string | null;
  kms: number;
  tiang: number;
  ukuran: Isi;
  jenis: Isi;
  jenis_tiang: Isi;
  peralatan: Isi;
  gardu: number;
  gardu_kva: number;
}

export interface PenyulangRekap extends BarisRekap {
  segmenDaftar: BarisRekap[];
}

/** Satu kelompok kolom bergabung: judul di atas, satu kolom per nilai. */
export interface Kelompok {
  kunci: "ukuran" | "jenis" | "jenis_tiang" | "peralatan";
  judul: string;
  satuan: "kms" | "jumlah";
  kolom: { kode: string; label: string }[];
}

const KELOMPOK: Omit<Kelompok, "kolom">[] = [
  { kunci: "ukuran", judul: "Ukuran konduktor (kms)", satuan: "kms" },
  { kunci: "jenis", judul: "Jenis konduktor (kms)", satuan: "kms" },
  { kunci: "jenis_tiang", judul: "Jenis tiang (batang)", satuan: "jumlah" },
  { kunci: "peralatan", judul: "Peralatan", satuan: "jumlah" },
];

/** Opsi isian JTM per kelompok; peralatan dari penanda tiang. */
const SUMBER_OPSI: Record<Kelompok["kunci"], string> = {
  ukuran: "ukuran_konduktor",
  jenis: "jenis_konduktor",
  jenis_tiang: "jenis_tiang",
  peralatan: "",
};

const KOSONG = "-";
/** Jenis tiang: tiang penyulang lain yang cuma ditumpangi kabel penyulang ini. */
const MENUMPANG = "menumpang";

export function useRekapData(ulp: string) {
  const [baris, setBaris] = useState<BarisRekap[]>([]);
  const [label, setLabel] = useState<Record<string, { kode: string; label: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      setLoading(true);
      try {
        const [rows, opsi, penanda] = await Promise.all([
          fetchAllRows<BarisRekap>(() =>
            supabaseBrowser.rpc("rekap_data_jtm", { p_ulp: ulp || null }).order("ulp").order("penyulang").order("segmen"),
          ),
          supabaseBrowser
            .from("jtm_opsi_ref")
            .select("item_kode,kode,label")
            .in("item_kode", Object.values(SUMBER_OPSI).filter(Boolean))
            .order("urutan"),
          supabaseBrowser.from("jtm_ref").select("kode,label").eq("kategori", "penanda").order("urutan"),
        ]);
        if (!hidup) return;
        const l: Record<string, { kode: string; label: string }[]> = { peralatan: [] };
        for (const o of (opsi.data ?? []) as { item_kode: string; kode: string; label: string }[]) {
          (l[o.item_kode] ??= []).push({ kode: o.kode, label: o.label });
        }
        l.peralatan = ((penanda.data ?? []) as { kode: string; label: string }[])
          .filter((p) => p.kode.toLowerCase() !== "gardu")
          .map((p) => ({ kode: p.kode.toLowerCase(), label: p.label ?? p.kode }));
        setLabel(l);
        setBaris(rows.map((r) => ({ ...r, kms: Number(r.kms), gardu_kva: Number(r.gardu_kva) })));
        setGalat(null);
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : String(e));
      } finally {
        if (hidup) setLoading(false);
      }
    })();
    return () => { hidup = false; };
  }, [ulp]);

  const penyulang = useMemo<PenyulangRekap[]>(() => {
    const induk = new Map<string, PenyulangRekap>();
    for (const r of baris) if (!r.segmen_id && r.penyulang) induk.set(`${r.ulp}|${r.penyulang}`, { ...r, segmenDaftar: [] });
    for (const r of baris) if (r.segmen_id) induk.get(`${r.ulp}|${r.penyulang}`)?.segmenDaftar.push(r);
    return [...induk.values()];
  }, [baris]);

  /** Kolom = nilai yang benar-benar muncul, urut pilihan di Pengaturan JTM;
   *  nilai yang tak dikenal & "belum diisi" di ujung. */
  const kelompok = useMemo<Kelompok[]>(
    () =>
      KELOMPOK.map((k) => {
        const ada = new Set(penyulang.flatMap((p) => Object.keys(p[k.kunci])));
        const opsi = label[SUMBER_OPSI[k.kunci] || "peralatan"] ?? [];
        const kolom = opsi.filter((o) => ada.has(o.kode));
        const dikenal = new Set(opsi.map((o) => o.kode));
        for (const kode of ada) {
          if (!dikenal.has(kode) && kode !== KOSONG && kode !== MENUMPANG) kolom.push({ kode, label: kode.toUpperCase() });
        }
        if (ada.has(MENUMPANG)) kolom.push({ kode: MENUMPANG, label: "Menumpang" });
        if (ada.has(KOSONG)) kolom.push({ kode: KOSONG, label: "Belum diisi" });
        return { ...k, kolom };
      }).filter((k) => k.kolom.length > 0),
    [penyulang, label],
  );

  /** Baris jumlah. kms (kilometer SIRKIT) dijumlah dari baris penyulang;
   *  tiang, jenis tiang, peralatan, dan gardu dari baris jumlah database
   *  (penyulang = '') yang menghitung tiap batang fisik sekali — tiang yang
   *  ditumpangi tercatat di pemilik dan penumpangnya. */
  const total = useMemo(() => {
    const fisik = baris.find((r) => !r.segmen_id && !r.penyulang);
    const jumlah = (f: (p: PenyulangRekap) => number) => penyulang.reduce((a, p) => a + f(p), 0);
    const isi = (kunci: Kelompok["kunci"]) => {
      const o: Isi = {};
      for (const p of penyulang) for (const [k, v] of Object.entries(p[kunci])) o[k] = (o[k] ?? 0) + Number(v);
      return o;
    };
    return {
      kms: jumlah((p) => p.kms),
      ukuran: isi("ukuran"),
      jenis: isi("jenis"),
      tiang: fisik?.tiang ?? 0,
      gardu: fisik?.gardu ?? 0,
      gardu_kva: fisik?.gardu_kva ?? 0,
      jenis_tiang: fisik?.jenis_tiang ?? {},
      peralatan: fisik?.peralatan ?? {},
    };
  }, [baris, penyulang]);

  return { penyulang, kelompok, total, loading, galat };
}

export type TotalRekap = ReturnType<typeof useRekapData>["total"];
