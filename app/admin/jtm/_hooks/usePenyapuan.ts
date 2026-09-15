"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Penyapuan JTM yang dikirim regu, beserta keputusannya.
 *
 * KENAPA LAYAR INI MENENTUKAN SEGALANYA: `tiang_kondisi_terakhir` — dasar semua
 * angka JTM, termasuk daftar Perlu Perbaikan — hanya memuat penyapuan berstatus
 * 'Diverifikasi'. Selama tidak ada yang memutuskan, seluruh pekerjaan regu
 * tersimpan rapi di basis data dan tidak muncul di mana pun. Itu persis yang
 * terjadi pada uji lapangan pertama.
 */

export interface Penyapuan {
  id: string;
  segmenId: string | null;
  segmenNama: string | null;
  penyulang: string;
  ulp: string;
  tier: string;
  status: string;
  tglMulai: string | null;
  tglSelesai: string | null;
  petugasNama: string | null;
  catatan: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifiedNote: string | null;
  tiangSegmen: number;
  tiangDinilai: number;
  jawaban: number;
  temuan: number;
}

export interface JawabanTiang {
  tiangId: string;
  tiangKode: string;
  jarakM: number | null;
  dinilaiAt: string | null;
  isi: {
    itemKode: string;
    itemNama: string;
    bagian: string;
    nilai: string | null;
    nilaiLabel: string | null;
    normal: boolean;
    catatan: string | null;
    fotoUrl: string | null;
  }[];
}

