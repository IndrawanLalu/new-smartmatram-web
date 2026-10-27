"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { hariIniWita } from "../_lib/realisasiHarian";
import { JENIS_DARI_KATEGORI, kunciGardu, susunBaris, type ItemPro, type KolomJenis } from "../_lib/proNtb";

/**
 * Data Copy to PRO NTB: `realisasi_rentang` (rentang tanggal), kolom tetap per
 * jenis (`pro_ntb_jenis`, scripts/pro-ntb-jenis.sql) dan alamat gardu dari
 * master untuk LOKASI PEKERJAAN.
 */

const POTONG = 200;

async function ambilAlamat(item: ItemPro[]) {
  const kode = [...new Set(item.map((x) => x.objek.toUpperCase()))].filter((k) => k && k !== "—");
  const peta = new Map<string, string>();
  for (let i = 0; i < kode.length; i += POTONG) {
    const { data, error } = await supabaseBrowser
      .from("gardu")
      .select("kode,ulp,alamat,nama")
      .in("kode", kode.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    for (const g of data ?? []) {
      const a = (g.alamat || g.nama || "").trim();
      const k = kunciGardu(g.ulp ?? "", g.kode);
      if (a && !peta.has(k)) peta.set(k, a);
    }
  }
  return peta;
}

/** Label kategori Pemeliharaan Jaringan per id catatan (`sumber_id`). */
async function ambilKategori(id: string[]) {
  const peta = new Map<string, string>();
  for (let i = 0; i < id.length; i += POTONG) {
    const { data, error } = await supabaseBrowser
      .from("pemeliharaan_jaringan_daftar")
      .select("id,kategori_label")
      .in("id", id.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.kategori_label) peta.set(r.id, r.kategori_label);
  }
  return peta;
}

export function useProNtb(ulpAwal: string) {
  const [ulp, gantiUlp] = useState(ulpAwal);
  const [dari, gantiDari] = useState(hariIniWita);
  const [sampai, gantiSampai] = useState(hariIniWita);
  const [item, setItem] = useState<ItemPro[]>([]);
  const [alamat, setAlamat] = useState<Map<string, string>>(new Map());
  const [jenis, setJenis] = useState<Map<string, KolomJenis>>(new Map());
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const [rows, kolom] = await Promise.all([
          // Diurutkan pada kunci unik: tanpa itu halaman 1.000-an berikutnya bisa
          // dobel / melompati baris (sebulan semua ULP > 1.000 baris, 27 Okt 2026).
          fetchAllRows<Record<string, unknown>>(() =>
            supabaseBrowser
              .rpc("realisasi_rentang", { p_ulp: ulp, p_dari: dari, p_sampai: sampai })
              .order("tgl")
              .order("sumber")
              .order("sumber_id"),
          ),
          supabaseBrowser.from("pro_ntb_jenis").select("kunci,jenis_pekerjaan"),
        ]);
        if (kolom.error) throw new Error(`Kolom per jenis gagal dibaca: ${kolom.error.message}`);
        const idKategori = rows.filter((r) => r.kunci === JENIS_DARI_KATEGORI && r.sumber_id).map((r) => String(r.sumber_id));
        const kategori = await ambilKategori(idKategori);
        const isi: ItemPro[] = rows.map((r) => ({
          tgl: r.tgl as string,
          kunci: r.kunci as string,
          bagian: (r.bagian as string | null) ?? null,
          ulp: (r.ulp as string) ?? "",
          objek: (r.objek as string) || "—",
          rincian: (r.rincian as string | null) ?? null,
          petugas: (r.petugas as string | null) ?? null,
          waktu: r.waktu ? String(r.waktu).slice(0, 5) : null,
          km: r.km === null || r.km === undefined ? null : Number(r.km),
          disetujui: !!r.disetujui,
          kategori: r.sumber_id ? kategori.get(String(r.sumber_id)) ?? null : null,
        }));
        const peta = await ambilAlamat(isi);
        if (!hidup) return;
        setItem(isi);
        setAlamat(peta);
        setJenis(new Map((kolom.data as KolomJenis[]).map((k) => [k.kunci, k])));
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

  // "Memuat" dinyalakan oleh PEMICUNYA, bukan di dalam efek.
  const mulai = () => { setLoading(true); setGalat(null); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setDari = (t: string) => { if (t) { mulai(); gantiDari(t); if (t > sampai) gantiSampai(t); } };
  const setSampai = (t: string) => { if (t) { mulai(); gantiSampai(t); if (t < dari) gantiDari(t); } };

  const baris = useMemo(() => susunBaris(item, jenis, alamat), [item, jenis, alamat]);

  return { ulp, setUlp, dari, setDari, sampai, setSampai, baris, jenis, loading, galat, muat };
}
