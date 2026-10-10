"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Koreksi isian inspeksi JTM dari peta (`scripts/jtm-koreksi-isian.sql`,
 * 10 Okt 2026):
 *   lapis 1 — pilih tiang awal & akhir di satu penyulang, pilih isian & nilai
 *             yang benar, lihat pratinjau, Terapkan (mengikuti jalur kabel);
 *   lapis 2 — daftar tiang yang isiannya beda sendiri dari tiang sebelum &
 *             sesudahnya, "Samakan" satu per satu atau semuanya.
 */

export interface ItemIsian { kode: string; nama: string; dimensi: string }
export interface OpsiIsian { kode: string; label: string }
export interface BarisPratinjau { urut: number; tiang_id: string; tiang_kode: string; nilai_lama: string | null; label_lama: string | null; ada_jawaban: boolean }
export interface Janggal {
  tiang_id: string; tiang_kode: string; penyulang: string;
  nilai: string; label: string | null; usulan: string; label_usulan: string | null;
  lat: number; lng: number;
}
export interface SorotKoreksi { id: string; lat: number; lng: number; jenis: "ujung" | "janggal" }

/** Isian yang cocok dicari "janggal"-nya: spesifikasi yang seragam sepanjang jalur. */
export const ITEM_JANGGAL = ["ukuran_konduktor", "jenis_konduktor"];

