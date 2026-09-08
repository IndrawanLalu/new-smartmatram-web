"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

export interface InspeksiMenunggu {
  id: string;
  gardu_kode: string;
  ulp: string;
  penyulang: string | null;
  gardu_nama: string | null;
  gardu_alamat: string | null;
  tgl_mulai: string;
  tgl_selesai: string | null;
  status: string;
  inspektor_nama: string | null;
  petugas_2: string | null;
  catatan: string | null;
  verified_note: string | null;
  tiang_aktif: number;
  sudah_diperiksa: number;
  tiang_baru: number;
  jumlah_temuan: number;
  panjang_km: number;
}

/** Bagaimana sebuah tiang berubah selama inspeksi ini. */
export type Perubahan = "lama" | "baru" | "berubah" | "hilang";

export interface TiangBanding {
  id: string;
  kode: string;
  lat: number | null;
  lng: number | null;
  indukId: string | null;
  jurusan: string | null;
  kondisi: string | null;
  perubahan: Perubahan;
  /** Ringkasan apa yang berubah, dibaca dari jejak audit. */
  rincian: string[];
}

export interface Penghantar {
  jurusan: string;
  nomor_kabel: number;
  jenis: string | null;
  ukuran: string | null;
  jumlah_gawang: number;
  panjang_km: number;
}

export interface RutePerJurusan {
  jurusan: string;
  jumlah_tiang: number;
  panjang_rute_km: number;
  panjang_penghantar_km: number;
  tiang_tanpa_kabel: number;
  gawang_terputus: number;
}

/**
 * Bentang yang kabelnya tercatat tapi hulunya belum jelas.
 *
 * Bukan daftar kesalahan — daftar pekerjaan. Tiap baris berarti ada kabel di
 * sebuah tiang yang belum ketahuan datang dari mana, jadi panjangnya belum ikut
 * terhitung. Diperlihatkan saat persetujuan karena di situlah orang masih ingat
 * jaringannya, dan perbaikannya satu ketukan di lapangan.
 */
export interface GawangTerputus {
  jurusan: string;
  tiang_kode: string;
  nomor_kabel: number;
  ukuran: string | null;
  panjang_m: number;
  hulu_kode: string | null;
}

export interface Temuan {
  tiang_kode: string;
  temuan: string;
  urgensi: string;
}

const angka = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

export function useApprovalJtr(user: CurrentUser) {
  const [daftar, setDaftar] = useState<InspeksiMenunggu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memproses, setMemproses] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? null : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabaseBrowser
        .from("jtr_penyapuan")
        .select("*")
        .in("status", ["Selesai", "Ditolak"])
        .order("tgl_selesai", { ascending: true, nullsFirst: false });
      if (unit) q = q.eq("ulp", unit);
      const { data, error: e } = await q;
      if (e) throw new Error(e.message);
      setDaftar((data ?? []) as unknown as InspeksiMenunggu[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar inspeksi");
    } finally {
      setLoading(false);
    }
  }, [unit]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const putuskan = useCallback(
    async (id: string, setuju: boolean, catatan?: string) => {
      setMemproses(id);
      try {
        const { error: e } = await supabaseBrowser.rpc("putuskan_inspeksi_jtr", {
          p_id: id,
          p_setuju: setuju,
          p_nama: user.name ?? user.email ?? null,
          p_catatan: catatan ?? null,
        });
        if (e) throw new Error(e.message);
        setDaftar((s) => s.filter((x) => x.id !== id));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal menyimpan keputusan");
        return false;
      } finally {
        setMemproses(null);
      }
    },
    [user.name, user.email],
  );

  return { daftar, loading, error, memproses, putuskan, muat, setError };
}

/**
 * Susun keadaan jaringan SEBELUM dan SESUDAH satu inspeksi.
 *
 * Tidak ada tabel snapshot, dan memang tidak perlu: `created_at` menjawab tiang
 * mana yang baru, `status_hidup` menjawab mana yang hilang, dan `master_audit`
 * menjawab mana yang datanya dikoreksi. Snapshot berarti satu lagi salinan
 * kebenaran yang harus dijaga tetap sinkron — dan salinan seperti itu selalu
 * berakhir melenceng.
 */
