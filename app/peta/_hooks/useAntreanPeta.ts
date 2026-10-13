"use client";

import { useCallback, useState } from "react";
import type { Banding } from "@/app/admin/jtr/_hooks/useApprovalJtr";
import { bingkaiBatas, bingkaiSekitar, bingkaiTitik, type Bingkai } from "../_lib/bingkai";
import type { SorotJtm } from "../_components/PersetujuanJtmPeta";
import { useAntreanJtr, type AntreanJtr } from "./useAntreanJtr";
import { useAntreanJtm, type AntreanJtm } from "./useAntreanJtm";
import { useLangkahAntrean } from "./useLangkahAntrean";
import type { Terpilih } from "./useObjekPeta";
import type { Lapisan } from "./usePetaDaftar";
import { usePortalTanpaPasangan, type PortalTanpaPasangan } from "./usePortalTanpaPasangan";

/**
 * Tiga daftar yang ditelusuri satu per satu dari peta: antrean persetujuan
 * JTR, antrean persetujuan JTM (koreksi user 6 Okt 2026), dan gardu portal
 * yang baru tercatat satu tiang. Satu antrean persetujuan tampil pada satu
 * waktu: membuka yang satu menutup yang lain.
 */

interface Deps {
  ulp: string;
  /** Admin ULP & UP3 — daftar portal hanya dimuat untuk mereka. */
  boleh: boolean;
  nyalakan: (kunci: string) => void;
  setFokus: (b: Bingkai) => void;
  setTerpilih: (t: Terpilih | null) => void;
  setSegmenTampil: (id: string | null) => void;
  terpilih: Terpilih | null;
  semuaLapisan: Lapisan[];
  /** Dibuka dari tabel (/peta?jtr=KODE): kode gardu JTR yang dituju. */
  awalJtr?: string;
}

