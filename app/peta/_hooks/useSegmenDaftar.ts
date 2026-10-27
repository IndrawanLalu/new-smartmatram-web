"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Segmen JTM per penyulang untuk pohon di folder JTM (12 Okt 2026), sejak
 * 27 Okt tersusun Penyulang → Section → Segmen seperti tabel Per section di
 * Master Segmen.
 *
 * Dibaca sekali per ULP, dan baru saat folder JTM dibuka — 1.000+ segmen
 * hanya beberapa puluh bita per baris, tetapi tidak ada gunanya menariknya
 * untuk orang yang membuka peta demi JTR.
 *
 * Hanya segmen yang sudah bertiang. Section rumah segmen = `segmen_section_utama`
 * (yang tiang isinya terbanyak); segmen yang isinya juga di section lain
 * (`segmen_lintas_section`) ditandai — namanya tidak cocok dengan yang
 * tergambar di peta, bahan Pecah di keypoint.
 */

export interface SegmenSimpul {
  id: string;
  nama: string;
  penyulang: string;
  jumlahTiang: number;
  panjangKm: number;
  /** Section yang dilewati, mis. "GI AMPENAN (12 tiang) · LBS MUSIUM (8 tiang)"; null = tidak lintas. */
  lintas: string | null;
}

export interface SectionSimpul {
  id: string;
  nama: string;
  jumlahTiang: number;
  panjangKm: number;
  segmen: SegmenSimpul[];
}

export interface PohonPenyulang {
  /** Hulu → hilir. */
  section: SectionSimpul[];
  /** Segmen yang section-nya belum tersusun (atau section belum terpasang). */
  lain: SegmenSimpul[];
  jumlahLintas: number;
}

interface BarisSegmen {
  segmen_id: string;
  nama: string;
  penyulang: string;
  induk_segmen_id: string | null;
  jumlah_tiang: number;
  panjang_km: number;
}

interface BarisSection {
  id: string;
  penyulang: string;
  nama: string;
  urutan: number;
  jumlah_tiang: number;
  panjang_km: number;
}

interface Isi {
  ulp: string;
  segmen: BarisSegmen[];
  section: BarisSection[];
  rumah: Map<string, string>;
  lintas: Map<string, string>;
}

/**
 * Hulu → hilir: segmen yang induknya di luar daftar ini (pangkal section)
 * dulu, lalu cabangnya menurut sambungan `induk_segmen_id`. Sesudah Pecah,
 * potongan pangkal tetap di atas potongan hilirnya. Saudara urut nama.
 */
function urutHuluHilir(daftar: SegmenSimpul[], induk: Map<string, string | null>): SegmenSimpul[] {
  const ada = new Set(daftar.map((s) => s.id));
  const anak = new Map<string, SegmenSimpul[]>();
  const akar: SegmenSimpul[] = [];
  for (const s of daftar) {
    const i = induk.get(s.id);
    if (i && i !== s.id && ada.has(i)) {
      const a = anak.get(i);
      if (a) a.push(s); else anak.set(i, [s]);
    } else akar.push(s);
  }
  const hasil: SegmenSimpul[] = [];
  const sudah = new Set<string>();
  const kunjungi = (s: SegmenSimpul) => {
    if (sudah.has(s.id)) return;   // penjaga lingkaran data rusak
    sudah.add(s.id);
    hasil.push(s);
    for (const c of anak.get(s.id) ?? []) kunjungi(c);
  };
  for (const s of akar) kunjungi(s);
  // Lingkaran tanpa akar tetap tampil.
  for (const s of daftar) kunjungi(s);
  return hasil;
}

