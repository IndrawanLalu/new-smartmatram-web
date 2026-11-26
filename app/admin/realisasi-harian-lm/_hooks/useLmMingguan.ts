"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ambilBarisLm, ambilItemLm, ambilRefLm } from "@/app/admin/kinerja-yantek/_hooks/useLm4dx";
import { hariIniWita } from "@/app/admin/kinerja-yantek/_lib/realisasiHarian";
import type { BarisLm, ItemLm, Kategori, Tindakan } from "@/app/admin/kinerja-yantek/_lib/lm4dx";
import { bagiMinggu, mingguKe, type SistemMinggu } from "../_lib/mingguLm";
import { bulanDalam, kunciRentang, susunMingguan, type PetaSla } from "../_lib/barisMingguan";

/**
 * Data tab LM Mingguan: daftar baris (`lm4dx_baris` laporan 'mingguan', per
 * ULP — 25 Nov 2026), pekerjaan selebar minggu-minggu bulan itu (sistem ISO
 * bisa melewati batas bulan) dari realisasi_rentang + PDKB, SEMUA status —
 * termasuk yang belum disetujui/diverifikasi (keputusan user 23 Nov; beda
 * dengan tab harian). Target = SLA bulanan (`sla_rekap`, sama dengan Rekap
 * Kinerja) tiap bulan yang disentuh minggu-minggunya.
 */

async function ambilSla(ulp: string, dari: string, sampai: string, kunci: string[]): Promise<PetaSla> {
  const minta = bulanDalam(dari, sampai).flatMap((bln) => kunci.map((k) => ({ bln, k })));
  const hasil = await Promise.all(minta.map(({ bln, k }) =>
    supabaseBrowser.rpc("sla_rekap", {
      p_ulp: ulp === "SEMUA" ? null : ulp, p_kunci: k, p_tahun: Number(bln.slice(0, 4)), p_bulan: Number(bln.slice(5, 7)),
    }),
  ));
  const peta: PetaSla = new Map();
  hasil.forEach(({ data, error }, i) => {
    if (error) throw new Error(`SLA gagal dibaca: ${error.message}`);
    peta.set(`${minta[i].k}|${minta[i].bln}`, data === null ? null : Number(data));
  });
  return peta;
}

export function useLmMingguan(ulpAwal: string) {
  const [ulp, gantiUlp] = useState(ulpAwal);
  const [sistem, gantiSistem] = useState<SistemMinggu>("tetap");
  const [bulan, gantiBulan] = useState(() => hariIniWita().slice(0, 7));
  const [baris, setBaris] = useState<BarisLm[]>([]);
  const [kategori, setKategori] = useState<Kategori[]>([]);
  const [tindakan, setTindakan] = useState<Tindakan[]>([]);
  const [item, setItem] = useState<ItemLm[]>([]);
  const [sla, setSla] = useState<PetaSla>(new Map());
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const minggu = useMemo(() => bagiMinggu(bulan, sistem), [bulan, sistem]);
  const dari = minggu[0].dari;
  const sampai = minggu[minggu.length - 1].sampai;

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const [barisLm, ref] = await Promise.all([ambilBarisLm(ulp, "mingguan"), ambilRefLm()]);
        const kunciSla = [...new Set(barisLm.flatMap((b) => b.sla ?? []))];
        const [isi, slaBaru] = await Promise.all([
          ambilItemLm(ulp, dari, sampai, barisLm, false, kunciRentang(barisLm)),
          ambilSla(ulp, dari, sampai, kunciSla),
        ]);
        if (!hidup) return;
        setBaris(barisLm);
        setKategori(ref.kategori);
        setTindakan(ref.tindakan);
        setItem(isi);
        setSla(slaBaru);
        setGalat(null);
      } catch (e) {
        if (!hidup) return;
        setItem([]);
        setGalat(e instanceof Error ? e.message : String(e));
      }
      if (hidup) setLoading(false);
    })();
    return () => { hidup = false; };
  }, [ulp, dari, sampai, nonce]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: string) => { if (b) { mulai(); gantiBulan(b); } };
  const setSistem = (x: SistemMinggu) => {
    const w = bagiMinggu(bulan, x);
    // Rentang tanggal sama (tetap ↔ senin) = tanpa baca ulang.
    if (w[0].dari !== dari || w[w.length - 1].sampai !== sampai) mulai();
    gantiSistem(x);
  };

  const nilai = useMemo(
    () => susunMingguan(baris, item, (t) => mingguKe(minggu, t), minggu.length),
    [baris, item, minggu],
  );

  return { ulp, setUlp, bulan, setBulan, sistem, setSistem, minggu, baris, kategori, tindakan, nilai, sla, loading, galat, muat };
}
