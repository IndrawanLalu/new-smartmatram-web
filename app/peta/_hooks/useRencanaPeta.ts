"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { bacaBahanRencana, keGawang, keJurusan, type JurusanJtr, type PengaturanJtr } from "@/app/admin/pengukuran-gardu/_hooks/useAnalisisJtr";
import { buatRencana, opsiDiTiang, tiangKunciSendiri, type GawangJtr, type OpsiPecah, type PeranTitik, type Rencana } from "@/app/admin/pengukuran-gardu/_lib/rencanaJtr";

/**
 * Rencana perbaikan JTR di peta — dibuka dari Analisis JTR ("Lihat di peta",
 * /peta?rencana=GS219&jurusan=B&opsi=…). Rencananya DIHITUNG ULANG di sini
 * dengan `buatRencana` yang sama, bukan dikirim lewat alamat: hasil peta dan
 * tabel tidak bisa berbeda, dan alamatnya tetap pendek.
 *
 * Pilihan titik pecah bisa diganti di panel, dan "Pilih titik di peta"
 * menghitung pecah di tiang mana pun yang diklik (opsiDiTiang).
 */

type Koord = { lat: number; lng: number };

export interface TitikRencana extends Koord {
  tiang_id: string;
  kode: string | null;
  peran: PeranTitik;
}

/** Gawang yang pindah — garis tiang → hulunya, untuk disorot. */
export type GarisPindah = [[number, number], [number, number]];

export interface OpsiPeta extends OpsiPecah, Koord {
  nomor: number;
}

export interface RencanaPeta {
  r: JurusanJtr;
  rencana: Rencana | null;
  /** Penanda selain titik pecah (sisip, kabel kecil). */
  titik: TitikRencana[];
  opsi: OpsiPeta[];
  pindah: GarisPindah[];
  /** Semua tiang jurusan itu — sasaran klik mode pilih. */
  tiang: (Koord & { id: string; kode: string | null; sr: number })[];
}

interface Dasar {
  r: JurusanJtr;
  rencana: Rencana | null;
  gawang: GawangJtr[];
  koord: Map<string, Koord>;
  pengaturan: PengaturanJtr;
}

type Buka = { gardu: string; jurusan: string; opsi?: string };

