"use client";

import { useEffect, useMemo, useState } from "react";
import type { GrafSld } from "@/lib/sld";
import { angka } from "../_lib/angka";
import { warnaPenyulang } from "../_lib/warnaSld";
import type { Lapisan } from "./usePetaDaftar";
import { useSld } from "./useSld";

/**
 * Mode SLD di Peta Jaringan (rencana-mode-sld.md). Penyulang yang digambar =
 * penyulang JTM yang dicentang di panel kiri — SATU pilihan dengan mode biasa,
 * bukan daftar kedua. SLD tiap penyulang ditarik saat pertama kali menyala
 * selama mode ini aktif, lalu disimpan.
 *
 * Alamat ikut: `/peta?mode=sld` (bisa dibagikan, dan tujuan alamat lama Peta
 * SLD). Diganti dengan replaceState — halaman tidak dimuat ulang.
 */

interface Deps {
  ulp: string;
  nyala: Set<string>;
  awal?: boolean;
  /** Daftar penyulang folder JTM — urutannya menetapkan warna tiap penyulang. */
  daftarJtm: Lapisan[];
}

export function useModeSld({ ulp, nyala, awal, daftarJtm }: Deps) {
  const [aktif, setAktif] = useState(!!awal);
  const [label, setLabel] = useState(false);
  const data = useSld(ulp || null, aktif);

  const menyala = useMemo(() => [...nyala].filter((k) => k.startsWith("jtm:")).map((k) => k.slice(4)), [nyala]);
  const { muat } = data;
  useEffect(() => {
    if (!aktif) return;
    for (const p of menyala) void muat(p);
  }, [aktif, menyala, muat]);

  const graf = useMemo(
    () => (aktif ? menyala.map((p) => data.graf.get(p)).filter((g): g is GrafSld => g !== undefined) : []),
    [aktif, menyala, data.graf],
  );
  const warna = useMemo(() => warnaPenyulang(daftarJtm.map((l) => l.kode)), [daftarJtm]);
  const ringkas = useMemo(() => new Map(data.ringkas.map((r) => [r.penyulang.toUpperCase(), r])), [data.ringkas]);

  /** Baris ketiga di panel kiri: kms · gardu · beban (dari kartu penyulang). */
  const keterangan = (kode: string) => {
    const r = ringkas.get(kode.toUpperCase());
    if (!r) return null;
    const km = r.kmTiang ?? r.kmSegmen;
    return `${km !== null ? `${angka(km, 2)} kms · ` : ""}${r.gardu} gardu · ${angka(r.bebanKva)} kVA`;
  };

  const alih = (v: boolean) => {
    setAktif(v);
    try {
      const u = new URL(window.location.href);
      if (v) u.searchParams.set("mode", "sld");
      else u.searchParams.delete("mode");
      window.history.replaceState(null, "", u);
    } catch {
      // alamat tidak bisa diganti — mode tetap berganti
    }
  };

  return {
    aktif,
    alih,
    label,
    alihLabel: () => setLabel((v) => !v),
    graf,
    memuat: menyala.filter((p) => data.memuat.has(p)),
    gardu: data.gardu,
    warna,
    ringkas,
    keterangan,
    jumlahSimpul: graf.reduce((n, g) => n + g.simpul.size, 0),
    muatUlang: () => data.muatUlang(menyala),
  };
}
