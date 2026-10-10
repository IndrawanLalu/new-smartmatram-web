"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, ArrowLeft, ChevronLeft, ChevronRight, ClipboardCheck, Columns2, Gauge, Hash, ListChecks, Loader2, Move, Ruler, PanelLeftOpen, RefreshCw, Tags, TriangleAlert, X } from "lucide-react";
import { useAntreanJtr, type AntreanJtr } from "../_hooks/useAntreanJtr";
import { useAntreanJtm, type AntreanJtm } from "../_hooks/useAntreanJtm";
import PersetujuanJtmPeta, { type SorotJtm } from "./PersetujuanJtmPeta";
import type { Banding } from "@/app/admin/jtr/_hooks/useApprovalJtr";
import { BATAS_NAMA } from "./LapisanNama";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { usePetaDaftar, type Jaringan } from "../_hooks/usePetaDaftar";
import { usePetaIsi, ZOOM_GARDU, ZOOM_TIANG, type GarduPeta, type Kotak, type TiangPeta } from "../_hooks/usePetaIsi";
import { usePenandaJtm } from "../_hooks/usePenandaJtm";
import { useObjekPeta, type Terpilih } from "../_hooks/useObjekPeta";
import { useSuntingPeta } from "../_hooks/useSuntingPeta";
import { useGeserBanyak } from "../_hooks/useGeserBanyak";
import { useKoreksiIsian } from "../_hooks/useKoreksiIsian";
import { useIsianPeta } from "../_hooks/useIsianPeta";
import { useIndukLoncat } from "../_hooks/useIndukLoncat";
import { kunciMilik, useMilikPenanda } from "@/lib/milikPenanda";
import PanelKoreksiIsian from "./PanelKoreksiIsian";
import PanelGarduJanggal from "./PanelGarduJanggal";
import { useGarduJanggal } from "../_hooks/useGarduJanggal";
import MenuKelompok from "./MenuKelompok";
import { usePortalTanpaPasangan, type PortalTanpaPasangan } from "../_hooks/usePortalTanpaPasangan";
import { useSimulasiBuka } from "../_hooks/useSimulasiBuka";
import { useKesehatanPeta, type KesehatanGardu, type SaringKesehatan, type StatusKesehatan } from "../_hooks/useKesehatanPeta";
import PanelKesehatan from "./PanelKesehatan";
import { STATUS_UJUNG_PETA, useUjungPeta, type NadaUjung, type SaringUjung } from "../_hooks/useUjungPeta";
import { GARIS, PANEL } from "../_ui";
import PanelLapisan from "./PanelLapisan";
import PanelObjek from "./PanelObjek";
import PanelGeserBanyak from "./PanelGeserBanyak";
import PanelUjung from "./PanelUjung";
import PanelPohon from "./PanelPohon";
import TugaskanPohonPeta from "./TugaskanPohonPeta";
import { usePohonPeta, type SaringPohon, type TemuanPohon } from "../_hooks/usePohonPeta";

const PetaInner = dynamic(() => import("./PetaInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-[#0b1220] text-gray-500 text-sm gap-2">
      <Loader2 size={20} className="animate-spin" />
      Menyiapkan peta…
    </div>
  ),
});

/** Kotak batas apa pun yang bisa dilompati — penyulang, gardu, atau satu grup. */
/** Bulan berjalan menurut WITA (UTC+8). */
const bulanIni = () => {
  const w = new Date(Date.now() + 8 * 3600 * 1000);
  return { tahun: w.getUTCFullYear(), bulan: w.getUTCMonth() + 1 };
};

const SARING_AWAL: SaringUjung = {
  nada: new Set<NadaUjung>(["merah", "kuning", "hijau"]),
  status: new Set(STATUS_UJUNG_PETA),
  jauhDariUjung: null,
};

const SARING_POHON_AWAL: SaringPohon = {
  sumber: new Set(["inspeksi", "perabasan"] as const),
  vegetasi: new Set(["menyentuh", "berpotensi"] as const),
  tugas: new Set(["belum", "sudah"] as const),
  sembunyikanTertangani: false,
};

const SARING_KESEHATAN_AWAL: SaringKesehatan = {
  status: new Set<StatusKesehatan>(["merah", "kuning", "hijau"]),
  hanyaSisip: false,
  hanyaJurusan160: false,
};

const TOMBOL_ATAS =
  "h-9 px-3 rounded-xl text-[#e2e8f0] text-sm font-medium backdrop-blur-sm flex items-center gap-2 border hover:bg-white/5";

interface Batas {
  latMin: number | null;
  latMaks: number | null;
  lngMin: number | null;
  lngMaks: number | null;
}

/** Dibuka dari tabel (/peta?jtr=AM263&ulp=AMPENAN): lapisan JTR gardu itu
 *  langsung menyala, peta menuju gardunya, panelnya terbuka. */
export interface AwalPeta {
  jtr?: string;
  ulp?: string;
  /** Dibuka dari WO Perabasan ("Lihat di peta"): lapisan pohon langsung menyala. */
  pohon?: boolean;
}