export function useAntreanPeta({ ulp, boleh, nyalakan, setFokus, setTerpilih, setSegmenTampil, terpilih, semuaLapisan, awalJtr }: Deps) {
  // ── Persetujuan inspeksi JTR ───────────────────────────────────────────────
  const jtr = useAntreanJtr(ulp);
  const [jtrAktif, setJtrAktif] = useState(false);
  const [sorotBanding, setSorotBanding] = useState<Banding | null>(null);
  const bukaJtr = useCallback(
    (d: AntreanJtr) => {
      nyalakan(`jtr:${d.gardu_kode.toUpperCase()}`);
      if (d.lat !== null && d.lng !== null) {
        setFokus(bingkaiSekitar(d.lat, d.lng, 0.0025, 0.0035));
        setTerpilih({ jenis: "gardu", kode: d.gardu_kode, ulp: d.ulp, lat: d.lat, lng: d.lng });
      }
    },
    [nyalakan, setFokus, setTerpilih],
  );
  const langkahJtr = useLangkahAntrean(jtr.antrean, bukaJtr);
  const { tandai: tandaiJtr } = langkahJtr;
  /** Klik penanda antrean di peta. */
  const pilihJtr = useCallback(
    (d: AntreanJtr) => {
      tandaiJtr(jtr.antrean.findIndex((x) => x.id === d.id));
      bukaJtr(d);
    },
    [jtr.antrean, bukaJtr, tandaiJtr],
  );

  // ── Persetujuan inspeksi JTM ───────────────────────────────────────────────
  const jtm = useAntreanJtm(ulp);
  const [jtmAktif, setJtmAktif] = useState(false);
  const [bukaJtm, setBukaJtm] = useState<AntreanJtm | null>(null);
  const [sorotJtm, setSorotJtm] = useState<SorotJtm[] | null>(null);
  const bukaAntreanJtm = useCallback(
    (d: AntreanJtm) => {
      nyalakan(`jtm:${d.penyulang}`);
      setTerpilih(null);
      setSegmenTampil(null);
      setBukaJtm(d);
    },
    [nyalakan, setTerpilih, setSegmenTampil],
  );
  const langkahJtm = useLangkahAntrean(jtm.antrean, bukaAntreanJtm);
  /** Tiang segmen termuat: sorot, lalu bingkai peta ke segmennya. */
  const sorotSegmenJtm = useCallback(
    (t: SorotJtm[] | null) => {
      setSorotJtm(t);
      const b = t ? bingkaiTitik(t, 0.0004) : null;
      if (b) setFokus(b);
    },
    [setFokus],
  );

  // ── Gardu portal yang masih satu tiang (admin) ─────────────────────────────
  const portal = usePortalTanpaPasangan(ulp, boleh);
  const [portalAktif, setPortalAktif] = useState(false);
  const bukaPortal = useCallback(
    (x: PortalTanpaPasangan) => {
      nyalakan(`jtm:${x.penyulang}`);
      setFokus(bingkaiSekitar(x.lat, x.lng, 0.0006, 0.0009));
      setTerpilih({ jenis: "tiang", id: x.tiangId, kelompok: x.penyulang, lat: x.lat, lng: x.lng, kode: x.kode, jaringan: "jtm" });
    },
    [nyalakan, setFokus, setTerpilih],
  );
  const langkahPortal = useLangkahAntrean(portal.daftar, bukaPortal);

  const alihJtr = () => {
    const nyala = !jtrAktif;
    setJtrAktif(nyala);
    if (nyala) {
      setJtmAktif(false);
      setBukaJtm(null);
      langkahJtr.keAwal();
    }
  };
  const alihJtm = () => {
    const nyala = !jtmAktif;
    setJtmAktif(nyala);
    if (nyala) {
      setJtrAktif(false);
      langkahJtm.keAwal();
    } else setBukaJtm(null);
  };
  const tutupJtm = () => {
    setJtmAktif(false);
    setBukaJtm(null);
  };
  const alihPortal = () => {
    const nyala = !portalAktif;
    setPortalAktif(nyala);
    if (nyala) langkahPortal.keAwal();
  };

  /** Inspeksi JTR yang menunggu untuk gardu yang sedang dipilih. */
  const inspeksiTerpilih =
    terpilih?.jenis === "gardu"
      ? jtr.antrean.find(
          (d) => d.gardu_kode.toUpperCase() === terpilih.kode.toUpperCase() && d.ulp.toUpperCase() === terpilih.ulp.toUpperCase(),
        ) ?? null
      : null;

  // Dibuka dari tabel: menuju gardunya begitu titiknya diketahui.
  const [awalDibuka, setAwalDibuka] = useState(!awalJtr);
  if (!awalDibuka && awalJtr && jtr.siap) {
    const kode = awalJtr.toUpperCase();
    const d = jtr.antrean.find((x) => x.gardu_kode.toUpperCase() === kode);
    const l = semuaLapisan.find((x) => x.jaringan === "jtr" && x.kode.toUpperCase() === kode);
    if (d) {
      setAwalDibuka(true);
      bukaJtr(d);
    } else if (l) {
      // Sudah tidak menunggu persetujuan: cukup menuju jaringannya.
      setAwalDibuka(true);
      const b = bingkaiBatas(l);
      if (b) setFokus(b);
    }
  }

  return {
    jtr: { ...jtr, aktif: jtrAktif, alih: alihJtr, tutup: () => setJtrAktif(false), langkah: langkahJtr, pilih: pilihJtr, sorotBanding, setSorotBanding, inspeksiTerpilih },
    jtm: { ...jtm, aktif: jtmAktif, alih: alihJtm, tutup: tutupJtm, langkah: langkahJtm, buka: bukaJtm, setBuka: setBukaJtm, sorot: sorotJtm, sorotSegmen: sorotSegmenJtm },
    portal: { ...portal, aktif: portalAktif, alih: alihPortal, tutup: () => setPortalAktif(false), langkah: langkahPortal },
  };
}
