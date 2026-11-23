"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { ambilDrone } from "@/app/admin/kinerja-yantek/_hooks/useLm4dx";
import { hariIniWita } from "@/app/admin/kinerja-yantek/_lib/realisasiHarian";
import { bagiMinggu, mingguKe, type SistemMinggu } from "../_lib/mingguLm";
import { BARIS_MINGGUAN, bulanDalam, susunMingguan, type ItemMingguan, type PetaSla } from "../_lib/barisMingguan";

/**
 * Data tab LM Mingguan: `realisasi_rentang` selebar minggu-minggu bulan itu
 * (sistem ISO bisa melewati batas bulan), SEMUA status — termasuk yang belum
 * disetujui/diverifikasi (keputusan user 23 Nov; beda dengan tab harian).
 * Tanda drone dari inspeksi_jtm; kategori & jenis Pemeliharaan Jaringan dari
 * pemeliharaan_jaringan_daftar. Target = SLA bulanan (`sla_rekap`, sama
 * dengan Rekap Kinerja) tiap bulan yang disentuh minggu-minggunya.
 */

const POTONG = 200;
const KUNCI = new Set(["jtm", "jtm2", "igardu1", "igardu2", "perabasan", "harjtm"]);

async function ambilHarjar(id: string[]) {
  const peta = new Map<string, { kategori: string | null; jenis: string | null }>();
  for (let i = 0; i < id.length; i += POTONG) {
    const { data, error } = await supabaseBrowser
      .from("pemeliharaan_jaringan_daftar")
      .select("id,kategori_label,jenis")
      .in("id", id.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) peta.set(String(r.id), { kategori: r.kategori_label ?? null, jenis: r.jenis ?? null });
  }
  return peta;
}

const KUNCI_SLA = [...new Set(BARIS_MINGGUAN.flatMap((b) => b.sla ?? []))];

async function ambilSla(ulp: string, dari: string, sampai: string): Promise<PetaSla> {
  const minta = bulanDalam(dari, sampai).flatMap((bln) => KUNCI_SLA.map((k) => ({ bln, k })));
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
  const [item, setItem] = useState<ItemMingguan[]>([]);
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
        const [rows, slaBaru] = await Promise.all([
          fetchAllRows<Record<string, unknown>>(() =>
            supabaseBrowser
              .rpc("realisasi_rentang", { p_ulp: ulp, p_dari: dari, p_sampai: sampai })
              // Hanya kunci tab ini (pengukuran gardu = ribuan baris sebulan; tanpa
              // saringan, halaman akhir bulan bisa tidak terbaca).
              .in("kunci", [...KUNCI])
              .order("tgl")
              .order("sumber")
              .order("sumber_id"),
          ),
          ambilSla(ulp, dari, sampai),
        ]);
        const pakai = rows.filter((r) => r.bagian !== "ujung");
        const idDari = (k: string) => pakai.filter((r) => r.kunci === k && r.sumber_id).map((r) => String(r.sumber_id));
        const [drone, harjar] = await Promise.all([ambilDrone(idDari("jtm")), ambilHarjar(idDari("harjtm"))]);
        if (!hidup) return;
        setItem(pakai.map((r) => {
          const id = String(r.sumber_id ?? "");
          const h = r.kunci === "harjtm" ? harjar.get(id) : undefined;
          return {
            tgl: String(r.tgl),
            kunci: String(r.kunci),
            km: Number(r.km ?? 0),
            drone: r.kunci === "jtm" && drone.has(id),
            kategori: h?.kategori ?? null,
            jenis: h?.jenis ?? null,
          };
        }));
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
    () => susunMingguan(item, (t) => mingguKe(minggu, t), minggu.length),
    [item, minggu],
  );

  return { ulp, setUlp, bulan, setBulan, sistem, setSistem, minggu, nilai, sla, loading, galat, muat };
}
