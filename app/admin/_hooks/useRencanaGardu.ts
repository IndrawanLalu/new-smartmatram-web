"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { JenisTemplat } from "@/lib/rencanaGarduExcel";
import {
  bulanKini, garduAktif, jendelaRencana, kunciBulan, susunPratinjau, woSudahTerbit,
  type AturanPratinjau, type BulanRencana, type GarduRencana, type IsiBerkas, type Pratinjau,
} from "@/lib/rencanaGardu";

/**
 * Rencana gardu per bulan per ULP — Rencana Pemeliharaan (hargardu) dan
 * Rencana Pengukuran memakai hook yang sama, dibedakan `JenisRencana`:
 * ringkasan bulan berjalan ke depan, unduh templat, pratinjau unggahan,
 * simpan, hapus. Master gardu & exceljs baru dimuat saat tombolnya ditekan.
 */

export interface JenisRencana<S> {
  templat: JenisTemplat;
  tabel: "rencana_hargardu" | "rencana_pengukuran";
  tabelWo: "wo_hargardu" | "wo_pengukuran";
  rpcSimpan: "simpan_rencana_hargardu" | "simpan_rencana_pengukuran";
  rpcHapus: "hapus_rencana_hargardu" | "hapus_rencana_pengukuran";
  /** Skrip SQL yang membuat tabelnya — disebut bila tabel belum ada. */
  skrip: string;
  /** Pengaturan WO yang BERLAKU per ULP (sudah termasuk jatuh-tempat). */
  muatSetelan: (ulp: string[]) => Promise<Map<string, S>>;
  aturan: (s: S) => AturanPratinjau;
}

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

interface Muatan<S> {
  rencana: RowRencana[];
  terbit: { ulp: string; tahun: number; bulan: number }[];
  setelan: Map<string, S>;
}

export function useRencanaGardu<S>(jenis: JenisRencana<S>, daftar: string[], oleh: string) {
  const [data, setData] = useState<Muatan<S> | null>(null);
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
          .from(jenis.tabel)
          .select("ulp,gardu_kode,tahun,bulan,catatan,diunggah_oleh,diunggah_at")
          .in("ulp", ulp)
          .gte("tahun", tahun)
          .order("id"),
      ),
      supabaseBrowser.from(jenis.tabelWo).select("ulp,tahun,bulan,kriteria").in("ulp", ulp).gte("tahun", tahun),
      jenis.muatSetelan(ulp),
    ]).then(
      ([rencana, wo, setelan]) => {
        if (!hidup) return;
        if (wo.error) {
          setGalat(wo.error.message);
          return;
        }
        setData({
          rencana,
          terbit: (wo.data ?? []).filter((w) => woSudahTerbit(w.kriteria as Record<string, unknown> | null)),
          setelan,
        });
      },
      (e: Error) => {
        if (!hidup) return;
        setGalat(
          e.message.includes("schema cache") || e.message.includes("does not exist")
            ? `Tabel rencana belum ada — jalankan ${jenis.skrip} di Supabase.`
            : e.message,
        );
      },
    );
    return () => { hidup = false; };
  }, [jenis, kunciDaftar, nonce]);

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

  const aturanUntuk = (ulp: string): AturanPratinjau | null => {
    const s = data?.setelan.get(ulp);
    return s === undefined ? null : jenis.aturan(s);
  };

  /** Master gardu ULP untuk templat & pratinjau, urut penyulang lalu kode. */
  const muatMaster = async (ulp: string) => {
    // Dua literal utuh (bukan sambungan): tipe hasil disimpulkan dari string select.
    const g = jenis.templat.bantuUkur
      ? await fetchAllRows<GarduRencana>(() =>
          supabaseBrowser
            .from("gardu_master_state")
            .select("kode,nama,alamat,penyulang,kva_master,status,persen_beban,event_date")
            .eq("ulp", ulp)
            .order("kode"),
        )
      : await fetchAllRows<GarduRencana>(() =>
          supabaseBrowser.from("gardu_master_state").select("kode,nama,alamat,penyulang,kva_master,status").eq("ulp", ulp).order("kode"),
        );
    return g.sort(
      (a, b) =>
        (a.penyulang ?? "~").localeCompare(b.penyulang ?? "~", "id") ||
        a.kode.localeCompare(b.kode, "id", { numeric: true }),
    );
  };

  const unduh = async (ulp: string) => {
    const info = perUlp.get(ulp);
    const aturan = aturanUntuk(ulp);
    if (!data || !info || !aturan) return;
    const gardu = (await muatMaster(ulp)).filter((g) => !aturan.hanyaAktif || garduAktif(g.status));
    const ada = new Map<string, Set<string>>();
    const catatan = new Map<string, string>();
    for (const r of data.rencana.filter((x) => x.ulp === ulp)) {
      const k = r.gardu_kode.toUpperCase();
      if (!ada.has(k)) ada.set(k, new Set());
      ada.get(k)!.add(kunciBulan(r));
      if (r.catatan) catatan.set(k, r.catatan);
    }
    const { unduhTemplatRencana } = await import("@/lib/rencanaGarduExcel");
    await unduhTemplatRencana(jenis.templat, { ulp, gardu, jendela: info.jendela, ada, catatan });
  };

  const pratinjau = async (ulp: string, file: File): Promise<{ isi: IsiBerkas; hasil: Pratinjau }> => {
    const aturan = aturanUntuk(ulp);
    if (!aturan) throw new Error("Pengaturan WO belum termuat — coba lagi.");
    const { bacaTemplatRencana } = await import("@/lib/rencanaGarduExcel");
    const isi = await bacaTemplatRencana(jenis.templat, file);
    const master = await muatMaster(ulp);
    const hasil = susunPratinjau(isi, ulp, master, aturan, perUlp.get(ulp)?.terbit ?? new Set(), kini);
    return { isi, hasil };
  };

  const simpan = async (ulp: string, isi: IsiBerkas) => {
    const { data: r, error } = await supabaseBrowser.rpc(jenis.rpcSimpan, {
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
    const { data: n, error } = await supabaseBrowser.rpc(jenis.rpcHapus, { p_ulp: ulp });
    if (error) throw new Error(error.message);
    muat();
    return n as number;
  };

  return { perUlp, loading: !data && !galat, galat, muat, unduh, pratinjau, simpan, hapus };
}
