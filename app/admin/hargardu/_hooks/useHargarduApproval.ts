"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

export interface PemeliharaanMenunggu {
  id: string;
  gardu_kode: string;
  ulp: string;
  penyulang: string | null;
  gardu_nama: string | null;
  gardu_alamat: string | null;
  daya_master: string | null;
  status: string;
  sumber: string;
  tgl_padam: string | null;
  tgl_selesai: string | null;
  regu_1: string[] | null;
  regu_2: string[] | null;
  petugas_nama: string | null;
  catatan_perbaikan: string | null;
  pr_keterangan: string | null;
  verified_note: string | null;
  item_terisi: number;
  item_tidak_normal: number;
  jumlah_foto: number;
  foto_wajib: number;
  usulan_menunggu: number;
}

/** Satu jawaban pemeriksaan, sudah dipasangkan dengan acuannya. */
export interface Periksa {
  itemKode: string;
  itemNama: string;
  kelompok: string;
  fasa: string;
  nilai: string | null;
  nilaiLabel: string | null;
  nilaiAngka: number | null;
  satuan: string | null;
  /**
   * Pilihan yang TIDAK dikenal acuan sengaja tidak dianggap normal diam-diam.
   * Kalau daftar acuan berubah sesudah pekerjaan dikirim, lebih baik barisnya
   * terlihat mencurigakan daripada hilang dari daftar temuan.
   */
  normal: boolean;
  catatan: string | null;
}

export interface Ukuran {
  tahap: "sebelum" | "sesudah";
  putaran_phasa: string | null;
  arus_r: number | null;
  arus_s: number | null;
  arus_t: number | null;
  arus_n: number | null;
  teg_rn: number | null;
  teg_sn: number | null;
  teg_tn: number | null;
  pertanahan_arrester: number | null;
  pertanahan_trafo: number | null;
  pertanahan_netral: number | null;
  perjurusan: Record<string, { arus?: Record<string, number | null> }> | null;
}

export interface FotoBukti {
  slot: string;
  nama: string;
  wajib: boolean;
  url: string;
}

/** Usulan koreksi master yang lahir dari pekerjaan ini. */
export interface UsulanSpek {
  id: string;
  field: string;
  nilai_lama: string | null;
  nilai_baru: string;
  bukti_foto: string[];
  status: string;
  diusulkan_at: string;
  pengusul_nama: string | null;
}

export interface Rincian {
  periksa: Periksa[];
  ukur: Ukuran[];
  foto: FotoBukti[];
  usulan: UsulanSpek[];
  spek: Record<string, string>;
  retingFuse: Record<string, Record<string, string>>;
}

export interface SaringDaftar {
  /** "YYYY-MM", atau kosong = semua bulan. */
  bulan: string;
  /** Hanya untuk UP3; role lain terkunci ke unitnya sendiri. */
  ulp: string;
  /** Kode atau nama gardu. */
  cari: string;
}