function susun(isi: Isi): Map<string, PohonPenyulang> {
  const per = new Map<string, PohonPenyulang>();
  const ambil = (penyulang: string) => {
    const k = penyulang.toUpperCase();
    let p = per.get(k);
    if (!p) {
      p = { section: [], lain: [], jumlahLintas: 0 };
      per.set(k, p);
    }
    return p;
  };
  const sectionId = new Map<string, SectionSimpul>();
  for (const s of isi.section) {
    const simpul = { id: s.id, nama: s.nama, jumlahTiang: s.jumlah_tiang, panjangKm: Number(s.panjang_km), segmen: [] };
    sectionId.set(s.id, simpul);
    ambil(s.penyulang).section.push(simpul);
  }
  for (const b of isi.segmen) {
    const s: SegmenSimpul = {
      id: b.segmen_id, nama: b.nama, penyulang: b.penyulang,
      jumlahTiang: Number(b.jumlah_tiang), panjangKm: Number(b.panjang_km),
      lintas: isi.lintas.get(b.segmen_id) ?? null,
    };
    const p = ambil(b.penyulang);
    if (s.lintas) p.jumlahLintas++;
    const rumah = sectionId.get(isi.rumah.get(b.segmen_id) ?? "");
    if (rumah) rumah.segmen.push(s); else p.lain.push(s);
  }
  const induk = new Map(isi.segmen.map((b) => [b.segmen_id, b.induk_segmen_id]));
  for (const p of per.values()) {
    for (const sc of p.section) sc.segmen = urutHuluHilir(sc.segmen, induk);
    p.lain = urutHuluHilir(p.lain, induk);
  }
  return per;
}

export function useSegmenDaftar(ulp: string, aktif: boolean, versi: number) {
  // Disimpan bersama ULP & versinya: daftar ULP lain (atau sebelum Pecah) tidak
  // boleh tampil sesaat sesudah berganti.
  const [isi, setIsi] = useState<(Isi & { versi: number }) | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const sudah = isi?.ulp === ulp && isi.versi === versi;

  useEffect(() => {
    if (!aktif || sudah) return;
    let hidup = true;
    const u = ulp.toUpperCase();
    void (async () => {
      try {
        // Section yang kotor (tiang berubah) disusun ulang dulu — sama dengan
        // lapisan Section dan Master Segmen. Gagal = section lama tetap dipakai.
        await supabaseBrowser.rpc("segarkan_section_kotor", { p_ulp: ulp || null, p_batas: 50 });
        const [segmen, section, rumah, lintas] = await Promise.all([
          fetchAllRows<BarisSegmen>(() => {
            const q = supabaseBrowser
              .from("segmen_ringkas")
              .select("segmen_id,nama,penyulang,induk_segmen_id,jumlah_tiang,panjang_km")
              .eq("status", "aktif")
              // Segmen tanpa tiang (hasil impor/tempel yang belum dikerjakan) tidak
              // ada yang bisa digambar — 1.188 dari 1.291 segmen per 12 Okt 2026.
              .gt("jumlah_tiang", 0)
              .order("penyulang")
              .order("nama")
              .order("segmen_id");
            return ulp ? q.eq("ulp", ulp) : q;
          }),
          // Section & rumahnya: belum terpasang = pohon jatuh ke daftar segmen saja.
          fetchAllRows<BarisSection>(() => {
            const q = supabaseBrowser.from("section").select("id,penyulang,nama,urutan,jumlah_tiang,panjang_km").order("urutan").order("nama").order("id");
            return ulp ? q.eq("ulp", u) : q;
          }).catch(() => [] as BarisSection[]),
          fetchAllRows<{ segmen_id: string; section_id: string }>(() => {
            const q = supabaseBrowser.from("segmen_section_utama").select("segmen_id,section_id").order("segmen_id");
            return ulp ? q.eq("ulp", u) : q;
          }).catch(() => []),
          fetchAllRows<{ segmen_id: string; section: string }>(() => {
            const q = supabaseBrowser.from("segmen_lintas_section").select("segmen_id,section").order("segmen_id");
            return ulp ? q.eq("ulp", u) : q;
          }).catch(() => []),
        ]);
        if (!hidup) return;
        setIsi({
          ulp, versi, segmen, section,
          rumah: new Map(rumah.map((r) => [r.segmen_id, r.section_id])),
          lintas: new Map(lintas.map((r) => [r.segmen_id, r.section])),
        });
        setGalat(null);
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { hidup = false; };
  }, [ulp, aktif, sudah, versi]);

  const perPenyulang = useMemo(() => (sudah && isi ? susun(isi) : null), [sudah, isi]);
  return { perPenyulang, galat };
}
