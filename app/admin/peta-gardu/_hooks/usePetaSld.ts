"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { bacaMilikPenanda, penandaTampil } from "@/lib/milikPenanda";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useToast } from "@/app/admin/_components/Toast";
import { susunSld, type GarduInfo, type GrafSld, type TiangSld } from "@/lib/sld";

/**
 * Data Peta SLD: kartu semua penyulang (`peta_sld_penyulang`, satu baris per
 * penyulang) dan — hanya untuk penyulang yang DIPILIH — pohon tiangnya, yang
 * diringkas jadi SLD di browser (`lib/sld.ts`). Penyulang yang sudah dimuat
 * disimpan; memilihnya lagi tidak menarik ulang.
 */

export interface RingkasPenyulang {
  penyulang: string;
  ulp: string;
  tiang: number;
  kmTiang: number | null;
  kmSegmen: number | null;
  segmen: number;
  gardu: number;
  garduKva: number;
  garduDiukur: number;
  bebanKva: number;
  garduOverload: number;
  gangguan: number;
}

/** `in(...)` masuk ke URL — dipecah supaya tidak menabrak batas panjangnya. */
const POTONG = 150;

async function muatGardu(kode: string[]): Promise<Map<string, GarduInfo>> {
  const hasil = new Map<string, GarduInfo>();
  for (let i = 0; i < kode.length; i += POTONG) {
    const k = kode.slice(i, i + POTONG);
    const [g, s] = await Promise.all([
      supabaseBrowser.from("gardu").select("kode,nama,daya").in("kode", k),
      supabaseBrowser.from("gardu_latest_state").select("no_gardu,beban_kva,persen_beban,event_date").in("no_gardu", k),
    ]);
    for (const x of g.data ?? []) {
      hasil.set(String(x.kode).toUpperCase(), {
        kode: String(x.kode).toUpperCase(), nama: x.nama ?? null,
        daya: x.daya === null ? null : Number(x.daya), bebanKva: null, persen: null, tglUkur: null,
      });
    }
    for (const x of s.data ?? []) {
      const kd = String(x.no_gardu).toUpperCase();
      const ada = hasil.get(kd) ?? { kode: kd, nama: null, daya: null, bebanKva: null, persen: null, tglUkur: null };
      hasil.set(kd, {
        ...ada,
        bebanKva: x.beban_kva === null ? null : Number(x.beban_kva),
        persen: x.persen_beban === null ? null : Number(x.persen_beban),
        tglUkur: (x.event_date as string) ?? null,
      });
    }
  }
  return hasil;
}

export function usePetaSld(unit: string | null) {
  const toast = useToast();
  const [ringkas, setRingkas] = useState<RingkasPenyulang[]>([]);
  const [memuatDaftar, setMemuatDaftar] = useState(true);
  const [graf, setGraf] = useState<Map<string, GrafSld>>(new Map());
  const [gardu, setGardu] = useState<Map<string, GarduInfo>>(new Map());
  const [memuat, setMemuat] = useState<Set<string>>(new Set());

  useEffect(() => {
    let batal = false;
    setMemuatDaftar(true);
    void (async () => {
      let q = supabaseBrowser.from("peta_sld_penyulang").select("*").order("penyulang");
      if (unit) q = q.eq("ulp", unit);
      const { data, error } = await q;
      if (batal) return;
      if (error) {
        toast.error(
          error.message.includes("peta_sld_penyulang")
            ? "Peta SLD belum terpasang — jalankan scripts/peta-sld.sql di Supabase."
            : error.message,
        );
      }
      setRingkas(
        (data ?? []).map((r) => ({
          penyulang: r.penyulang as string,
          ulp: r.ulp as string,
          tiang: Number(r.tiang_jumlah ?? 0),
          kmTiang: r.km_tiang === null ? null : Number(r.km_tiang),
          kmSegmen: r.km_segmen === null ? null : Number(r.km_segmen),
          segmen: Number(r.segmen_jumlah ?? 0),
          gardu: Number(r.gardu_jumlah ?? 0),
          garduKva: Number(r.gardu_kva ?? 0),
          garduDiukur: Number(r.gardu_diukur ?? 0),
          bebanKva: Number(r.beban_kva ?? 0),
          garduOverload: Number(r.gardu_overload ?? 0),
          gangguan: Number(r.gangguan_12bln ?? 0),
        })),
      );
      setMemuatDaftar(false);
    })();
    return () => {
      batal = true;
    };
  }, [unit, toast]);

  /** Tarik pohon tiang satu penyulang lalu ringkas jadi SLD. */
  const muat = useCallback(
    async (penyulang: string) => {
      if (graf.has(penyulang) || memuat.has(penyulang)) return;
      setMemuat((m) => new Set(m).add(penyulang));
      try {
        const [rows, milik] = await Promise.all([
          fetchAllRows<Record<string, unknown>>(() =>
            supabaseBrowser
              .from("peta_tiang")
              .select("id,kode,lat,lng,penanda,induk_id,pasangan_portal_dari,gardu_di_tiang")
              .eq("jaringan", "jtm")
              .eq("induk_kelompok", penyulang),
          ),
          bacaMilikPenanda(),
        ]);
        const tiang: TiangSld[] = rows.map((r) => ({
          id: r.id as string,
          kode: r.kode as string,
          lat: Number(r.lat),
          lng: Number(r.lng),
          // Gardu/peralatan di tiang bersama hanya milik satu penyulang; titik
          // pertemuan tetap di kedua SLD (jtm-peralatan-tiang-bersama.sql).
          penanda: penandaTampil(milik, r.id as string, penyulang) ? ((r.penanda as string) ?? null) : null,
          indukId: (r.induk_id as string) ?? null,
          pasanganPortalDari: (r.pasangan_portal_dari as string) ?? null,
          garduDiTiang: (r.gardu_di_tiang as string) ?? null,
        }));
        const g = susunSld(penyulang, tiang);
        const kode = [...new Set([...g.simpul.values()].map((s) => s.gardu).filter((k): k is string => !!k))];
        const info = await muatGardu(kode);
        setGardu((m) => new Map([...m, ...info]));
        setGraf((m) => new Map(m).set(penyulang, g));
      } catch (e) {
        toast.error(`Gagal memuat ${penyulang}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setMemuat((m) => {
          const b = new Set(m);
          b.delete(penyulang);
          return b;
        });
      }
    },
    [graf, memuat, toast],
  );

  return { ringkas, memuatDaftar, graf, gardu, memuat, muat };
}