export function useHargarduApproval(user: CurrentUser, saring: SaringDaftar) {
  const [daftar, setDaftar] = useState<PemeliharaanMenunggu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memproses, setMemproses] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? (saring.ulp || null) : (user.unit ?? null);
  const cari = saring.cari.trim();

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabaseBrowser
        .from("pemeliharaan_gardu_ringkas")
        .select("*")
        .order("tgl_selesai", { ascending: false, nullsFirst: false });

      if (unit) q = q.eq("ulp", unit);

      // PENCARIAN GARDU MENGABAIKAN SARINGAN BULAN, dan itu disengaja.
      // Yang dicari orang saat mengetik kode gardu adalah "gardu ini pernah
      // dipelihara kapan saja" — bukan "pernah dipelihara bulan ini". Menahannya
      // di bulan berjalan membuat pencarian menjawab "tidak ada" untuk gardu
      // yang sebenarnya punya riwayat panjang.
      if (cari) {
        q = q.or(`gardu_kode.ilike.%${cari}%,gardu_nama.ilike.%${cari}%`);
      } else if (saring.bulan) {
        const [th, bl] = saring.bulan.split("-").map(Number);
        const awal = new Date(Date.UTC(th, bl - 1, 1)).toISOString();
        const akhir = new Date(Date.UTC(th, bl, 1)).toISOString();
        q = q.gte("tgl_selesai", awal).lt("tgl_selesai", akhir);
      }

      const { data, error: e } = await q;
      if (e) throw new Error(e.message);
      setDaftar((data ?? []) as unknown as PemeliharaanMenunggu[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar pemeliharaan");
    } finally {
      setLoading(false);
    }
  }, [unit, cari, saring.bulan]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const putuskan = useCallback(
    async (id: string, setuju: boolean, catatan?: string) => {
      setMemproses(id);
      try {
        const { error: e } = await supabaseBrowser.rpc("putuskan_pemeliharaan", {
          p_id: id,
          p_setuju: setuju,
          p_nama: user.name ?? user.email ?? null,
          p_catatan: catatan ?? null,
        });
        if (e) throw new Error(e.message);
        // Barisnya TIDAK dibuang: daftar ini memuat seluruh riwayat, bukan cuma
        // yang menunggu. Yang berubah statusnya, dan itu yang perlu terlihat.
        setDaftar((s) =>
          s.map((x) =>
            x.id === id
              ? { ...x, status: setuju ? "Diverifikasi" : "Ditolak", verified_note: catatan ?? null }
              : x,
          ),
        );
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

  /**
   * Keputusan atas satu usulan koreksi master, terpisah dari keputusan atas
   * pekerjaannya.
   *
   * Sengaja tidak ikut terbawa persetujuan pekerjaan: kVA yang berubah berarti
   * trafonya pernah diganti, dan itu pantas dilihat sendiri — bukan lolos
   * diam-diam karena pemeliharaannya secara umum sudah benar.
   */
  const putuskanUsulan = useCallback(
    async (id: string, setuju: boolean, alasan?: string) => {
      setMemproses(id);
      try {
        const { error: e } = await supabaseBrowser.rpc("putuskan_usulan", {
          p_id: id,
          p_setuju: setuju,
          p_nama: user.name ?? user.email ?? null,
          p_alasan: alasan ?? null,
        });
        if (e) throw new Error(e.message);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memutuskan usulan");
        return false;
      } finally {
        setMemproses(null);
      }
    },
    [user.name, user.email],
  );

  return { daftar, loading, error, memproses, putuskan, putuskanUsulan, muat, setError };
}

/**
 * Susun seluruh rincian satu pekerjaan.
 *
 * Acuan item dan opsi ikut diambil supaya kode dan label bisa dipasangkan —
 * yang tersimpan di catatan pemeriksaan adalah KODE pilihan, karena label boleh
 * berubah kapan saja tanpa memutus arti catatan lama.
 */
export async function ambilRincian(id: string): Promise<Rincian> {
  const [periksaRes, itemRes, opsiRes, ukurRes, fotoRes, fotoRefRes, usulanRes, indukRes] =
    await Promise.all([
      supabaseBrowser
        .from("pemeliharaan_gardu_periksa")
        .select("item_kode,fasa,nilai,nilai_angka,catatan")
        .eq("pemeliharaan_id", id),
      supabaseBrowser
        .from("hargardu_item_ref")
        .select("kode,nama,kelompok,satuan,urutan,per_fasa"),
      supabaseBrowser.from("hargardu_opsi_ref").select("item_kode,kode,label,normal"),
      supabaseBrowser
        .from("pemeliharaan_gardu_ukur")
        .select(
          "tahap,putaran_phasa,arus_r,arus_s,arus_t,arus_n,teg_rn,teg_sn,teg_tn," +
            "pertanahan_arrester,pertanahan_trafo,pertanahan_netral,perjurusan",
        )
        .eq("pemeliharaan_id", id),
      supabaseBrowser
        .from("pemeliharaan_gardu_foto")
        .select("slot,url")
        .eq("pemeliharaan_id", id),
      supabaseBrowser.from("hargardu_foto_ref").select("kode,nama,wajib,urutan"),
      supabaseBrowser
        .from("master_usulan")
        .select("id,field,nilai_lama,nilai_baru,bukti_foto,status,diusulkan_at,pengusul_nama")
        .eq("sumber_modul", "pemeliharaan_gardu")
        .eq("sumber_id", id)
        .order("field"),
      supabaseBrowser
        .from("pemeliharaan_gardu")
        .select("spek,reting_fuse")
        .eq("id", id)
        .maybeSingle(),
    ]);

  const item = new Map(
    (itemRes.data ?? []).map((i: any) => [i.kode, i]),
  );
  const opsi = new Map(
    (opsiRes.data ?? []).map((o: any) => [`${o.item_kode}|${o.kode}`, o]),
  );

  const periksa: Periksa[] = (periksaRes.data ?? [])
    .map((p: any) => {
      const i = item.get(p.item_kode);
      const o = p.nilai ? opsi.get(`${p.item_kode}|${p.nilai}`) : null;
      return {
        itemKode: p.item_kode,
        itemNama: i?.nama ?? p.item_kode,
        kelompok: i?.kelompok ?? "Lainnya",
        fasa: p.fasa,
        nilai: p.nilai ?? null,
        nilaiLabel: o?.label ?? null,
        nilaiAngka: p.nilai_angka ?? null,
        satuan: i?.satuan ?? null,
        normal: p.nilai ? !!o?.normal : true,
        catatan: p.catatan ?? null,
        _urutan: i?.urutan ?? 999,
      };
    })
    .sort((a: any, b: any) => a._urutan - b._urutan || a.fasa.localeCompare(b.fasa))
    .map(({ _urutan, ...r }: any) => r as Periksa);

  const fotoRef = new Map((fotoRefRes.data ?? []).map((f: any) => [f.kode, f]));
  const foto: FotoBukti[] = (fotoRes.data ?? [])
    .map((f: any) => ({
      slot: f.slot,
      nama: fotoRef.get(f.slot)?.nama ?? f.slot,
      wajib: !!fotoRef.get(f.slot)?.wajib,
      url: f.url,
      _urutan: fotoRef.get(f.slot)?.urutan ?? 999,
    }))
    .sort((a: any, b: any) => a._urutan - b._urutan)
    .map(({ _urutan, ...r }: any) => r as FotoBukti);

  const usulan: UsulanSpek[] = (usulanRes.data ?? []).map((u: any) => ({
    id: u.id,
    field: u.field,
    nilai_lama: u.nilai_lama?.nilai ?? null,
    nilai_baru: String(u.nilai_baru?.nilai ?? ""),
    bukti_foto: u.bukti_foto ?? [],
    status: u.status,
    diusulkan_at: u.diusulkan_at,
    pengusul_nama: u.pengusul_nama ?? null,
  }));

  return {
    periksa,
    ukur: (ukurRes.data ?? []) as unknown as Ukuran[],
    foto,
    usulan,
    spek: (indukRes.data as any)?.spek ?? {},
    retingFuse: (indukRes.data as any)?.reting_fuse ?? {},
  };
}

/** Ketidakseimbangan beban, persen. Dihitung, tidak pernah diketik. */
export const ketidakseimbangan = (u?: Ukuran): number | null => {
  if (!u) return null;
  const a = [u.arus_r, u.arus_s, u.arus_t];
  if (a.some((v) => v === null || v === undefined || !Number.isFinite(Number(v)))) return null;
  const n = a.map(Number);
  const rata = (n[0] + n[1] + n[2]) / 3;
  if (rata <= 0) return null;
  return (Math.max(...n.map((v) => Math.abs(v - rata))) / rata) * 100;
};