export function useKoreksiIsian(oleh: string) {
  const toast = useToast();
  const [aktif, setAktif] = useState(false);
  const [item, setItem] = useState("ukuran_konduktor");
  const [daftarItem, setDaftarItem] = useState<ItemIsian[]>([]);
  const [opsi, setOpsi] = useState<OpsiIsian[]>([]);
  const [nilai, setNilai] = useState("");
  const [dari, setDari] = useState<TiangPeta | null>(null);
  const [ke, setKe] = useState<TiangPeta | null>(null);
  const [pratinjau, setPratinjau] = useState<BarisPratinjau[] | null>(null);
  const [janggal, setJanggal] = useState<Janggal[] | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Daftar isian yang bisa dikoreksi (pilihan, sekali per tiang / per kabel).
  useEffect(() => {
    if (!aktif || daftarItem.length) return;
    let hidup = true;
    supabaseBrowser
      .from("jtm_item_ref")
      .select("kode,nama,dimensi")
      .in("dimensi", ["tunggal", "sirkit"])
      .eq("tipe", "pilihan")
      .order("urutan")
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error) setGalat(error.message);
        else setDaftarItem((data ?? []) as ItemIsian[]);
      });
    return () => { hidup = false; };
  }, [aktif, daftarItem.length]);

  // Pilihan nilai untuk isian terpilih.
  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    supabaseBrowser
      .from("jtm_opsi_ref")
      .select("kode,label")
      .eq("item_kode", item)
      .eq("aktif", true)
      .order("urutan")
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error) setGalat(error.message);
        else setOpsi((data ?? []) as OpsiIsian[]);
      });
    return () => { hidup = false; };
  }, [aktif, item]);

  const muatPratinjau = useCallback(async (a: TiangPeta, b: TiangPeta, kodeItem: string) => {
    setSibuk(true);
    const { data, error } = await supabaseBrowser.rpc("pratinjau_koreksi_isian_jtm", {
      p_dari: a.id, p_ke: b.id, p_penyulang: a.kelompok, p_item: kodeItem,
    });
    setSibuk(false);
    if (error) {
      setPratinjau(null);
      setGalat(error.message);
      return;
    }
    setGalat(null);
    setPratinjau((data ?? []) as BarisPratinjau[]);
  }, []);

  /** Klik tiang di peta: pertama = awal, kedua = akhir, ketiga = mulai lagi. */
  const pilih = useCallback(
    (t: TiangPeta) => {
      if (t.jaringan !== "jtm") return;
      if (!dari || ke) {
        setDari(t);
        setKe(null);
        setPratinjau(null);
        setGalat(null);
        return;
      }
      if (t.kelompok.toUpperCase() !== dari.kelompok.toUpperCase()) {
        setGalat(`Tiang akhir harus di penyulang ${dari.kelompok} juga.`);
        return;
      }
      setKe(t);
      void muatPratinjau(dari, t, item);
    },
    [dari, ke, item, muatPratinjau],
  );

  const gantiItem = (k: string) => {
    setItem(k);
    setNilai("");
    setJanggal(null);
    if (dari && ke) void muatPratinjau(dari, ke, k);
  };

  const terapkan = async (alasan: string): Promise<boolean> => {
    if (!dari || !ke || !nilai) return false;
    setSibuk(true);
    const { data, error } = await supabaseBrowser.rpc("koreksi_isian_jtm", {
      p_dari: dari.id, p_ke: ke.id, p_penyulang: dari.kelompok, p_item: item, p_nilai: nilai, p_alasan: alasan, p_oleh: oleh,
    });
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    const h = data as { item: string; nilai: string; diubah: number; sudah_sama: number; belum_dinilai: number; dari: string; ke: string };
    toast.success(
      `${h.item} ${h.dari} – ${h.ke}: ${h.diubah} tiang jadi ${h.nilai}` +
        (h.sudah_sama ? ` · ${h.sudah_sama} sudah benar` : "") +
        (h.belum_dinilai ? ` · ${h.belum_dinilai} belum pernah dinilai` : ""),
    );
    void muatPratinjau(dari, ke, item);
    return true;
  };

  const cariJanggal = async (ulp: string | null) => {
    setSibuk(true);
    const { data, error } = await supabaseBrowser.rpc("jtm_isian_janggal", { p_ulp: ulp, p_item: item });
    setSibuk(false);
    if (error) {
      setGalat(error.message);
      return;
    }
    setGalat(null);
    setJanggal((data ?? []) as Janggal[]);
  };

  /** Satu tiang disamakan dengan tiang sebelum & sesudahnya. */
  const samakan = async (j: Janggal, diam = false): Promise<boolean> => {
    const { error } = await supabaseBrowser.rpc("koreksi_isian_jtm", {
      p_dari: j.tiang_id, p_ke: j.tiang_id, p_penyulang: j.penyulang, p_item: item, p_nilai: j.usulan,
      p_alasan: "Disamakan dengan tiang sebelum & sesudahnya (isian janggal)", p_oleh: oleh,
    });
    if (error) {
      toast.error(`${j.tiang_kode}: ${error.message}`);
      return false;
    }
    setJanggal((d) => (d ?? []).filter((x) => x.tiang_id !== j.tiang_id));
    if (!diam) toast.success(`${j.tiang_kode} disamakan jadi ${j.label_usulan ?? j.usulan}.`);
    return true;
  };

  const samakanSemua = async () => {
    setSibuk(true);
    let n = 0;
    for (const j of janggal ?? []) {
      if (!(await samakan(j, true))) break;
      n += 1;
    }
    setSibuk(false);
    if (n) toast.success(`${n} tiang disamakan dengan tiang sebelum & sesudahnya.`);
  };

  const mulai = () => setAktif(true);
  const keluar = () => {
    setAktif(false);
    setDari(null);
    setKe(null);
    setPratinjau(null);
    setJanggal(null);
    setNilai("");
    setGalat(null);
  };

  /** Lingkaran di peta: ujung rentang, tiang di jalur, tiang janggal. */
  const sorot: SorotKoreksi[] = !aktif
    ? []
    : [
        ...(dari ? [{ id: `u-${dari.id}`, lat: dari.lat, lng: dari.lng, jenis: "ujung" as const }] : []),
        ...(ke ? [{ id: `u-${ke.id}`, lat: ke.lat, lng: ke.lng, jenis: "ujung" as const }] : []),
        ...(janggal ?? []).map((j) => ({ id: `j-${j.tiang_id}`, lat: j.lat, lng: j.lng, jenis: "janggal" as const })),
      ];

  return {
    aktif, mulai, keluar, item, gantiItem, daftarItem, opsi, nilai, setNilai,
    dari, ke, pilih, pratinjau, terapkan, janggal, cariJanggal, samakan, samakanSemua, sibuk, galat, sorot,
  };
}
