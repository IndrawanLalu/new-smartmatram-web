"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Daftar tiang JTM — beserta induknya, yang bisa dibetulkan dari sini.
 *
 * Kenapa koreksi induk harus ada di web: bentuk jaringan ditentukan saat regu
 * menitik, dan sekali salah sambung, seluruh cabang di bawahnya ikut salah.
 * Membetulkannya dari lapangan berarti mendatangi tiangnya lagi; dari sini
 * cukup melihat petanya.
 */

export interface TiangBaris {
  id: string;
  kode: string;
  /** Semua namanya sekaligus — 'GNN-001 / PRM-001'. Dipakai di layar yang tidak
   *  punya konteks penyulang, karena di situ menyebut salah satu saja berarti
   *  menebak. Ini juga yang akan tertulis di papan nomor tiang bersama. */
  semuaKode: string;
  jumlahNama: number;
  penyulang: string;
  ulp: string;
  lat: number | null;
  lng: number | null;
  jenis: string | null;
  konstruksi: string | null;
  nomorLama: string | null;
  penanda: string | null;
  indukId: string | null;
  indukKode: string | null;
  jumlahAnak: number;
  segmen: string | null;
  jumlahSegmen: number;
  dikonfirmasiAt: string | null;
  terakhirDinilai: string | null;
  sumber: string | null;
}

/** Satu nama tiang di satu penyulang. */
export interface NamaTiang {
  tiangId: string;
  penyulang: string;
  kode: string;
}

