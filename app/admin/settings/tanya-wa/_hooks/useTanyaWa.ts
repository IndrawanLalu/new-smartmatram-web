"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { rapikan } from "@/lib/wa/tanya/rapikan";

/**
 * Data halaman Tanya Jawab WA: fungsi (+ bagian dari kode), kata kunci,
 * contoh, kamus. Tulis lewat supabaseBrowser — RLS hanya mengizinkan UP3.
 * Sesudah tiap mutasi state lokal di-patch, tidak membaca ulang semuanya.
 */

export type NamaSaringan = "ulp" | "periode" | "gardu" | "penyulang";

export interface FungsiWa {
  kode: string;
  nama: string;
  aktif: boolean;
  updated_at: string;
  updated_by: string | null;
  /** Dari kode; null = fungsi sudah dihapus dari kode (baris yatim). */
  kodeInfo: { saringan: NamaSaringan[]; wajib: NamaSaringan[] } | null;
}

export interface KataWa {
  id: string;
  fungsi_kode: string;
  kata: string;
  bobot: number;
}

export interface ContohWa {
  id: string;
  fungsi_kode: string;
  teks: string;
  urutan: number;
}

export interface KamusWa {
  id: string;
  dari: string;
  jadi: string;
}

type Galat = string | null;

const pesan = (e: { message: string; code?: string } | null): Galat =>
  !e ? null : e.code === "23505" ? "Sudah ada." : e.code === "42501" ? "Hanya UP3 yang boleh mengubah." : e.message;

