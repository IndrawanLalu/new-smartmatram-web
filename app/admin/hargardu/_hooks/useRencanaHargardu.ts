"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { DEFAULT_WO_HAR, garduAktif, type WoHarSettings } from "../_lib/kandidatWo";
import {
  bulanKini, jendelaRencana, kunciBulan, susunPratinjau,
  type BulanRencana, type GarduRencana, type IsiBerkas, type Pratinjau,
} from "../_lib/rencana";

/**
 * Rencana Pemeliharaan per ULP (`scripts/rencana-hargardu.sql`): ringkasan
 * bulan berjalan ke depan, unduh templat, pratinjau unggahan, simpan, hapus.
 * Master gardu & exceljs baru dimuat saat tombolnya ditekan — tab WO tetap ringan.
 */

interface RowRencana {
  ulp: string;
  gardu_kode: string;
  tahun: number;
  bulan: number;
  catatan: string | null;
  diunggah_oleh: string | null;
  diunggah_at: string;
}

export interface RingkasRencana {
  jendela: BulanRencana[];
  terbit: Set<string>;
  /** kunciBulan → jumlah gardu, bulan berjalan ke depan saja. */
  perBulan: Map<string, number>;
  jumlahGardu: number;
  diunggah: { oleh: string | null; pada: string } | null;
}

interface Muatan {
  rencana: RowRencana[];
  terbit: { ulp: string; tahun: number; bulan: number }[];
  settings: Map<string, WoHarSettings>;
}

export function useRencanaHargardu(daftar: string[], oleh: string) {
  const [data, setData] = useState<Muatan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const kunciDaftar = daftar.join(",");
  const kini = bulanKini();
  const muat = () => { setGalat(null); setNonce((n) => n + 1); };

  useEffect(() => {
    let hidup = true;
    const ulp = kunciDaftar.split(",").filter(Boolean);
    const { tahun } = bulanKini();
    Promise.all([
      fetchAllRows<RowRencana>(() =>
        supabaseBrowser
          .from("rencana_hargardu")
          .select("ulp,gardu_kode,tahun,bulan,catatan,diunggah_oleh,diunggah_at")
          .in("ulp", ulp)
          .gte("tahun", tahun)
          .order("id"),
      ),
      supabaseBrowser.from("wo_hargardu").select("ulp,tahun,bulan").in("ulp", ulp).gte("tahun", tahun),
      supabaseBrowser.from("wo_hargardu_settings").select("ulp,frekuensi_per_tahun,kuota_per_bulan,hanya_gardu_aktif").in("ulp", ulp),
    ]).then(
      ([rencana, wo, set]) => {
        if (!hidup) return;
        if (wo.error || set.error) {
          setGalat((wo.error ?? set.error)!.message);
          return;
        }
        setData({
          rencana,
          terbit: wo.data ?? [],
          settings: new Map((set.data ?? []).map((s) => [s.ulp as string, s as WoHarSettings])),
        });
      },
      (e: Error) => {
        if (!hidup) return;
        setGalat(
          e.message.includes("schema cache") || e.message.includes("does not exist")
            ? "Tabel rencana belum ada — jalankan scripts/rencana-hargardu.sql di Supabase."
            : e.message,
        );
      },
    );
    return () => { hidup = false; };
  }, [kunciDaftar, nonce]);

  const settingsUntuk = (ulp: string) => data?.settings.get(ulp) ?? DEFAULT_WO_HAR;

  const perUlp = useMemo(() => {
    const m = new Map<string, RingkasRencana>();
    if (!data) return m;
    const batas = kunciBulan(kini);
    for (const ulp of kunciDaftar.split(",").filter(Boolean)) {
      const terbit = new Set(data.terbit.filter((w) => w.ulp === ulp).map(kunciBulan));
      const baris = data.rencana.filter((r) => r.ulp === ulp && kunciBulan(r) >= batas);
      const perBulan = new Map<string, number>();
      for (const r of baris) perBulan.set(kunciBulan(r), (perBulan.get(kunciBulan(r)) ?? 0) + 1);
      const akhir = baris.reduce<RowRencana | null>((a, r) => (!a || r.diunggah_at > a.diunggah_at ? r : a), null);
      m.set(ulp, {
        jendela: jendelaRencana(terbit, kini),
        terbit,
        perBulan,
        jumlahGardu: new Set(baris.map((r) => r.gardu_kode)).size,
        diunggah: akhir ? { oleh: akhir.diunggah_oleh, pada: akhir.diunggah_at } : null,
      });
    }
    return m;
    // `kini` berubah hanya saat pergantian bulan — cukup ikut muat ulang data.
  }, [data, kunciDaftar]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Master gardu ULP untuk templat & pratinjau, urut penyulang lalu kode. */
  const muatMaster = async (ulp: string) => {
    const g = await fetchAllRows<GarduRencana>(() =>
      supabaseBrowser
        .from("gardu_master_state")
        .select("kode,nama,alamat,penyulang,kva_master,status")
        .eq("ulp", ulp)
        .order("kode"),
    );
    return g.sort(
      (a, b) =>
        (a.penyulang ?? "~").localeCompare(b.penyulang ?? "~", "id") ||
        a.kode.localeCompare(b.kode, "id", { numeric: true }),
    );
  };

  const unduh = async (ulp: string) => {
    const info = perUlp.get(ulp);
    if (!data || !info) return;
    const s = settingsUntuk(ulp);
    const gardu = (await muatMaster(ulp)).filter((g) => !s.hanya_gardu_aktif || garduAktif(g.status));
    const ada = new Map<string, Set<string>>();
    const catatan = new Map<string, string>();
    for (const r of data.rencana.filter((x) => x.ulp === ulp)) {
      const k = r.gardu_kode.toUpperCase();
      if (!ada.has(k)) ada.set(k, new Set());
      ada.get(k)!.add(kunciBulan(r));
      if (r.catatan) catatan.set(k, r.catatan);
    }
    const { unduhTemplatRencana } = await import("../_lib/rencanaExcel");
    await unduhTemplatRencana({ ulp, gardu, jendela: info.jendela, ada, catatan });
  };

  const pratinjau = async (ulp: string, file: File): Promise<{ isi: IsiBerkas; hasil: Pratinjau }> => {
    const { bacaTemplatRencana } = await import("../_lib/rencanaExcel");
    const isi = await bacaTemplatRencana(file);
    const master = await muatMaster(ulp);
    const hasil = susunPratinjau(isi, ulp, master, settingsUntuk(ulp), perUlp.get(ulp)?.terbit ?? new Set(), kini);
    return { isi, hasil };
  };

  const simpan = async (ulp: string, isi: IsiBerkas) => {
    const { data: r, error } = await supabaseBrowser.rpc("simpan_rencana_hargardu", {
      p_ulp: ulp,
      p_dari: `${kunciBulan(isi.dari)}-01`,
      p_baris: isi.baris,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    muat();
    return r as { tersimpan: number; bulan_terkunci: string[] };
  };

  const hapus = async (ulp: string) => {
    const { data: n, error } = await supabaseBrowser.rpc("hapus_rencana_hargardu", { p_ulp: ulp });
    if (error) throw new Error(error.message);
    muat();
    return n as number;
  };

  return { perUlp, loading: !data && !galat, galat, muat, settingsUntuk, unduh, pratinjau, simpan, hapus };
}