export function useTiangDaftar(ulp: string | null) {
  const toast = useToast();
  const [baris, setBaris] = useState<TiangBaris[]>([]);
  const [nama, setNama] = useState<NamaTiang[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      // Dipaginasi: PostgREST memotong di 1.000 baris tanpa berkata apa-apa, dan
      // satu penyulang saja sudah bisa melewatinya (GUNUNG SARI 250 tiang).
      const data = await fetchAllRows<Record<string, unknown>>(() => {
        const q = supabaseBrowser
          .from("tiang_jtm_daftar")
          .select(
            "id,kode,semua_kode,jumlah_nama,penyulang,ulp,lat,lng,jenis,konstruksi,nomor_lama,penanda,induk_id,induk_kode,jumlah_anak,segmen,jumlah_segmen,dikonfirmasi_at,terakhir_dinilai,sumber",
          )
          .order("penyulang")
          .order("kode");
        return ulp ? q.eq("ulp", ulp) : q;
      });

      // Nama per penyulang dibaca terpisah, dan bukan sekadar untuk ditampilkan:
      // inilah yang menentukan tiang mana saja yang boleh jadi INDUK. Penyulang
      // yang berpangkal pada batang milik orang harus bisa menunjuk batang itu,
      // dan batang itu tidak akan pernah muncul kalau daftarnya disaring dari
      // penyulang pemiliknya.
      const semuaNama = await fetchAllRows<Record<string, unknown>>(() => {
        const q = supabaseBrowser
          .from("tiang_kode_penyulang")
          .select("tiang_id,penyulang,ulp,kode")
          .order("penyulang")
          .order("kode");
        return ulp ? q.eq("ulp", ulp) : q;
      });
      setNama(
        semuaNama.map((r) => ({
          tiangId: r.tiang_id as string,
          penyulang: r.penyulang as string,
          kode: r.kode as string,
        })),
      );

      setBaris(
        data.map((r) => ({
          id: r.id as string,
          kode: r.kode as string,
          semuaKode: (r.semua_kode as string) ?? (r.kode as string),
          jumlahNama: Number(r.jumlah_nama ?? 1),
          penyulang: r.penyulang as string,
          ulp: r.ulp as string,
          lat: r.lat !== null ? Number(r.lat) : null,
          lng: r.lng !== null ? Number(r.lng) : null,
          jenis: (r.jenis as string) ?? null,
          konstruksi: (r.konstruksi as string) ?? null,
          nomorLama: (r.nomor_lama as string) ?? null,
          penanda: (r.penanda as string) ?? null,
          indukId: (r.induk_id as string) ?? null,
          indukKode: (r.induk_kode as string) ?? null,
          jumlahAnak: Number(r.jumlah_anak ?? 0),
          segmen: (r.segmen as string) ?? null,
          jumlahSegmen: Number(r.jumlah_segmen ?? 0),
          dikonfirmasiAt: (r.dikonfirmasi_at as string) ?? null,
          terakhirDinilai: (r.terakhir_dinilai as string) ?? null,
          sumber: (r.sumber as string) ?? null,
        })),
      );
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("tiang_jtm_daftar")
          ? "View tiang_jtm_daftar belum lengkap — jalankan scripts/jtm-nama.sql di Supabase."
          : pesan,
      );
      setBaris([]);
      setNama([]);
    } finally {
      setLoading(false);
    }
  }, [ulp, toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const penyulangList = useMemo(
    () => [...new Set(baris.map((b) => b.penyulang))].sort(),
    [baris],
  );

  const ulpList = useMemo(() => [...new Set(baris.map((b) => b.ulp))].sort(), [baris]);

  /** Tiang yang dilewati sebuah penyulang, beserta namanya DI penyulang itu.
   *  Dipakai sebagai daftar calon induk. */
  const namaPerPenyulang = useMemo(() => {
    const m = new Map<string, NamaTiang[]>();
    for (const n of nama) {
      const d = m.get(n.penyulang) ?? [];
      d.push(n);
      m.set(n.penyulang, d);
    }
    for (const d of m.values()) d.sort((a, b) => a.kode.localeCompare(b.kode));
    return m;
  }, [nama]);

  /** Semua nama satu tiang. Tabel memakai ini supaya TIAP nama bisa diganti —
   *  sebelumnya hanya nama penyulang pemilik yang bisa, jadi nama tiang di
   *  penyulang yang menumpang tidak bisa dibetulkan dari mana pun. */
  const namaPerTiang = useMemo(() => {
    const m = new Map<string, NamaTiang[]>();
    for (const n of nama) {
      const d = m.get(n.tiangId) ?? [];
      d.push(n);
      m.set(n.tiangId, d);
    }
    for (const d of m.values()) d.sort((a, b) => a.penyulang.localeCompare(b.penyulang));
    return m;
  }, [nama]);

  /** Nama sebuah tiang di sebuah penyulang — untuk menampilkan induk dengan
   *  nama yang dikenali penyulang itu, bukan nama penyulang sebelah. */
  const namaDi = useCallback(
    (tiangId: string | null, penyulang: string) =>
      tiangId
        ? (nama.find((n) => n.tiangId === tiangId && n.penyulang === penyulang)?.kode ?? null)
        : null,
    [nama],
  );

  const ubahInduk = useCallback(
    async (tiangId: string, indukId: string | null, oleh: string) => {
      const { data, error } = await supabaseBrowser.rpc("ubah_induk_tiang_jtm", {
        p_tiang_id: tiangId,
        p_induk_id: indukId,
        p_oleh: oleh,
      });
      if (error) {
        // Penjaga database menolak lingkaran dan penyulang berbeda dengan
        // kalimatnya sendiri — teruskan, jangan diganti "gagal menyimpan".
        toast.error(error.message);
        return false;
      }

      const h = data as { kode: string; induk: string | null };
      // Dipatch di tempat, tidak memuat ulang ratusan baris untuk satu perubahan.
      setBaris((s) =>
        s.map((b) =>
          b.id === tiangId ? { ...b, indukId, indukKode: h.induk ?? null } : b,
        ),
      );
      toast.success(
        h.induk ? `${h.kode} kini menyambung ke ${h.induk}.` : `${h.kode} jadi pangkal.`,
      );
      return true;
    },
    [toast],
  );

  const ubahKode = useCallback(
    async (tiangId: string, penyulang: string, kode: string, oleh: string) => {
      const { error } = await supabaseBrowser.rpc("ubah_kode_tiang_jtm", {
        p_tiang_id: tiangId,
        p_penyulang: penyulang,
        p_kode: kode,
        p_oleh: oleh,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      // Nama tiang menyentuh banyak kolom turunan (semua_kode, induk_kode tiang
      // lain), jadi di sini memang dimuat ulang — bukan dipatch sebaris.
      await muat();
      return true;
    },
    [toast, muat],
  );

  const nomoriUlang = useCallback(
    async (penyulang: string, ulp: string, oleh: string) => {
      const { data, error } = await supabaseBrowser.rpc("nomori_ulang_penyulang_jtm", {
        p_penyulang: penyulang,
        p_ulp: ulp,
        p_oleh: oleh,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      const h = data as { tiang: number; diubah: number };
      toast.success(`${h.diubah} dari ${h.tiang} tiang ${penyulang} dinomori ulang.`);
      await muat();
      return true;
    },
    [toast, muat],
  );

  return {
    baris,
    penyulangList,
    ulpList,
    namaPerPenyulang,
    namaPerTiang,
    namaDi,
    loading,
    muat,
    ubahInduk,
    ubahKode,
    nomoriUlang,
  };
}