export function useTanyaWa(namaPengubah: string) {
  const [fungsi, setFungsi] = useState<FungsiWa[]>([]);
  const [kata, setKata] = useState<KataWa[]>([]);
  const [contoh, setContoh] = useState<ContohWa[]>([]);
  const [kamus, setKamus] = useState<KamusWa[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState<Galat>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    // Rute ini sekaligus mengisi benih fungsi baru — tabel dibaca sesudahnya.
    const res = await fetch("/api/wa-tanya/fungsi");
    const info = (await res.json().catch(() => null)) as (FungsiWa["kodeInfo"] & { kode: string })[] | { error: string } | null;
    if (!res.ok || !Array.isArray(info)) {
      setGalatMuat((info as { error?: string } | null)?.error ?? "Gagal memuat");
      setMemuat(false);
      return;
    }
    const [f, k, c, m] = await Promise.all([
      supabaseBrowser.from("wa_tanya_fungsi").select("kode,nama,aktif,updated_at,updated_by"),
      supabaseBrowser.from("wa_tanya_kata").select("id,fungsi_kode,kata,bobot").order("bobot", { ascending: false }).order("kata"),
      supabaseBrowser.from("wa_tanya_contoh").select("id,fungsi_kode,teks,urutan").order("urutan"),
      supabaseBrowser.from("wa_tanya_kamus").select("id,dari,jadi").order("jadi").order("dari"),
    ]);
    const err = f.error ?? k.error ?? c.error ?? m.error;
    if (err) {
      setGalatMuat(err.message);
      setMemuat(false);
      return;
    }
    const perKode = new Map(info.map((i) => [i.kode, i]));
    const urutKode = info.map((i) => i.kode);
    setFungsi(
      (f.data ?? [])
        .map((x) => {
          const i = perKode.get(x.kode);
          return { ...x, kodeInfo: i ? { saringan: i.saringan, wajib: i.wajib } : null };
        })
        .sort((a, b) => (urutKode.indexOf(a.kode) + 1 || 99) - (urutKode.indexOf(b.kode) + 1 || 99)),
    );
    setKata((k.data ?? []).map((x) => ({ ...x, bobot: Number(x.bobot) })));
    setContoh(c.data ?? []);
    setKamus(m.data ?? []);
    setGalatMuat(null);
    setMemuat(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat awal dari server
    void muat();
  }, [muat]);

  async function ubahAktif(kode: string, aktif: boolean): Promise<Galat> {
    const updated_at = new Date().toISOString();
    const { error } = await supabaseBrowser.from("wa_tanya_fungsi").update({ aktif, updated_at, updated_by: namaPengubah }).eq("kode", kode);
    if (!error) setFungsi((p) => p.map((f) => (f.kode === kode ? { ...f, aktif, updated_at, updated_by: namaPengubah } : f)));
    return pesan(error);
  }

  async function tambahKata(fungsi_kode: string, teks: string, bobot: number): Promise<Galat> {
    const k = rapikan(teks);
    if (!k) return "Kata kosong.";
    const { data, error } = await supabaseBrowser.from("wa_tanya_kata").insert({ fungsi_kode, kata: k, bobot }).select("id,fungsi_kode,kata,bobot").single();
    if (data) setKata((p) => [...p, { ...data, bobot: Number(data.bobot) }]);
    return pesan(error);
  }

  async function ubahBobot(id: string, bobot: number): Promise<Galat> {
    const { error } = await supabaseBrowser.from("wa_tanya_kata").update({ bobot }).eq("id", id);
    if (!error) setKata((p) => p.map((k) => (k.id === id ? { ...k, bobot } : k)));
    return pesan(error);
  }

  async function hapusKata(id: string): Promise<Galat> {
    const { error } = await supabaseBrowser.from("wa_tanya_kata").delete().eq("id", id);
    if (!error) setKata((p) => p.filter((k) => k.id !== id));
    return pesan(error);
  }

  async function tambahContoh(fungsi_kode: string, teks: string): Promise<Galat> {
    const t = teks.trim();
    if (!t) return "Contoh kosong.";
    const urutan = Math.max(-1, ...contoh.filter((c) => c.fungsi_kode === fungsi_kode).map((c) => c.urutan)) + 1;
    const { data, error } = await supabaseBrowser.from("wa_tanya_contoh").insert({ fungsi_kode, teks: t, urutan }).select("id,fungsi_kode,teks,urutan").single();
    if (data) setContoh((p) => [...p, data]);
    return pesan(error);
  }

  async function hapusContoh(id: string): Promise<Galat> {
    const { error } = await supabaseBrowser.from("wa_tanya_contoh").delete().eq("id", id);
    if (!error) setContoh((p) => p.filter((c) => c.id !== id));
    return pesan(error);
  }

  /** Tukar urutan dengan tetangganya (naik = -1, turun = +1). */
  async function geserContoh(id: string, arah: -1 | 1): Promise<Galat> {
    const satu = contoh.find((c) => c.id === id);
    if (!satu) return null;
    const daftar = contoh.filter((c) => c.fungsi_kode === satu.fungsi_kode).sort((a, b) => a.urutan - b.urutan);
    const i = daftar.findIndex((c) => c.id === id);
    const lain = daftar[i + arah];
    if (!lain) return null;
    // Urutan bisa sama (benih lama) — pakai posisi, bukan nilai lama.
    const [ua, ub] = [i + arah, i];
    const [r1, r2] = await Promise.all([
      supabaseBrowser.from("wa_tanya_contoh").update({ urutan: ua }).eq("id", satu.id),
      supabaseBrowser.from("wa_tanya_contoh").update({ urutan: ub }).eq("id", lain.id),
    ]);
    const error = r1.error ?? r2.error;
    if (!error) setContoh((p) => p.map((c) => (c.id === satu.id ? { ...c, urutan: ua } : c.id === lain.id ? { ...c, urutan: ub } : c)));
    return pesan(error);
  }

  async function simpanKamus(id: string | null, dariTeks: string, jadiTeks: string): Promise<Galat> {
    const dari = rapikan(dariTeks);
    const jadi = rapikan(jadiTeks);
    if (!dari || !jadi) return "Isi keduanya.";
    if (dari === jadi) return "Ketikan dan artinya sama.";
    if (id) {
      const { error } = await supabaseBrowser.from("wa_tanya_kamus").update({ dari, jadi }).eq("id", id);
      if (!error) setKamus((p) => p.map((k) => (k.id === id ? { ...k, dari, jadi } : k)));
      return pesan(error);
    }
    const { data, error } = await supabaseBrowser.from("wa_tanya_kamus").insert({ dari, jadi }).select("id,dari,jadi").single();
    if (data) setKamus((p) => [...p, data]);
    return pesan(error);
  }

  async function hapusKamus(id: string): Promise<Galat> {
    const { error } = await supabaseBrowser.from("wa_tanya_kamus").delete().eq("id", id);
    if (!error) setKamus((p) => p.filter((k) => k.id !== id));
    return pesan(error);
  }

  return {
    fungsi, kata, contoh, kamus, memuat, galatMuat,
    ubahAktif, tambahKata, ubahBobot, hapusKata, tambahContoh, hapusContoh, geserContoh, simpanKamus, hapusKamus,
  };
}

export type TanyaWa = ReturnType<typeof useTanyaWa>;