export async function ambilPerbandingan(
  inspeksi: InspeksiMenunggu,
): Promise<{
  tiang: TiangBanding[];
  temuan: Temuan[];
  gardu: { lat: number; lng: number } | null;
  penghantar: Penghantar[];
  rute: RutePerJurusan[];
  terputus: GawangTerputus[];
}> {
  // Jendela waktu inspeksi: dari tanggal mulai sampai akhir hari selesainya.
  const mulai = new Date(`${inspeksi.tgl_mulai}T00:00:00`).toISOString();
  const selesai = new Date(
    `${inspeksi.tgl_selesai ?? inspeksi.tgl_mulai}T23:59:59`,
  ).toISOString();

  const [tiangRes, auditRes, temuanRes, garduRes, penghantarRes, ruteRes, terputusRes] =
    await Promise.all([
    supabaseBrowser
      .from("tiang")
      .select("id,kode,lat,lng,induk_id,jurusan,kondisi,status_hidup,created_at,aktif_sampai")
      .eq("gardu_kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp),
    supabaseBrowser
      .from("master_audit")
      .select("entitas_kode,field,nilai_lama,nilai_baru,pada")
      .eq("entitas", "tiang")
      .eq("ulp", inspeksi.ulp)
      .gte("pada", mulai)
      .lte("pada", selesai),
    supabaseBrowser
      .from("inspeksi_jtr_temuan")
      .select("tiang_kode,temuan,urgensi")
      .eq("inspeksi_id", inspeksi.id),
    supabaseBrowser
      .from("gardu")
      .select("lat,lng")
      .eq("kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp)
      .maybeSingle(),
    supabaseBrowser
      .from("gardu_jtr_penghantar")
      .select("jurusan,nomor_kabel,jenis,ukuran,jumlah_gawang,panjang_km")
      .eq("gardu_kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp)
      .order("jurusan")
      .order("nomor_kabel"),
    supabaseBrowser
      .from("gardu_jtr_panjang")
      .select(
        "jurusan,jumlah_tiang,panjang_rute_km,panjang_penghantar_km,tiang_tanpa_kabel,gawang_terputus",
      )
      .eq("gardu_kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp)
      .order("jurusan"),
    supabaseBrowser
      .from("jtr_gawang_terputus")
      .select("jurusan,tiang_kode,nomor_kabel,ukuran,panjang_m,hulu_kode")
      .eq("gardu_kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp)
      .order("tiang_kode"),
  ]);

  const audit = auditRes.data ?? [];
  const perKode = new Map<string, string[]>();
  for (const a of audit) {
    const list = perKode.get(a.entitas_kode) ?? [];
    list.push(`${a.field}: ${ringkasNilai(a.nilai_lama)} → ${ringkasNilai(a.nilai_baru)}`);
    perKode.set(a.entitas_kode, list);
  }

  const tiang: TiangBanding[] = (tiangRes.data ?? []).map((t) => {
    const dibuat = new Date(t.created_at).toISOString();
    const rincian = perKode.get(t.kode) ?? [];

    let perubahan: Perubahan = "lama";
    if (t.status_hidup !== "aktif") perubahan = "hilang";
    else if (dibuat >= mulai && dibuat <= selesai) perubahan = "baru";
    else if (rincian.length > 0) perubahan = "berubah";

    return {
      id: t.id,
      kode: t.kode,
      lat: angka(t.lat),
      lng: angka(t.lng),
      indukId: t.induk_id ?? null,
      jurusan: t.jurusan ?? null,
      kondisi: t.kondisi ?? null,
      perubahan,
      rincian,
    };
  });

  const g = garduRes.data;
  const gardu =
    g && angka(g.lat) !== null && angka(g.lng) !== null
      ? { lat: angka(g.lat)!, lng: angka(g.lng)! }
      : null;

  return {
    tiang,
    temuan: (temuanRes.data ?? []) as Temuan[],
    gardu,
    penghantar: (penghantarRes.data ?? []) as unknown as Penghantar[],
    rute: (ruteRes.data ?? []) as unknown as RutePerJurusan[],
    terputus: (terputusRes.data ?? []) as unknown as GawangTerputus[],
  };
}

function ringkasNilai(v: unknown): string {
  if (v === null || v === undefined) return "kosong";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("lat" in o) return `${Number(o.lat).toFixed(5)}, ${Number(o.lng).toFixed(5)}`;
    return Object.entries(o)
      .map(([k, val]) => `${k}=${Array.isArray(val) ? val.join("→") : String(val)}`)
      .join(", ");
  }
  return String(v);
}
