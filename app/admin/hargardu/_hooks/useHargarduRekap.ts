"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

export interface RekapItem {
  ulp: string;
  item_kode: string;
  item_nama: string;
  kelompok: string;
  tampil_dashboard: boolean;
  jumlah_gardu: number;
  normal: number;
  tidak_normal: number;
  belum_diperiksa: number;
  persen_diperiksa: number | null;
}

export interface RekapOpsi {
  ulp: string;
  item_kode: string;
  item_nama: string;
  opsi_kode: string;
  opsi_label: string;
  normal: boolean;
  jumlah_gardu: number;
}

export interface Cakupan {
  ulp: string;
  jumlah_gardu: number;
  pernah_dipelihara: number;
  dipelihara_12_bulan: number;
  master_terverifikasi: number;
  persen_master_lengkap: number | null;
  terakhir: string | null;
}

/**
 * Satu item, siap digambar sebagai satu batang.
 *
 * Sengaja TIDAK memisahkan "kepatuhan" dan "sebaran" jadi dua bentuk grafik.
 * Cacahan per pilihan sudah memuat keduanya: untuk tekep, "Ada" lawan "Tidak
 * Ada" itu kepatuhan; untuk sambungan outlet, "Joint Press" lawan "Konektor"
 * itu sebaran. Yang membedakan cuma penilaian `normal`-nya, dan itu sudah
 * tersimpan di tabel acuan.
 */
export interface Batang {
  itemKode: string;
  itemNama: string;
  kelompok: string;
  jumlahGardu: number;
  diperiksa: number;
  belumDiperiksa: number;
  persenDiperiksa: number;
  potongan: { label: string; jumlah: number; normal: boolean }[];
}

export function useHargarduRekap(user: CurrentUser, ulpPilihan: string) {
  const [item, setItem] = useState<RekapItem[]>([]);
  const [opsi, setOpsi] = useState<RekapOpsi[]>([]);
  const [cakupan, setCakupan] = useState<Cakupan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? (ulpPilihan || null) : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const saring = <T,>(q: any) => (unit ? q.eq("ulp", unit) : q);

      const [i, o, c] = await Promise.all([
        saring(supabaseBrowser.from("hargardu_rekap_item").select("*")),
        saring(supabaseBrowser.from("hargardu_rekap_opsi").select("*")),
        saring(supabaseBrowser.from("hargardu_cakupan").select("*")),
      ]);
      if (i.error) throw new Error(i.error.message);

      setItem((i.data ?? []) as unknown as RekapItem[]);
      setOpsi((o.data ?? []) as unknown as RekapOpsi[]);
      setCakupan((c.data ?? []) as unknown as Cakupan[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat rekap");
    } finally {
      setLoading(false);
    }
  }, [unit]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /** Cakupan dijumlahkan lintas ULP kalau tidak ada yang dipilih. */
  const cakupanTotal = useMemo(() => {
    const t = cakupan.reduce(
      (a, c) => ({
        jumlah_gardu: a.jumlah_gardu + Number(c.jumlah_gardu ?? 0),
        pernah_dipelihara: a.pernah_dipelihara + Number(c.pernah_dipelihara ?? 0),
        dipelihara_12_bulan: a.dipelihara_12_bulan + Number(c.dipelihara_12_bulan ?? 0),
        master_terverifikasi: a.master_terverifikasi + Number(c.master_terverifikasi ?? 0),
      }),
      { jumlah_gardu: 0, pernah_dipelihara: 0, dipelihara_12_bulan: 0, master_terverifikasi: 0 },
    );
    const terakhir = cakupan
      .map((c) => c.terakhir)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;
    return { ...t, terakhir: terakhir ?? null };
  }, [cakupan]);

  /**
   * Batang per item, dijumlahkan lintas ULP bila tidak ada yang dipilih.
   *
   * "Belum diperiksa" ikut jadi potongan batang, bukan disembunyikan di
   * catatan kaki. Gardu yang belum pernah dipelihara BUKAN gardu yang tidak
   * bertekep — menggabungkan keduanya membuat laporan terlihat bagus persis
   * karena datanya belum ada.
   */
  const batang = useMemo<Batang[]>(() => {
    const perItem = new Map<string, Batang>();

    for (const r of item) {
      if (!r.tampil_dashboard) continue;
      const b = perItem.get(r.item_kode) ?? {
        itemKode: r.item_kode,
        itemNama: r.item_nama,
        kelompok: r.kelompok,
        jumlahGardu: 0,
        diperiksa: 0,
        belumDiperiksa: 0,
        persenDiperiksa: 0,
        potongan: [],
      };
      b.jumlahGardu += Number(r.jumlah_gardu ?? 0);
      b.belumDiperiksa += Number(r.belum_diperiksa ?? 0);
      b.diperiksa += Number(r.normal ?? 0) + Number(r.tidak_normal ?? 0);
      perItem.set(r.item_kode, b);
    }

    for (const o of opsi) {
      const b = perItem.get(o.item_kode);
      if (!b) continue;
      const ada = b.potongan.find((x) => x.label === o.opsi_label);
      if (ada) ada.jumlah += Number(o.jumlah_gardu ?? 0);
      else
        b.potongan.push({
          label: o.opsi_label,
          jumlah: Number(o.jumlah_gardu ?? 0),
          normal: o.normal,
        });
    }

    return [...perItem.values()]
      .map((b) => ({
        ...b,
        persenDiperiksa: b.jumlahGardu > 0 ? (b.diperiksa / b.jumlahGardu) * 100 : 0,
        // Yang tidak normal lebih dulu: itu yang perlu ditindak, dan daftar
        // yang diurutkan menurut abjad menyembunyikannya di tengah.
        potongan: b.potongan.sort((x, y) => Number(x.normal) - Number(y.normal)),
      }))
      .sort((a, b) => a.itemNama.localeCompare(b.itemNama));
  }, [item, opsi]);

  return { batang, cakupanTotal, cakupan, loading, error, muat };
}