export function useRencanaPeta(awal: Buka | null) {
  const [buka, setBuka] = useState(awal);
  const [dasar, setDasar] = useState<Dasar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [terpilih, setTerpilih] = useState("");
  const [sendiri, setSendiri] = useState<OpsiPecah[]>([]);
  const [modePilih, setModePilih] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    if (!buka) return;
    let batal = false;
    (async () => {
      const g = buka.gardu.toUpperCase();
      const [baris, gw, bahan] = await Promise.all([
        supabaseBrowser.from("analisis_jtr_jurusan").select("*").eq("gardu_kode", g).eq("jurusan", buka.jurusan).maybeSingle(),
        supabaseBrowser.from("analisis_jtr_gawang").select("*").eq("gardu_kode", g).eq("jurusan", buka.jurusan),
        bacaBahanRencana(),
      ]);
      if (baris.error || gw.error) throw baris.error ?? gw.error;
      if (!baris.data) throw new Error(`${g} jurusan ${buka.jurusan} tidak ada di Analisis JTR.`);
      const gawang = (gw.data ?? []).map(keGawang);
      const ids = gawang.map((x) => x.tiang_id);
      const koord = new Map<string, Koord>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data: t, error } = await supabaseBrowser.from("tiang").select("id,lat,lng").in("id", ids.slice(i, i + 150));
        if (error) throw error;
        for (const x of t ?? []) if (x.lat !== null && x.lng !== null) koord.set(x.id, { lat: Number(x.lat), lng: Number(x.lng) });
      }
      const r = keJurusan(baris.data);
      const rencana = buatRencana(r, gawang, bahan.pengaturan, bahan.kha);
      if (batal) return;

      // Opsi dari alamat: pilihan sistem, atau "pilihan sendiri" yang
      // dihitung ulang di tiangnya (hulu cabang / ujung kabel pindah SR).
      let awalSendiri: OpsiPecah[] = [];
      if (buka.opsi?.endsWith("|sendiri")) {
        const t = tiangKunciSendiri(buka.opsi, gawang);
        if (t) awalSendiri = opsiDiTiang(r, gawang, bahan.pengaturan, t);
      }
      const semua = [...(rencana?.pilihan ?? []), ...awalSendiri];
      setSendiri(awalSendiri);
      setTerpilih(
        semua.find((o) => o.kunci === buka.opsi)?.kunci ??
          (rencana?.jenis === "tambah-jurusan" ? (rencana.pilihan?.[0]?.kunci ?? "") : ""),
      );
      setDasar({ r, rencana, gawang, koord, pengaturan: bahan.pengaturan });
    })().catch((e: Error) => {
      if (!batal) setGalat(e.message);
    });
    return () => {
      batal = true;
    };
  }, [buka]);

  const data = useMemo<RencanaPeta | null>(() => {
    if (!dasar) return null;
    const { r, rencana, gawang, koord } = dasar;
    const opsi = [...(rencana?.pilihan ?? []), ...sendiri].flatMap((o, i) => {
      const k = koord.get(o.titikId);
      return k ? [{ ...o, ...k, nomor: i + 1 }] : [];
    });
    const aktif = opsi.find((o) => o.kunci === terpilih);
    const hulu = new Map(gawang.map((x) => [x.tiang_id, x.hulu_id]));
    const pindah: GarisPindah[] = [];
    // Pindah SR: yang disorot seluruh jalur kabel baru (gardu → X), bukan
    // hanya gawang tiang ber-SR.
    const jalur: string[] = [];
    if (aktif?.cara === "pindah-sr") {
      for (let id: string | null | undefined = aktif.titikId; id && !jalur.includes(id); id = hulu.get(id)) jalur.push(id);
    }
    for (const id of jalur.length ? jalur : aktif ? aktif.pindah : (rencana?.pindah ?? [])) {
      const a = koord.get(id);
      const h = hulu.get(id);
      const b = h ? koord.get(h) : undefined;
      if (a && b) pindah.push([[b.lat, b.lng], [a.lat, a.lng]]);
    }
    const titik = (rencana?.titik ?? [])
      .filter((t) => t.peran !== "pecah")
      .flatMap((t) => {
        const k = koord.get(t.tiang_id);
        return k ? [{ ...t, ...k }] : [];
      });
    const tiang = gawang.flatMap((x) => {
      const k = koord.get(x.tiang_id);
      return k ? [{ id: x.tiang_id, kode: x.kode, sr: x.tarikan_sr, ...k }] : [];
    });
    return { r, rencana, titik, opsi, pindah, tiang };
  }, [dasar, sendiri, terpilih]);

  /** Untuk membingkai peta — hanya berubah saat jurusannya dimuat. */
  const bingkai = useMemo(() => (dasar ? [...dasar.koord.values()] : null), [dasar]);

  /** Hitung pecah di tiang yang diklik user. */
  const hitungDi = (tiangId: string) => {
    if (!dasar) return;
    const o = opsiDiTiang(dasar.r, dasar.gawang, dasar.pengaturan, tiangId);
    const kode = dasar.gawang.find((x) => x.tiang_id === tiangId)?.kode ?? "tiang";
    if (!o.length) {
      setPesan(`${kode}: tidak ada pilihan — tanpa SR di jalurnya dan tanpa cabang.`);
      return;
    }
    setSendiri(o);
    setTerpilih(o[0].kunci);
    setPesan(o.length > 1 ? `${kode}: ${o.length} pilihan (potong cabang / pindah SR) — pilih di daftar.` : null);
    setModePilih(false);
  };

  const tutup = () => {
    setBuka(null);
    setDasar(null);
    setGalat(null);
    setSendiri([]);
    setModePilih(false);
    setPesan(null);
  };

  return {
    aktif: buka !== null,
    buka,
    data,
    bingkai,
    galat,
    tutup,
    terpilih,
    pilih: setTerpilih,
    modePilih,
    setModePilih,
    hitungDi,
    pesan,
  };
}

export type RencanaPetaState = ReturnType<typeof useRencanaPeta>;