export function usePenyapuan(ulp: string | null) {
  const toast = useToast();
  const [baris, setBaris] = useState<Penyapuan[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      let q = supabaseBrowser
        .from("inspeksi_jtm_ringkas")
        .select(
          "id,segmen_id,segmen_nama,penyulang,ulp,tier,status,tgl_mulai,tgl_selesai,petugas_nama,catatan,verified_at,verified_by,verified_note,tiang_segmen,tiang_dinilai,jawaban,temuan",
        )
        .order("tgl_selesai", { ascending: false, nullsFirst: false })
        .order("tgl_mulai", { ascending: false });
      if (ulp) q = q.eq("ulp", ulp);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      setBaris(
        (data ?? []).map((r) => ({
          id: r.id as string,
          segmenId: (r.segmen_id as string) ?? null,
          segmenNama: (r.segmen_nama as string) ?? null,
          penyulang: r.penyulang as string,
          ulp: r.ulp as string,
          tier: r.tier as string,
          status: r.status as string,
          tglMulai: (r.tgl_mulai as string) ?? null,
          tglSelesai: (r.tgl_selesai as string) ?? null,
          petugasNama: (r.petugas_nama as string) ?? null,
          catatan: (r.catatan as string) ?? null,
          verifiedAt: (r.verified_at as string) ?? null,
          verifiedBy: (r.verified_by as string) ?? null,
          verifiedNote: (r.verified_note as string) ?? null,
          tiangSegmen: Number(r.tiang_segmen ?? 0),
          tiangDinilai: Number(r.tiang_dinilai ?? 0),
          jawaban: Number(r.jawaban ?? 0),
          temuan: Number(r.temuan ?? 0),
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBaris([]);
    } finally {
      setLoading(false);
    }
  }, [ulp, toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /** Isi satu penyapuan, dibaca hanya saat barisnya dibuka — sebuah penyapuan
   *  bisa memuat ratusan jawaban, dan memuatnya di muka membuat daftar yang
   *  mungkin cuma dilihat sekilas jadi berat tanpa alasan. */
  const isiPenyapuan = useCallback(
    async (id: string): Promise<JawabanTiang[]> => {
      const { data: titik, error } = await supabaseBrowser
        .from("inspeksi_jtm_titik")
        .select("id,tiang_id,jarak_m,dinilai_at,tiang(kode)")
        .eq("inspeksi_id", id)
        .order("dinilai_at");
      if (error) throw new Error(error.message);
      if (!titik?.length) return [];

      const ids = titik.map((t) => t.id as string);
      const [{ data: periksa }, { data: item }, { data: opsi }] = await Promise.all([
        supabaseBrowser
          .from("inspeksi_jtm_periksa")
          .select("titik_id,item_kode,bagian,nilai,nilai_angka,catatan,foto_url")
          .in("titik_id", ids),
        supabaseBrowser.from("jtm_item_ref").select("kode,nama,urutan"),
        supabaseBrowser.from("jtm_opsi_ref").select("item_kode,kode,label,normal"),
      ]);

      const nama = new Map((item ?? []).map((i) => [i.kode as string, i.nama as string]));
      const urut = new Map((item ?? []).map((i) => [i.kode as string, Number(i.urutan ?? 0)]));
      const lbl = new Map(
        (opsi ?? []).map((o) => [`${o.item_kode}|${o.kode}`, o as Record<string, unknown>]),
      );

      const per = new Map<string, JawabanTiang["isi"]>();
      for (const p of periksa ?? []) {
        const o = lbl.get(`${p.item_kode}|${p.nilai}`);
        const d = per.get(p.titik_id as string) ?? [];
        d.push({
          itemKode: p.item_kode as string,
          itemNama: nama.get(p.item_kode as string) ?? (p.item_kode as string),
          bagian: (p.bagian as string) ?? "-",
          nilai:
            (p.nilai as string) ??
            (p.nilai_angka !== null ? String(p.nilai_angka) : null),
          nilaiLabel:
            (o?.label as string) ??
            (p.nilai as string) ??
            (p.nilai_angka !== null ? String(p.nilai_angka) : null),
          // Item angka dan teks tidak punya daftar pilihan, jadi tidak punya
          // penilaian normal/tidak — dianggap normal supaya tidak jadi temuan palsu.
          normal: o ? !!o.normal : true,
          catatan: (p.catatan as string) ?? null,
          fotoUrl: (p.foto_url as string) ?? null,
        });
        per.set(p.titik_id as string, d);
      }

      return titik.map((t) => {
        const tg = Array.isArray(t.tiang) ? t.tiang[0] : t.tiang;
        return {
          tiangId: t.tiang_id as string,
          tiangKode: ((tg as Record<string, unknown>)?.kode as string) ?? "—",
          jarakM: t.jarak_m !== null ? Number(t.jarak_m) : null,
          dinilaiAt: (t.dinilai_at as string) ?? null,
          isi: (per.get(t.id as string) ?? []).sort(
            (a, b) => (urut.get(a.itemKode) ?? 0) - (urut.get(b.itemKode) ?? 0),
          ),
        };
      });
    },
    [],
  );

  const putuskan = useCallback(
    async (id: string, setuju: boolean, nama: string, catatan: string) => {
      const { error } = await supabaseBrowser.rpc("putuskan_penyapuan_jtm", {
        p_id: id,
        p_setuju: setuju,
        p_nama: nama,
        p_catatan: catatan || null,
      });
      if (error) {
        // Penjaga di database sudah menjelaskan sendiri — teruskan apa adanya.
        toast.error(error.message);
        return false;
      }
      toast.success(setuju ? "Disetujui — angkanya kini terhitung." : "Dikembalikan ke regu.");
      await muat();
      return true;
    },
    [toast, muat],
  );

  const gabung = useCallback(
    async (id: string, oleh: string) => {
      const { data, error } = await supabaseBrowser.rpc("gabung_penyapuan_jtm", {
        p_tujuan: id,
        p_oleh: oleh,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      const h = data as { penyapuan_dibuang: number; tiang_dinilai: number };
      toast.success(
        `${h.penyapuan_dibuang} penyapuan disatukan — kini ${h.tiang_dinilai} tiang dalam satu catatan.`,
      );
      await muat();
      return true;
    },
    [toast, muat],
  );

  const buangKosong = useCallback(
    async (id: string, oleh: string) => {
      const { error } = await supabaseBrowser.rpc("buang_penyapuan_kosong_jtm", {
        p_id: id,
        p_oleh: oleh,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success("Penyapuan kosong dibuang.");
      await muat();
      return true;
    },
    [toast, muat],
  );

  return { baris, loading, muat, isiPenyapuan, putuskan, gabung, buangKosong };
}
