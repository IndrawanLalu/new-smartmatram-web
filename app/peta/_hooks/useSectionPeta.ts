"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Lapisan Section JTM (X2, `scripts/jtm-section.sql`): gawang tiap tiang
 * diwarnai menurut section-nya, nama section di tiang hulunya. Hanya untuk
 * penyulang JTM yang menyala; dibaca hanya selama lapisan menyala. Section yang
 * kotor (tiang berubah) disusun ulang dulu di server.
 */

export interface SectionPeta {
  id: string;
  penyulang: string;
  ulp: string;
  tiang_hulu_id: string;
  jenis_hulu: string;
  nama: string;
  jumlah_tiang: number;
  panjang_km: number;
  warna: string;
  hulu: { lat: number; lng: number } | null;
}

/** Warna section — terbaca di latar gelap, jalan, dan citra; berurutan per penyulang. */
const WARNA_SECTION = ["#F472B6", "#34D399", "#60A5FA", "#FBBF24", "#A78BFA", "#F87171", "#2DD4BF", "#FB923C", "#A3E635", "#E879F9"];

/** Kunci tiang di satu penyulang — tiang underbuild ada di section beberapa penyulang. */
export const kunciSection = (tiangId: string, penyulang: string) => `${tiangId}|${penyulang.toUpperCase()}`;

export function useSectionPeta(ulp: string, penyulang: string[]) {
  const [aktif, setAktif] = useState(false);
  const [daftar, setDaftar] = useState<SectionPeta[]>([]);
  const [anggota, setAnggota] = useState<Map<string, string>>(new Map());
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [ke, setKe] = useState(0);
  const [pilih, setPilih] = useState<string | null>(null);
  const kunciPenyulang = penyulang.map((p) => p.toUpperCase()).sort().join("|");

  useEffect(() => {
    if (!aktif || !kunciPenyulang) {
      setDaftar([]);
      setAnggota(new Map());
      return;
    }
    let hidup = true;
    void (async () => {
      setMemuat(true);
      setGalat(null);
      try {
        const { error: eSusun } = await supabaseBrowser.rpc("segarkan_section_kotor", { p_ulp: ulp || null, p_batas: 50 });
        if (eSusun) throw new Error(eSusun.message);
        let q = supabaseBrowser
          .from("section")
          .select("id,penyulang,ulp,tiang_hulu_id,jenis_hulu,nama,jumlah_tiang,panjang_km")
          .in("penyulang", kunciPenyulang.split("|"))
          .order("penyulang")
          .order("nama");
        if (ulp) q = q.eq("ulp", ulp.toUpperCase());
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const baris = (data ?? []) as Omit<SectionPeta, "warna" | "hulu">[];
        const ids = baris.map((s) => s.id);
        const [isi, { data: hulu }] = await Promise.all([
          ids.length
            ? fetchAllRows<{ section_id: string; tiang_id: string }>(() =>
                supabaseBrowser.from("section_tiang").select("section_id,tiang_id").in("section_id", ids).order("tiang_id"))
            : Promise.resolve([]),
          ids.length
            ? supabaseBrowser.from("tiang").select("id,lat,lng").in("id", baris.map((s) => s.tiang_hulu_id))
            : Promise.resolve({ data: [] }),
        ]);
        if (!hidup) return;
        const titik = new Map(((hulu ?? []) as { id: string; lat: number | null; lng: number | null }[]).map((t) => [t.id, t]));
        const urutan = new Map<string, number>();
        const lengkap = baris.map((s) => {
          const n = urutan.get(s.penyulang) ?? 0;
          urutan.set(s.penyulang, n + 1);
          const t = titik.get(s.tiang_hulu_id);
          return {
            ...s,
            panjang_km: Number(s.panjang_km),
            warna: WARNA_SECTION[n % WARNA_SECTION.length],
            hulu: t && t.lat !== null && t.lng !== null ? { lat: t.lat, lng: t.lng } : null,
          };
        });
        const per = new Map(lengkap.map((s) => [s.id, s]));
        setDaftar(lengkap);
        setAnggota(new Map(isi.map((x) => [kunciSection(x.tiang_id, per.get(x.section_id)!.penyulang), x.section_id])));
      } catch (e) {
        if (hidup) {
          const m = e instanceof Error ? e.message : String(e);
          setGalat(/segarkan_section_kotor|relation .*section/.test(m) ? "Section belum terpasang — jalankan scripts/jtm-section.sql di Supabase." : m);
        }
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => { hidup = false; };
  }, [aktif, ulp, kunciPenyulang, ke]);

  const perId = useMemo(() => new Map(daftar.map((s) => [s.id, s])), [daftar]);
  const muatUlang = useCallback(() => setKe((n) => n + 1), []);
  const terpilih = pilih ? (perId.get(pilih) ?? null) : null;

  return { aktif, setAktif, daftar, anggota, perId, memuat, galat, muatUlang, terpilih, setPilih };
}

export type LapisanSection = ReturnType<typeof useSectionPeta>;