export default function PetaJaringan({ user, awal }: { user: CurrentUser; awal?: AwalPeta }) {
  const [ulp, setUlp] = useState(
    canSeeAllUnits(user.role) ? (awal?.ulp?.toUpperCase() ?? "") : (user.unit ?? ""),
  );
  const [nyala, setNyala] = useState<Set<string>>(
    () => new Set(awal?.jtr ? [`jtr:${awal.jtr.toUpperCase()}`] : []),
  );
  // Padam saat halaman dibuka, sama seperti lapisan lain. Peta ini berangkat
  // kosong dengan sengaja — yang muncul di layar adalah yang DIMINTA, bukan
  // yang kebetulan tersedia. Saklar yang menyala sendiri membuat 2.092 gardu
  // jadi latar tetap yang harus dimatikan lebih dulu tiap kali orang ingin
  // melihat satu penyulang dengan tenang.
  const [tampilGardu, setTampilGardu] = useState(false);
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const [fokus, setFokus] = useState<[[number, number], [number, number]] | null>(null);
  const [panel, setPanel] = useState(true);

  const { perFolder, semuaLapisan, loading, error, muat: muatDaftar } = usePetaDaftar(ulp || null);
  const penanda = usePenandaJtm();

  // Kunci `pohon:` milik lapisan pohon (usePohonPeta), bukan jaringan yang
  // tiangnya dimuat — dikeluarkan supaya mencentang pohon tidak memuat ulang peta.
  const pilihan = useMemo(
    () =>
      [...nyala]
        .filter((k) => !k.startsWith("pohon:"))
        .map((k) => {
          const [jaringan, ...sisa] = k.split(":");
          return { jaringan: jaringan as Jaringan, kode: sisa.join(":") };
        }),
    [nyala],
  );

  const { rute, tiang, gardu, sibuk, terpotong, muatUlang: muatUlangPeta } = usePetaIsi(kotak, pilihan, tampilGardu);
  const indukLoncat = useIndukLoncat();
  // Gardu & peralatan di tiang yang dipakai beberapa penyulang hanya digambar di
  // lapisan pemiliknya; titik pertemuan & yang belum dipilih di semua (10 Okt 2026).
  const milikPenanda = useMilikPenanda();
  const tiangPeta = useMemo(
    () =>
      milikPenanda.milik.size === 0
        ? tiang
        : tiang.map((t) =>
            t.jaringan === "jtm" && t.penanda && milikPenanda.milik.get(kunciMilik(t.id, t.kelompok))?.tampil === false
              ? { ...t, penanda: null, garduDiTiang: null, namaPeralatan: null }
              : t,
          ),
    [tiang, milikPenanda.milik],
  );
  const tandaMilik = useMemo(
    () => [
      ...new Map(
        tiangPeta
          .filter((t) => t.jaringan === "jtm" && t.penanda && milikPenanda.milik.get(kunciMilik(t.id, t.kelompok))?.status === "belum")
          .map((t) => [t.id, t]),
      ).values(),
    ],
    [tiangPeta, milikPenanda.milik],
  );

  // ── Tahap 2: pilih, sunting, tegangan ujung ────────────────────────────────
  const oleh = user.name ?? user.email ?? "";
  // Penjaga hak ULP ada di database; ini hanya menyembunyikan tombol.
  const boleh = user.role === "UP3" || user.role === "admin";
  const [terpilih, setTerpilih] = useState<Terpilih | null>(null);
  const [geser, setGeser] = useState<{ lat: number; lng: number } | null>(null);
  const [modeInduk, setModeInduk] = useState(false);
  /** Ganti induk DI PENYULANG YANG MENUMPANG (titik pertemuan); null = induk batang. */
  const [indukPenyulang, setIndukPenyulang] = useState<string | null>(null);
  /** Gabungkan tiang kembar: menunggu klik batang aslinya. */
  const [modeGabung, setModeGabung] = useState(false);
  const [calonGabung, setCalonGabung] = useState<TiangPeta | null>(null);
  const [calonInduk, setCalonInduk] = useState<TiangPeta | null>(null);
  /** Ganti induk JTR wajib beralasan — diisi di panel, dipakai saat tiang diklik. */
  const [alasanInduk, setAlasanInduk] = useState("");
  const objek = useObjekPeta(terpilih);
  const sunting = useSuntingPeta(oleh);
  const geserBanyak = useGeserBanyak(oleh);
  const koreksi = useKoreksiIsian(oleh);
  // Gardu janggal: kode gardu di tiang vs master gardu (kelompok Gardu, 10 Okt 2026).
  const garduJanggal = useGarduJanggal(ulp, oleh);
  // Nilai isian JTM di tiap tiang: ukuran konduktor, atau isian yang sedang
  // dikoreksi selama mode Koreksi isian aktif (10 Okt 2026).
  const [isianTampil, setIsianTampil] = useState(false);
  const itemTampil = koreksi.aktif ? koreksi.item : "ukuran_konduktor";
  const namaItemTampil = koreksi.aktif
    ? (koreksi.daftarItem.find((x) => x.kode === koreksi.item)?.nama ?? "Isian")
    : "Ukuran kabel";
  const isianPeta = useIsianPeta(isianTampil, itemTampil, tiang);
  const simulasi = useSimulasiBuka();

  const jalankanSimulasi = async () => {
    if (terpilih?.jenis !== "tiang") return;
    const h = await simulasi.jalankan(terpilih.id);
    // Peta dibawa ke seluruh wilayah padam — hasilnya harus terlihat utuh.
    if (h?.batas && h.jumlah_tiang > 0) {
      setFokus([
        [h.batas[0], h.batas[1]],
        [h.batas[2], h.batas[3]],
      ]);
    }
  };

  const [namaTiang, setNamaTiang] = useState(false);
  // Nomor kabel JTR di tiap tiang — yang paling sering dicek admin (1/2/3).
  const [nomorKabel, setNomorKabel] = useState(false);
  // Tombol di atas peta dikelompokkan JTM / JTR / Gardu; satu yang terbuka.
  const [menuBuka, setMenuBuka] = useState<"jtm" | "jtr" | "gardu" | null>(null);
  const bukaMenu = (m: "jtm" | "jtr" | "gardu") => setMenuBuka((x) => (x === m ? null : m));
  const bolehSetujui = user.role === "UP3" || user.role === "admin";

  // ── Persetujuan inspeksi JTR dari peta ─────────────────────────────────────
  const antreanJtr = useAntreanJtr(ulp);
  const [antreanAktif, setAntreanAktif] = useState(false);
  const [posAntrean, setPosAntrean] = useState(0);
  const [sorotBanding, setSorotBanding] = useState<Banding | null>(null);
  const bukaAntrean = useCallback((d: AntreanJtr) => {
    setNyala((s) => new Set(s).add(`jtr:${d.gardu_kode.toUpperCase()}`));
    if (d.lat !== null && d.lng !== null) {
      setFokus([[d.lat - 0.0025, d.lng - 0.0035], [d.lat + 0.0025, d.lng + 0.0035]]);
      setTerpilih({ jenis: "gardu", kode: d.gardu_kode, ulp: d.ulp, lat: d.lat, lng: d.lng });
    }
  }, []);
  const pilihAntrean = useCallback(
    (d: AntreanJtr) => {
      setPosAntrean(Math.max(0, antreanJtr.antrean.findIndex((x) => x.id === d.id)));
      bukaAntrean(d);
    },
    [antreanJtr.antrean, bukaAntrean],
  );
  const geserAntrean = (arah: 1 | -1) => {
    const n = antreanJtr.antrean.length;
    if (n === 0) return;
    const i = (posAntrean + arah + n) % n;
    setPosAntrean(i);
    bukaAntrean(antreanJtr.antrean[i]);
  };
  // ── Persetujuan inspeksi JTM dari peta (koreksi user 6 Okt 2026) ──────────
  // Satu antrean tampil pada satu waktu: membuka JTM menutup antrean JTR.
  const antreanJtm = useAntreanJtm(ulp);
  const [jtmAktif, setJtmAktif] = useState(false);
  const [posJtm, setPosJtm] = useState(0);
  const [bukaJtm, setBukaJtm] = useState<AntreanJtm | null>(null);
  const [sorotJtm, setSorotJtm] = useState<SorotJtm[] | null>(null);
  const bukaAntreanJtm = useCallback((d: AntreanJtm) => {
    setNyala((s) => new Set(s).add(`jtm:${d.penyulang}`));
    setTerpilih(null);
    setBukaJtm(d);
  }, []);
  const geserJtm = (arah: 1 | -1) => {
    const n = antreanJtm.antrean.length;
    if (n === 0) return;
    const i = (posJtm + arah + n) % n;
    setPosJtm(i);
    bukaAntreanJtm(antreanJtm.antrean[i]);
  };
  /** Tiang segmen termuat: sorot, lalu bingkai peta ke segmennya. */
  const sorotSegmenJtm = useCallback((t: SorotJtm[] | null) => {
    setSorotJtm(t);
    if (!t || t.length === 0) return;
    const lat = t.map((x) => x.lat);
    const lng = t.map((x) => x.lng);
    const pad = 0.0004;
    setFokus([[Math.min(...lat) - pad, Math.min(...lng) - pad], [Math.max(...lat) + pad, Math.max(...lng) + pad]]);
  }, []);

  // ── Gardu portal yang masih satu tiang (admin) ─────────────────────────────
  const [portalAktif, setPortalAktif] = useState(false);
  const [posPortal, setPosPortal] = useState(0);
  const portal = usePortalTanpaPasangan(ulp, boleh);
  const bukaPortal = useCallback((x: PortalTanpaPasangan) => {
    setNyala((s) => new Set(s).add(`jtm:${x.penyulang}`));
    setFokus([[x.lat - 0.0006, x.lng - 0.0009], [x.lat + 0.0006, x.lng + 0.0009]]);
    setTerpilih({ jenis: "tiang", id: x.tiangId, kelompok: x.penyulang, lat: x.lat, lng: x.lng, kode: x.kode, jaringan: "jtm" });
  }, []);
  const geserPortal = (arah: 1 | -1) => {
    const n = portal.daftar.length;
    if (n === 0) return;
    const i = (posPortal + arah + n) % n;
    setPosPortal(i);
    bukaPortal(portal.daftar[i]);
  };

  const inspeksiTerpilih =
    terpilih?.jenis === "gardu"
      ? antreanJtr.antrean.find(
          (d) => d.gardu_kode.toUpperCase() === terpilih.kode.toUpperCase() && d.ulp.toUpperCase() === terpilih.ulp.toUpperCase(),
        ) ?? null
      : null;

  // Dibuka dari tabel: menuju gardunya begitu titiknya diketahui.
  const [awalDibuka, setAwalDibuka] = useState(!awal?.jtr);
  if (!awalDibuka && awal?.jtr && antreanJtr.siap) {
    const kode = awal.jtr.toUpperCase();
    const d = antreanJtr.antrean.find((x) => x.gardu_kode.toUpperCase() === kode);
    const l = semuaLapisan.find((x) => x.jaringan === "jtr" && x.kode.toUpperCase() === kode);
    if (d) {
      setAwalDibuka(true);
      bukaAntrean(d);
    } else if (l) {
      // Sudah tidak menunggu persetujuan: cukup menuju jaringannya.
      setAwalDibuka(true);
      if (l.latMin !== null && l.latMaks !== null && l.lngMin !== null && l.lngMaks !== null) {
        setFokus([[l.latMin, l.lngMin], [l.latMaks, l.lngMaks]]);
      }
    }
  }
  const [memuatUlang, setMemuatUlang] = useState(false);

  /** Muat ulang isi peta yang terlihat + daftar lapisan + rincian yang
   *  terbuka — tanpa memuat ulang halaman (pilihan lapisan & posisi tetap). */
  const muatUlangSemua = async () => {
    setMemuatUlang(true);
    objek.muatUlang();
    try {
      antreanJtr.muatUlang();
      antreanJtm.muatUlang();
      indukLoncat.muatUlang();
      milikPenanda.muatUlang();
      garduJanggal.muatUlang();
      await Promise.all([muatDaftar(), muatUlangPeta()]);
    } finally {
      setMemuatUlang(false);
    }
  };

  const [ujungAktif, setUjungAktif] = useState(false);
  const [bulanUjung, setBulanUjung] = useState(bulanIni);
  const [saringUjung, setSaringUjung] = useState<SaringUjung>(SARING_AWAL);
  const ujung = useUjungPeta(ujungAktif, ulp, bulanUjung.tahun, bulanUjung.bulan, saringUjung);

  const [bulanPohon, setBulanPohon] = useState(bulanIni);
  const [saringPohon, setSaringPohon] = useState<SaringPohon>(SARING_POHON_AWAL);
  const pohon = usePohonPeta(ulp, bulanPohon.tahun, bulanPohon.bulan, saringPohon, nyala);
  const pohonAktif = [...nyala].some((k) => k.startsWith("pohon:"));
  // Menugaskan dari peta: satu pohon (popup) atau semua yang tampil & belum.
  const [tugasPohon, setTugasPohon] = useState<TemuanPohon[] | null>(null);
  const bisaTugasPohon = pohon.temuan.filter((t) => t.kunciTugas);
  const padamkanPohon = () => setNyala((s) => new Set([...s].filter((k) => !k.startsWith("pohon:"))));
  // Dibuka dari WO Perabasan (/peta?pohon=1): semua penyulang pohon menyala
  // SEKALI begitu daftarnya terbaca — sesudah itu pilihan sepenuhnya milik pengguna.
  const [pohonAwalDipasang, setPohonAwalDipasang] = useState(!awal?.pohon);
  if (!pohonAwalDipasang && pohon.daftar.length > 0) {
    setPohonAwalDipasang(true);
    setNyala((s) => new Set([...s, ...pohon.daftar.map((l) => `pohon:${l.kode}`)]));
  }

  const [kesehatanAktif, setKesehatanAktif] = useState(false);
  const [saringKesehatan, setSaringKesehatan] = useState<SaringKesehatan>(SARING_KESEHATAN_AWAL);
  const kesehatan = useKesehatanPeta(kesehatanAktif, ulp, saringKesehatan);
  const pilihKesehatan = useCallback(
    (g: KesehatanGardu) => {
      if (geser || modeInduk) return;
      setTerpilih({ jenis: "gardu", kode: g.kode, ulp: g.ulp, lat: g.lat, lng: g.lng });
    },
    [geser, modeInduk],
  );

  const segarkan = () => {
    objek.muatUlang();
    indukLoncat.muatUlang();
    milikPenanda.muatUlang();
    garduJanggal.muatUlang();
    void muatUlangPeta();
  };

  // Stabil — `Isi` di peta di-memo, dan ribuan objeknya tidak boleh digambar
  // ulang hanya karena panel berubah.
  const { aktif: geserBanyakAktif, pilih: pilihGeserBanyak } = geserBanyak;
  const { aktif: koreksiAktif, pilih: pilihKoreksi } = koreksi;
  const pilihTiang = useCallback(
    (t: TiangPeta) => {
      if (geser) return;
      if (geserBanyakAktif) {
        pilihGeserBanyak(t);
        return;
      }
      // Koreksi isian JTM: klik = tiang awal / akhir rentang.
      if (koreksiAktif) {
        pilihKoreksi(t);
        return;
      }
      if (modeGabung) {
        // Batang asli = batang LAIN, di jaringan lain (JTM, atau JTR gardu lain).
        if (terpilih?.jenis !== "tiang" || t.id === terpilih.id) return;
        if (t.jaringan === "jtr" && t.kelompok === terpilih.kelompok) return;
        setCalonGabung(t);
        return;
      }
      if (modeInduk) {
        if (terpilih?.jenis !== "tiang" || t.id === terpilih.id) return;
        // Induk JTR harus tiang JTR gardu yang sama.
        if (terpilih.jaringan === "jtr" && (t.jaringan !== "jtr" || t.kelompok !== terpilih.kelompok)) return;
        // Induk di penyulang yang menumpang: tiang dari lapisan penyulang itu.
        if (indukPenyulang && (t.jaringan !== "jtm" || t.kelompok.toUpperCase() !== indukPenyulang.toUpperCase())) return;
        setCalonInduk(t);
        return;
      }
      setTerpilih({ jenis: "tiang", id: t.id, kelompok: t.kelompok, lat: t.lat, lng: t.lng, kode: t.kode, jaringan: t.jaringan === "jtr" ? "jtr" : "jtm" });
    },
    [geser, modeInduk, modeGabung, terpilih, geserBanyakAktif, pilihGeserBanyak, koreksiAktif, pilihKoreksi, indukPenyulang],
  );
  const pilihGardu = useCallback(
    (g: GarduPeta) => {
      if (geser || modeInduk || geserBanyakAktif || koreksiAktif) return;
      setTerpilih({ jenis: "gardu", kode: g.kode, ulp: g.ulp, lat: g.lat, lng: g.lng });
    },
    [geser, modeInduk, geserBanyakAktif, koreksiAktif],
  );
  const aturGeser = useCallback((lat: number, lng: number) => setGeser({ lat, lng }), []);
  const tutupObjek = () => {
    simulasi.tutup();
    setTerpilih(null);
    setGeser(null);
    setModeInduk(false);
    setIndukPenyulang(null);
    setModeGabung(false);
    setAlasanInduk("");
  };

  const aturIndukPenyulang = async (indukId: string | null) => {
    if (terpilih?.jenis !== "tiang" || !indukPenyulang) return false;
    const ok = await sunting.indukPenyulang(terpilih.id, indukPenyulang, indukId);
    if (ok) {
      setModeInduk(false);
      setIndukPenyulang(null);
      segarkan();
    }
    return ok;
  };

  /** Koreksi JTR: semua per gardu yang sedang dipilih (`terpilih.kelompok`). */
  const koreksiJtr = async (fn: (id: string, gardu: string) => Promise<boolean>) => {
    if (terpilih?.jenis !== "tiang" || terpilih.jaringan !== "jtr") return false;
    const ok = await fn(terpilih.id, terpilih.kelompok);
    if (ok) segarkan();
    return ok;
  };
  const gantiIndukJtr = async (indukId: string | null) => {
    const ok = await koreksiJtr((id, g) => sunting.indukJtr(id, g, indukId, alasanInduk));
    if (ok) {
      setModeInduk(false);
      setAlasanInduk("");
    }
    return ok;
  };

  const simpanGeser = async (alasan: string) => {
    if (!terpilih || !geser) return false;
    const ok =
      terpilih.jenis === "tiang"
        ? await sunting.geserTiang(terpilih.id, geser.lat, geser.lng, alasan)
        : await sunting.geserGardu(terpilih.kode, terpilih.ulp, geser.lat, geser.lng, alasan);
    if (ok) {
      setTerpilih({ ...terpilih, lat: geser.lat, lng: geser.lng });
      setGeser(null);
      segarkan();
    }
    return ok;
  };

  const alih = useCallback((jaringan: Jaringan, kode: string) => {
    setNyala((s) => {
      const b = new Set(s);
      const k = `${jaringan}:${kode}`;
      if (b.has(k)) b.delete(k); else b.add(k);
      return b;
    });
  }, []);

  /** Menyalakan atau memadamkan satu penyulang penuh sekaligus. */
  const alihBanyak = useCallback((jaringan: Jaringan, kode: string[], nyalakan: boolean) => {
    setNyala((s) => {
      const b = new Set(s);
      for (const k of kode) {
        if (nyalakan) b.add(`${jaringan}:${k}`);
        else b.delete(`${jaringan}:${k}`);
      }
      return b;
    });
  }, []);

  const hanya = useCallback((jaringan: Jaringan, kode: string | string[]) => {
    const daftar = Array.isArray(kode) ? kode : [kode];
    setNyala(new Set(daftar.map((k) => `${jaringan}:${k}`)));
  }, []);

  const lompat = useCallback((b: Batas) => {
    if (b.latMin === null || b.latMaks === null || b.lngMin === null || b.lngMaks === null) return;
    setFokus([
      [b.latMin, b.lngMin],
      [b.latMaks, b.lngMaks],
    ]);
  }, []);

  const zoom = kotak?.zoom ?? 0;
  const jumlahObjek =
    rute.reduce((n, r) => n + r.bentang.length, 0) + tiang.length * 2 + gardu.length + ujung.titik.length * 2 + kesehatan.gardu.length
    + pohon.temuan.length + pohon.dirabas.length;
  const adaGarduPilihan = pilihan.some((p) => p.jaringan === "gardu");
  const adaJaringan = pilihan.some((p) => p.jaringan !== "gardu");

  return (
    <div className="h-full flex">
      {panel ? (
        <PanelLapisan
          user={user}
          perFolder={perFolder}
          pohon={pohon.daftar}
          saringPohon={saringPohon}
          onSaringPohon={setSaringPohon}
          perSumberPohon={pohon.perSumber}
          semuaLapisan={[...semuaLapisan, ...pohon.daftar]}
          loading={loading}
          error={error}
          ulp={ulp}
          onUlp={(v) => { setUlp(v); setNyala(new Set()); }}
          nyala={nyala}
          onAlih={alih}
          onAlihBanyak={alihBanyak}
          onHanya={hanya}
          tampilGardu={tampilGardu}
          onTampilGardu={setTampilGardu}
          onLompat={lompat}
          onTutup={() => setPanel(false)}
        />
      ) : (
        <button
          onClick={() => setPanel(true)}
          className="absolute z-[1100] top-3 left-3 h-9 px-3 rounded-xl text-[#e2e8f0] text-sm font-medium shadow-lg flex items-center gap-2 border"
          style={{ background: PANEL, borderColor: GARIS }}
        >
          <PanelLeftOpen size={16} /> Lapisan
        </button>
      )}

      <div className="flex-1 min-w-0 relative">
        <PetaInner
          rute={rute} tiang={tiangPeta} gardu={gardu}
          fokus={fokus} onKotak={setKotak} penanda={penanda}
          onPilihTiang={pilihTiang} onPilihGardu={pilihGardu}
          sorot={terpilih ? { lat: terpilih.lat, lng: terpilih.lng } : null}
          geser={geser} onGeser={aturGeser}
          geserBanyak={geserBanyak.daftar} onSeretBanyak={geserBanyak.seret}
          ujung={ujung.titik} bolehSetujuiUjung={boleh} oleh={oleh}
          onUjungDisetujui={ujung.tandaiDisetujui}
          pohonTemuan={pohon.temuan} pohonDirabas={pohon.dirabas}
          onTugaskanPohon={boleh ? (t) => setTugasPohon([t]) : undefined}
          simulasi={simulasi.hasil}
          kesehatan={kesehatan.gardu}
          onPilihKesehatan={pilihKesehatan}
          namaTiang={namaTiang}
          nomorKabel={nomorKabel}
          antrean={antreanAktif ? antreanJtr.antrean : null}
          onPilihAntrean={pilihAntrean}
          sorotPerubahan={sorotBanding?.tiang ?? null}
          sorotJtm={sorotJtm}
          sorotKoreksi={garduJanggal.aktif ? garduJanggal.sorot : koreksi.sorot}
          isian={isianTampil ? { nilaiDi: isianPeta.nilaiDi, warna: isianPeta.warna } : null}
          loncat={indukLoncat.loncat}
          tandaMilik={tandaMilik}
        />

        {isianTampil && isianPeta.legenda.length > 0 && (
          <div
            className="absolute z-[1000] left-3 bottom-8 rounded-lg border px-3 py-2 text-[11px] text-[#e2e8f0] space-y-1 shadow-lg"
            style={{ background: PANEL, borderColor: GARIS }}
          >
            <p className="font-semibold">{namaItemTampil} · tiang di layar</p>
            {isianPeta.legenda.map((l) => (
              <p key={l.kode} className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: l.warna }} />
                <span className="flex-1">{l.label}</span>
                <span className="tabular-nums text-gray-400">{l.jumlah}</span>
              </p>
            ))}
          </div>
        )}

        {garduJanggal.aktif && (
          <PanelGarduJanggal
            g={garduJanggal}
            boleh={boleh}
            onLompat={(lat, lng) => setFokus([[lat - 0.0008, lng - 0.0008], [lat + 0.0008, lng + 0.0008]])}
            onBuka={(r) => {
              garduJanggal.setAktif(false);
              setTerpilih({ jenis: "tiang", id: r.tiang_id, kelompok: r.penyulang_tiang ?? "", lat: r.lat, lng: r.lng, kode: r.tiang_kode, jaringan: "jtm" });
              setFokus([[r.lat - 0.0008, r.lng - 0.0008], [r.lat + 0.0008, r.lng + 0.0008]]);
            }}
          />
        )}

        {koreksi.aktif && (
          <PanelKoreksiIsian
            k={koreksi}
            ulp={ulp || null}
            onLompat={(lat, lng) => setFokus([[lat - 0.0008, lng - 0.0008], [lat + 0.0008, lng + 0.0008]])}
            tampil={isianTampil}
            onTampil={setIsianTampil}
          />
        )}

        {geserBanyak.aktif && (
          <PanelGeserBanyak
            daftar={geserBanyak.daftar}
            jumlahTergeser={geserBanyak.tergeser.length}
            onBuang={geserBanyak.buang}
            onKeluar={geserBanyak.keluar}
            onSimpan={async (alasan) => {
              const ok = await geserBanyak.simpan(alasan);
              if (ok) void muatUlangPeta();
              return ok;
            }}
          />
        )}

        {bukaJtm && !terpilih && !geserBanyak.aktif && (
          <PersetujuanJtmPeta
            key={bukaJtm.id}
            d={bukaJtm}
            oleh={oleh}
            onTutup={() => setBukaJtm(null)}
            onDiputuskan={() => {
              setBukaJtm(null);
              antreanJtm.muatUlang();
              segarkan();
            }}
            onSorot={sorotSegmenJtm}
          />
        )}

        {terpilih && !geserBanyak.aktif && (
          <PanelObjek
            key={terpilih.jenis === "tiang" ? terpilih.id : `${terpilih.ulp}-${terpilih.kode}`}
            terpilih={terpilih}
            tiang={objek.tiang}
            gardu={objek.gardu}
            galat={objek.galat}
            pilihan={objek.pilihan}
            penanda={penanda}
            boleh={boleh}
            geser={geser}
            onMulaiGeser={() => setGeser({ lat: terpilih.lat, lng: terpilih.lng })}
            onBatalGeser={() => setGeser(null)}
            onSimpanGeser={simpanGeser}
            modeInduk={modeInduk}
            onGantiInduk={() => setModeInduk(true)}
            onBatalInduk={() => {
              setModeInduk(false);
              setIndukPenyulang(null);
            }}
            indukPenyulang={indukPenyulang}
            onIndukPenyulang={(p) => {
              setIndukPenyulang(p);
              setModeInduk(true);
            }}
            onIkutBatang={() => aturIndukPenyulang(null)}
            onUbahAtribut={async (isi) => {
              if (terpilih.jenis !== "tiang") return false;
              const ok = await sunting.ubahAtribut(terpilih.id, isi);
              if (ok) segarkan();
              return ok;
            }}
            onPercabangan={async (nyala) => {
              if (terpilih.jenis !== "tiang") return false;
              const ok = await sunting.tandaiPercabangan(terpilih.id, nyala);
              if (ok) segarkan();
              return ok;
            }}
            onBuatPasangan={async () => {
              if (terpilih.jenis !== "tiang") return false;
              const ok = await sunting.buatPasanganPortal(terpilih.id);
              if (ok) {
                segarkan();
                portal.muatUlang();
              }
              return ok;
            }}
            onNamaBerubah={segarkan}
            milikPenanda={
              terpilih.jenis === "tiang"
                ? ([...milikPenanda.milik].find(([k]) => k.startsWith(`${terpilih.id}|`))?.[1] ?? null)
                : null
            }
            onPemilikPeralatan={async (p) => {
              if (terpilih.jenis !== "tiang") return false;
              const ok = await sunting.pemilikPeralatan(terpilih.id, p);
              if (ok) segarkan();
              return ok;
            }}
            onBatalkan={async (alasan) => {
              if (terpilih.jenis !== "tiang") return false;
              const ok = await sunting.batalkan(terpilih.id, alasan);
              if (ok) {
                tutupObjek();
                void muatUlangPeta();
              }
              return ok;
            }}
            onTutup={tutupObjek}
            simulasi={simulasi.hasil}
            simulasiSibuk={simulasi.sibuk}
            onSimulasi={() => void jalankanSimulasi()}
            onTutupSimulasi={simulasi.tutup}
            alasanInduk={alasanInduk}
            onAlasanInduk={setAlasanInduk}
            onPangkalGardu={() => gantiIndukJtr(null)}
            onNamaJtr={async (kode) => {
              const ok = await koreksiJtr((id, g) => sunting.namaJtr(id, g, kode));
              if (ok && terpilih.jenis === "tiang") setTerpilih({ ...terpilih, kode: kode.trim().toUpperCase() });
              return ok;
            }}
            onKabelJtr={(lama, baru, jenis, ukuran, hilir) =>
              koreksiJtr((id, g) => sunting.kabelJtr(id, g, lama, baru, jenis, ukuran, hilir))}
            onAsalJtr={(nomor, huluId, dariGardu) =>
              koreksiJtr((id, g) => sunting.asalKabelJtr(id, g, nomor, huluId, dariGardu))}
            onJurusanKabelJtr={(nomor, jurusan) => koreksiJtr((id, g) => sunting.jurusanKabelJtr(id, g, nomor, jurusan))}
            onJurusanJtr={(jurusan, hilir) => koreksiJtr((id, g) => sunting.jurusanJtr(id, g, jurusan, hilir))}
            inspeksiJtr={inspeksiTerpilih}
            oleh={oleh}
            onDiputuskan={() => {
              antreanJtr.muatUlang();
              setSorotBanding(null);
              segarkan();
            }}
            onSorot={setSorotBanding}
            modeGabung={modeGabung}
            onMulaiGabung={() => setModeGabung(true)}
            onBatalGabung={() => setModeGabung(false)}
            onLepasTumpang={async (alasan) => {
              const tid = objek.tiang?.jtr?.tumpangId;
              if (!tid) return false;
              const ok = await sunting.lepasTumpangJtr(tid, alasan);
              if (ok) {
                tutupObjek();
                void muatUlangPeta();
              }
              return ok;
            }}
          />
        )}

        {!terpilih && !geserBanyak.aktif && (ujungAktif || kesehatanAktif || pohonAktif) && (
          <div className="absolute z-[1050] top-14 right-3 bottom-3 flex flex-col gap-2 overflow-y-auto pointer-events-none [&>*]:pointer-events-auto">
            {kesehatanAktif && (
              <PanelKesehatan
                saring={saringKesehatan}
                onSaring={setSaringKesehatan}
                hitung={kesehatan.hitung}
                jumlah={kesehatan.gardu.length}
                sibuk={kesehatan.sibuk}
                galat={kesehatan.galat}
                onTutup={() => setKesehatanAktif(false)}
              />
            )}
            {pohonAktif && (
              <PanelPohon
                tahun={bulanPohon.tahun}
                bulan={bulanPohon.bulan}
                onBulan={(tahun, bulan) => setBulanPohon({ tahun, bulan })}
                saring={saringPohon}
                onSaring={setSaringPohon}
                jumlah={pohon.temuan.length + pohon.dirabas.length}
                total={pohon.total}
                tertangani={pohon.tertangani}
                sibuk={pohon.sibuk}
                galat={pohon.galat}
                onTutup={padamkanPohon}
                bisaDitugaskan={bisaTugasPohon.length}
                onTugaskanSemua={boleh ? () => setTugasPohon(bisaTugasPohon) : undefined}
              />
            )}
            {ujungAktif && (
          <PanelUjung
            tahun={bulanUjung.tahun}
            bulan={bulanUjung.bulan}
            onBulan={(tahun, bulan) => setBulanUjung({ tahun, bulan })}
            saring={saringUjung}
            onSaring={setSaringUjung}
            jumlah={ujung.titik.length}
            total={ujung.total}
            sibuk={ujung.sibuk}
            galat={ujung.galat}
            onTutup={() => setUjungAktif(false)}
          />
            )}
          </div>
        )}

        {tugasPohon && (
          <TugaskanPohonPeta daftar={tugasPohon} oleh={oleh} onTutup={() => setTugasPohon(null)} onSelesai={pohon.muatUlang} />
        )}

        {calonGabung && terpilih?.jenis === "tiang" && terpilih.jaringan === "jtr" && (
          <BatalkanModal
            judul={`Gabungkan ${terpilih.kode} ke batang ${calonGabung.kode}?`}
            keterangan={`Untuk tiang KEMBAR: ${terpilih.kode} dan ${calonGabung.kode} ternyata batang yang sama. Gardu ${terpilih.kelompok} lalu menumpang di ${calonGabung.kode} — nama ${terpilih.kode}, induk, kabel, dan tiang sesudahnya ikut.`}
            peringatan={`Batang ${terpilih.kode} dibatalkan (titiknya tidak dipakai lagi).`}
            labelTombol="Gabungkan"
            placeholder="Alasan — mis. GPS meleset, batangnya sama dengan tiang JTM"
            onTutup={() => setCalonGabung(null)}
            onBatalkan={async (alasan) => {
              const t = calonGabung;
              const ok = await sunting.gabungJtr(terpilih.id, terpilih.kelompok, t.id, alasan);
              if (ok) {
                setCalonGabung(null);
                setModeGabung(false);
                setTerpilih({ ...terpilih, id: t.id, lat: t.lat, lng: t.lng });
                segarkan();
              }
              return ok;
            }}
          />
        )}

        {calonInduk && terpilih?.jenis === "tiang" && terpilih.jaringan === "jtr" && (
          <ConfirmDialog
            title={`Jadikan ${calonInduk.kode} induk ${terpilih.kode}?`}
            message={
              alasanInduk.trim()
                ? `Kabel JTR gardu ${terpilih.kelompok} di tiang ini akan menyambung dari ${calonInduk.kode}. Nama tiang tidak berubah otomatis — ganti namanya bila perlu.`
                : "Isi dulu alasannya di panel kanan."
            }
            confirmLabel="Ganti induk"
            onConfirm={async () => {
              const t = calonInduk;
              setCalonInduk(null);
              if (alasanInduk.trim()) await gantiIndukJtr(t.id);
            }}
            onClose={() => setCalonInduk(null)}
          />
        )}

        {calonInduk && terpilih?.jenis === "tiang" && terpilih.jaringan !== "jtr" && indukPenyulang && (
          <ConfirmDialog
            title={`Sambungkan ${terpilih.kode} dari ${calonInduk.kode} di ${indukPenyulang}?`}
            message={`Di penyulang ${indukPenyulang}, tiang ini menyambung dari ${calonInduk.kode}. Induk di penyulang pemiliknya tidak berubah. Nama ${indukPenyulang} tiang ini tidak berubah otomatis — Generate ulang nama ${indukPenyulang} sesudahnya.`}
            confirmLabel="Sambungkan"
            onConfirm={async () => {
              const t = calonInduk;
              setCalonInduk(null);
              await aturIndukPenyulang(t.id);
            }}
            onClose={() => setCalonInduk(null)}
          />
        )}

        {calonInduk && terpilih?.jenis === "tiang" && terpilih.jaringan !== "jtr" && !indukPenyulang && (
          <ConfirmDialog
            title={`Jadikan ${calonInduk.kode} induk ${terpilih.kode}?`}
            message="Jalur jaringan tiang ini akan menyambung dari tiang yang Anda klik. Nama tiang tidak berubah otomatis — kalau urutannya jadi janggal, nomori ulang penyulangnya dari tab Tiang di Inspeksi JTM."
            confirmLabel="Ganti induk"
            onConfirm={async () => {
              const t = calonInduk;
              setCalonInduk(null);
              const ok = await sunting.ubahInduk(terpilih.id, t.id);
              if (ok) {
                setModeInduk(false);
                segarkan();
              }
            }}
            onClose={() => setCalonInduk(null)}
          />
        )}

        {/* ── Bilah keadaan ──────────────────────────────────────────────────
            Penghitung objek berdiri di sini SEJAK AWAL, bukan ditambahkan
            kalau nanti terasa berat. Waktu peta melambat, yang pertama
            dibutuhkan adalah angka — bukan tebakan tentang lapisan mana yang
            bocor. */}
        <div className="absolute z-[1000] bottom-3 left-3 flex flex-wrap items-center gap-2 text-[11px] max-w-[calc(100%-1.5rem)]">
          <div
            className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm flex items-center gap-2 tabular-nums font-mono text-gray-300 border"
            style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
          >
            {sibuk && <Loader2 size={11} className="animate-spin text-[#5eead4]" />}
            <span>zoom {zoom}</span>
            <span className="text-gray-600">|</span>
            <span>{jumlahObjek.toLocaleString("id-ID")} objek</span>
            {tiang.length > 0 && <span className="text-gray-500">{tiang.length} tiang</span>}
            {gardu.length > 0 && <span className="text-gray-500">{gardu.length} gardu</span>}
          </div>

          {adaJaringan && zoom < ZOOM_TIANG && (
            <div
              className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm text-gray-400 border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Perbesar ke zoom {ZOOM_TIANG} untuk melihat tiang satu per satu
            </div>
          )}

          {!adaGarduPilihan && tampilGardu && zoom < ZOOM_GARDU && (
            <div
              className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm text-gray-400 border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Perbesar untuk melihat gardu — atau centang penyulangnya di folder Gardu
            </div>
          )}

          {terpotong && (
            <div className="rounded-lg bg-amber-500/90 text-white px-2.5 py-1.5 flex items-center gap-1.5">
              <TriangleAlert size={12} />
              Terlalu banyak tiang di layar — sebagian tidak digambar
            </div>
          )}
          {(namaTiang || nomorKabel || isianTampil) && tiang.length > BATAS_NAMA && (
            <div className="rounded-lg bg-[#0b1220]/85 text-[#e2e8f0] px-2.5 py-1.5 border" style={{ borderColor: GARIS }}>
              Label tiang tampil setelah diperbesar ({tiang.length} tiang di layar, maks {BATAS_NAMA})
            </div>
          )}
        </div>

        {antreanAktif && (
          <div
            className="absolute z-[1000] top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs text-[#e2e8f0] shadow-xl"
            style={{ background: PANEL, borderColor: GARIS }}
          >
            <ClipboardCheck size={14} className="text-[#FACC15]" />
            {antreanJtr.antrean.length === 0 ? (
              <span>Tidak ada inspeksi JTR menunggu persetujuan</span>
            ) : (
              <>
                <button onClick={() => geserAntrean(-1)} className="p-1 rounded hover:bg-white/10" aria-label="Sebelumnya"><ChevronLeft size={15} /></button>
                <span className="tabular-nums">
                  {Math.min(posAntrean + 1, antreanJtr.antrean.length)} / {antreanJtr.antrean.length}
                  <b className="ml-2">{antreanJtr.antrean[Math.min(posAntrean, antreanJtr.antrean.length - 1)]?.gardu_kode}</b>
                </span>
                <button onClick={() => geserAntrean(1)} className="p-1 rounded hover:bg-white/10" aria-label="Berikutnya"><ChevronRight size={15} /></button>
              </>
            )}
            <button onClick={() => setAntreanAktif(false)} className="p-1 rounded hover:bg-white/10" aria-label="Tutup antrean"><X size={14} /></button>
          </div>
        )}

        {jtmAktif && (
          <div
            className="absolute z-[1000] top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs text-[#e2e8f0] shadow-xl"
            style={{ background: PANEL, borderColor: GARIS }}
          >
            <ClipboardCheck size={14} className="text-[#60A5FA]" />
            {antreanJtm.antrean.length === 0 ? (
              <span>Tidak ada inspeksi JTM menunggu persetujuan</span>
            ) : (
              <>
                <button onClick={() => geserJtm(-1)} className="p-1 rounded hover:bg-white/10" aria-label="Sebelumnya"><ChevronLeft size={15} /></button>
                <span className="tabular-nums">
                  {Math.min(posJtm + 1, antreanJtm.antrean.length)} / {antreanJtm.antrean.length}
                  <b className="ml-2">{antreanJtm.antrean[Math.min(posJtm, antreanJtm.antrean.length - 1)]?.segmen_nama ?? "segmen"}</b>
                </span>
                <button onClick={() => geserJtm(1)} className="p-1 rounded hover:bg-white/10" aria-label="Berikutnya"><ChevronRight size={15} /></button>
              </>
            )}
            <button
              onClick={() => { setJtmAktif(false); setBukaJtm(null); }}
              className="p-1 rounded hover:bg-white/10"
              aria-label="Tutup antrean JTM"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {portalAktif && (
          <div
            className="absolute z-[1000] top-[6.5rem] left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs text-[#e2e8f0] shadow-xl"
            style={{ background: PANEL, borderColor: GARIS }}
          >
            <Columns2 size={14} className="text-[#c084fc]" />
            {portal.daftar.length === 0 ? (
              <span>Semua gardu portal sudah dua tiang</span>
            ) : (
              <>
                <button onClick={() => geserPortal(-1)} className="p-1 rounded hover:bg-white/10" aria-label="Sebelumnya"><ChevronLeft size={15} /></button>
                <span className="tabular-nums">
                  {Math.min(posPortal + 1, portal.daftar.length)} / {portal.daftar.length}
                  <b className="ml-2">{portal.daftar[Math.min(posPortal, portal.daftar.length - 1)]?.kode}</b>
                  <span className="ml-1 text-gray-400">{portal.daftar[Math.min(posPortal, portal.daftar.length - 1)]?.nomorGardu ?? ""}</span>
                </span>
                <button onClick={() => geserPortal(1)} className="p-1 rounded hover:bg-white/10" aria-label="Berikutnya"><ChevronRight size={15} /></button>
              </>
            )}
            <button onClick={() => setPortalAktif(false)} className="p-1 rounded hover:bg-white/10" aria-label="Tutup daftar portal"><X size={14} /></button>
          </div>
        )}

        <div className="absolute z-[1000] top-3 right-3 flex items-center gap-2">
          <MenuKelompok
            label="JTM"
            terbuka={menuBuka === "jtm"}
            onBuka={() => bukaMenu("jtm")}
            angka={(bolehSetujui ? antreanJtm.antrean.length : 0) + (boleh ? portal.daftar.length : 0)}
            warnaAngka="#60A5FA"
            menyala={jtmAktif || koreksi.aktif || isianTampil || portalAktif}
            kelas={TOMBOL_ATAS}
          >
              {bolehSetujui ? (
                <button
                  onClick={() => {
                    const nyalakan = !jtmAktif;
                    setJtmAktif(nyalakan);
                    if (nyalakan) setAntreanAktif(false);
                    if (!nyalakan) setBukaJtm(null);
                    if (nyalakan && antreanJtm.antrean.length > 0) {
                      setPosJtm(0);
                      bukaAntreanJtm(antreanJtm.antrean[0]);
                    }
                  }}
                  className={`${TOMBOL_ATAS} ${jtmAktif ? "ring-1 ring-[#60A5FA]" : ""}`}
                  style={{ background: jtmAktif ? "rgba(96,165,250,0.25)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                  title="Antrean inspeksi JTM yang menunggu persetujuan"
                >
                  <ClipboardCheck size={15} /> Persetujuan JTM
                  {antreanJtm.antrean.length > 0 && (
                    <span className="ml-0.5 px-1.5 rounded-full bg-[#60A5FA] text-[#0b1220] text-[11px] font-bold">{antreanJtm.antrean.length}</span>
                  )}
                </button>
              ) : null}
              {boleh && (
                <button
                  onClick={() => {
                    tutupObjek();
                    if (koreksi.aktif) koreksi.keluar();
                    else {
                      garduJanggal.setAktif(false);
                      koreksi.mulai();
                    }
                  }}
                  className={`${TOMBOL_ATAS} ${koreksi.aktif ? "ring-1 ring-[#5eead4]" : ""}`}
                  style={{ background: koreksi.aktif ? "rgba(94,234,212,0.2)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                  title="Betulkan isian inspeksi JTM (mis. ukuran kabel) per rentang tiang, atau yang janggal"
                >
                  <ListChecks size={15} /> Koreksi isian
                </button>
              )}
              <button
                onClick={() => setIsianTampil((v) => !v)}
                className={`${TOMBOL_ATAS} ${isianTampil ? "ring-1 ring-[#00897B]" : ""}`}
                style={{ background: isianTampil ? "rgba(0,137,123,0.35)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                title="Tulis ukuran konduktor JTM di tiap tiang, berwarna per ukuran — yang beda sendiri langsung terlihat"
              >
                <Ruler size={15} /> {namaItemTampil}
              </button>
              {boleh && (
                <button
                  onClick={() => {
                    const nyalakan = !portalAktif;
                    setPortalAktif(nyalakan);
                    if (nyalakan && portal.daftar.length > 0) {
                      setPosPortal(0);
                      bukaPortal(portal.daftar[0]);
                    }
                  }}
                  className={`${TOMBOL_ATAS} ${portalAktif ? "ring-1 ring-[#c084fc]" : ""}`}
                  style={{ background: portalAktif ? "rgba(192,132,252,0.25)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                  title="Gardu portal yang baru tercatat satu tiang — buatkan tiang keduanya"
                >
                  <Columns2 size={15} /> Portal
                  {portal.daftar.length > 0 && (
                    <span className="ml-0.5 px-1.5 rounded-full bg-[#c084fc] text-[#0b1220] text-[11px] font-bold">{portal.daftar.length}</span>
                  )}
                </button>
              )}
          </MenuKelompok>
          <MenuKelompok
            label="JTR"
            terbuka={menuBuka === "jtr"}
            onBuka={() => bukaMenu("jtr")}
            angka={bolehSetujui ? antreanJtr.antrean.length : 0}
            warnaAngka="#FACC15"
            menyala={antreanAktif || nomorKabel}
            kelas={TOMBOL_ATAS}
          >
              {bolehSetujui ? (
                <button
                  onClick={() => {
                    const nyalakan = !antreanAktif;
                    setAntreanAktif(nyalakan);
                    if (nyalakan) { setJtmAktif(false); setBukaJtm(null); }
                    if (nyalakan && antreanJtr.antrean.length > 0) {
                      setPosAntrean(0);
                      bukaAntrean(antreanJtr.antrean[0]);
                    }
                  }}
                  className={`${TOMBOL_ATAS} ${antreanAktif ? "ring-1 ring-[#FACC15]" : ""}`}
                  style={{ background: antreanAktif ? "rgba(250,204,21,0.25)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                  title="Antrean inspeksi JTR yang menunggu persetujuan"
                >
                  <ClipboardCheck size={15} /> Persetujuan JTR
                  {antreanJtr.antrean.length > 0 && (
                    <span className="ml-0.5 px-1.5 rounded-full bg-[#FACC15] text-[#0b1220] text-[11px] font-bold">{antreanJtr.antrean.length}</span>
                  )}
                </button>
              ) : null}
              <button
                onClick={() => setNomorKabel((v) => !v)}
                className={`${TOMBOL_ATAS} ${nomorKabel ? "ring-1 ring-[#00897B]" : ""}`}
                style={{ background: nomorKabel ? "rgba(0,137,123,0.35)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                title="Tulis nomor kabel JTR tiap tiang — merah = satu kabel bernomor selain 1 (hampir pasti salah catat)"
              >
                <Hash size={15} /> Nomor kabel
              </button>
          </MenuKelompok>
          <MenuKelompok
            label="Gardu"
            terbuka={menuBuka === "gardu"}
            onBuka={() => bukaMenu("gardu")}
            angka={garduJanggal.jumlah}
            warnaAngka="#F59E0B"
            menyala={kesehatanAktif || ujungAktif || garduJanggal.aktif}
            kelas={TOMBOL_ATAS}
          >
              <button
                onClick={() => {
                  tutupObjek();
                  if (koreksi.aktif) koreksi.keluar();
                  garduJanggal.setAktif(!garduJanggal.aktif);
                }}
                className={`${TOMBOL_ATAS} ${garduJanggal.aktif ? "ring-1 ring-[#F59E0B]" : ""}`}
                style={{ background: garduJanggal.aktif ? "rgba(245,158,11,0.25)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                title="Kode gardu di tiang yang penyulangnya beda dengan master gardu, atau dipakai lebih dari satu tiang"
              >
                <TriangleAlert size={15} /> Gardu janggal
                {garduJanggal.jumlah > 0 && (
                  <span className="ml-0.5 px-1.5 rounded-full bg-[#F59E0B] text-[#0b1220] text-[11px] font-bold">{garduJanggal.jumlah}</span>
                )}
              </button>
              <button
                onClick={() => setKesehatanAktif((v) => !v)}
                className={`${TOMBOL_ATAS} ${kesehatanAktif ? "ring-1 ring-[#00897B]" : ""}`}
                style={{ background: kesehatanAktif ? "rgba(0,137,123,0.35)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                title="Warnai gardu menurut beban, jatuh tegangan, dan tegangan ujung"
              >
                <Activity size={15} /> Kesehatan gardu
              </button>
              <button
                onClick={() => setUjungAktif((v) => !v)}
                className={`${TOMBOL_ATAS} ${ujungAktif ? "ring-1 ring-[#00897B]" : ""}`}
                style={{ background: ujungAktif ? "rgba(0,137,123,0.35)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
                title="Tampilkan titik ukur tegangan ujung"
              >
                <Gauge size={15} /> Tegangan ujung
              </button>
          </MenuKelompok>
          <span className="w-px h-6 bg-white/15" aria-hidden />
          {boleh && (
            <button
              onClick={() => {
                tutupObjek();
                geserBanyak.mulai();
              }}
              disabled={geserBanyak.aktif}
              className={`${TOMBOL_ATAS} ${geserBanyak.aktif ? "ring-1 ring-[#5eead4]" : ""}`}
              style={{ background: geserBanyak.aktif ? "rgba(94,234,212,0.2)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
              title="Geser titik banyak tiang sekaligus, simpan dengan satu alasan"
            >
              <Move size={15} /> Geser titik
            </button>
          )}
          <button
            onClick={() => setNamaTiang((v) => !v)}
            className={`${TOMBOL_ATAS} ${namaTiang ? "ring-1 ring-[#00897B]" : ""}`}
            style={{ background: namaTiang ? "rgba(0,137,123,0.35)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
            title="Tulis nama tiap tiang di peta"
          >
            <Tags size={15} /> Nama tiang
          </button>
          <button
            onClick={() => void muatUlangSemua()}
            disabled={memuatUlang}
            className={TOMBOL_ATAS}
            style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            title="Muat ulang isi peta sesudah menyunting — pilihan lapisan & posisi tetap"
          >
            <RefreshCw size={15} className={memuatUlang ? "animate-spin" : ""} /> Muat ulang
          </button>
          <Link href="/admin/dashboard" className={TOMBOL_ATAS} style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}>
            <ArrowLeft size={15} /> Kembali
          </Link>
        </div>

        {nyala.size === 0 && !loading && (
          <div className="absolute z-[1000] inset-x-0 top-1/2 -translate-y-1/2 grid place-items-center pointer-events-none px-4">
            <p
              className="rounded-xl text-gray-300 text-sm px-4 py-3 max-w-sm text-center leading-relaxed backdrop-blur-sm border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Pilih penyulang atau gardu di panel kiri — atau ketik namanya di kotak cari.
              <span className="block text-gray-500 text-xs mt-1">
                Peta sengaja dibuka kosong supaya tidak menarik puluhan ribu titik yang belum
                tentu Anda butuhkan.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
