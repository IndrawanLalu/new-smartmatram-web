"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { bacaJaringanGardu, bacaMaterialRekonduktor, bacaOpsiKabelJtr, type JaringanGardu } from "@/lib/bacaJtrGardu";
import {
  buatRuas, materialRekonduktor, telusuriJalur, type ItemTiang, type Jalur, type MaterialRekonRef, type RuasRekonduktor,
} from "@/lib/rekonduktorJtr";
import { keSurvey, pesanSurvey, type LatarSurvey, type StatusSurvey } from "@/lib/surveyJaringan";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Survey Jaringan — Rekonduktor JTR di peta (23 Nov 2026), /peta?rekonduktor=<id|baru>.
 *
 * Langkah: pilih gardu (klik gardu / tiang JTR-nya, atau ketik kodenya) →
 * klik tiang awal (atau "Mulai dari gardu") → klik tiang akhir. Jalurnya
 * ditelusuri per KABEL dari tiang akhir ke arah gardu (telusuriJalur), jadi
 * di tiang percabangan yang terpilih cabang menuju tiang terakhir. Satu survey
 * boleh beberapa ruas. Disimpan sekaligus (simpan_survey_rekonduktor).
 */

export type LangkahRekon = "gardu" | "awal" | "akhir" | "lihat";

export interface KepalaRekon {
  id: string | null;
  judul: string;
  catatan: string;
  status: StatusSurvey;
  penyulang: string | null;
  latar: LatarSurvey;
}
const KEPALA_BARU: KepalaRekon = { id: null, judul: "", catatan: "", status: "Draf", penyulang: null, latar: "jalan" };
type Kabel = Pick<RuasRekonduktor, "kabel_jenis" | "kabel_ukuran">;

export function useRekonduktorPeta(awal: string | null) {
  const [buka, setBuka] = useState(awal);
  const [kepala, setKepala] = useState<KepalaRekon>(KEPALA_BARU);
  const [gardu, setGardu] = useState<string | null>(null);
  const [jaringan, setJaringan] = useState<JaringanGardu | null>(null);
  const [ruas, setRuas] = useState<RuasRekonduktor[]>([]);
  const [langkah, setLangkah] = useState<LangkahRekon>("lihat");
  /** Tiang awal yang sudah diklik; null = dari gardu. */
  const [tiangAwal, setTiangAwal] = useState<{ id: string | null } | null>(null);
  /** Lebih dari satu kabel sejajar menuju tiang akhir — user memilih. */
  const [calon, setCalon] = useState<Jalur[]>([]);
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [kabelBawaan, setKabelBawaan] = useState<Kabel>({ kabel_jenis: null, kabel_ukuran: null });
  const [ref, setRef] = useState<MaterialRekonRef[]>([]);
  const [opsiKabel, setOpsiKabel] = useState<{ jenis: string[]; ukuran: string[] }>({ jenis: [], ukuran: [] });
  const [bingkai, setBingkai] = useState<{ lat: number; lng: number }[] | null>(null);
  const [berubah, setBerubah] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    if (!buka) return;
    let batal = false;
    void Promise.all([bacaMaterialRekonduktor(), bacaOpsiKabelJtr()])
      .then(([m, o]) => {
        if (batal) return;
        setRef(m);
        setOpsiKabel(o);
      })
      .catch((e: Error) => !batal && setGalat(e.message));
    if (buka === "baru") {
      setKepala(KEPALA_BARU);
      setRuas([]);
      setLangkah("gardu");
      return () => { batal = true; };
    }
    setMemuat(true);
    (async () => {
      const { data, error } = await supabaseBrowser.from("survey_jaringan_daftar").select("*").eq("id", buka).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Survey tidak ditemukan.");
      const s = keSurvey(data);
      if (batal) return;
      setKepala({ id: s.id, judul: s.judul, catatan: s.catatan ?? "", status: s.status, penyulang: s.penyulang, latar: s.latar });
      setGardu(s.gardu_kode);
      setRuas(s.ruas);
      const akhir = s.ruas[s.ruas.length - 1];
      if (akhir) setKabelBawaan({ kabel_jenis: akhir.kabel_jenis, kabel_ukuran: akhir.kabel_ukuran });
      setLangkah("lihat");
      setBingkai(s.ruas.flatMap((r) => r.tiang));
    })()
      .catch((e) => !batal && setGalat(pesanSurvey(e)))
      .finally(() => !batal && setMemuat(false));
    return () => { batal = true; };
  }, [buka]);

  // Kabel JTR gardu terpilih — dasar penelusuran ruas berikutnya.
  useEffect(() => {
    if (!gardu) return;
    let batal = false;
    setJaringan(null);
    bacaJaringanGardu(gardu)
      .then((j) => {
        if (batal) return;
        if (!j.gawang.length) setGalat(`Gardu ${gardu} belum punya data kabel JTR.`);
        setJaringan(j);
        setBingkai((b) => b ?? [...j.data.values(), ...(j.gardu ? [j.gardu] : [])]);
      })
      .catch((e: Error) => !batal && setGalat(e.message));
    return () => { batal = true; };
  }, [gardu]);

  useEffect(() => {
    if (!berubah) return;
    const tahan = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [berubah]);

  const draf = kepala.status === "Draf";
  const material = useMemo(() => materialRekonduktor(ruas, ref), [ruas, ref]);

  const ubahRuasSemua = (f: (r: RuasRekonduktor[]) => RuasRekonduktor[]) => {
    setRuas(f);
    setBerubah(true);
  };

  const pilihGardu = (kode: string) => {
    const k = kode.trim().toUpperCase();
    if (!k) return;
    setGalat(null);
    setGardu(k);
    setBingkai(null);
    setLangkah("awal");
  };

  const tambahJalur = (j: Jalur) => {
    if (!jaringan) return;
    const dipakai = new Set(ruas.flatMap((r) => r.tiang.map((t) => t.tiang_id)));
    const r = buatRuas(j, jaringan.data, jaringan.aks, dipakai, kabelBawaan);
    ubahRuasSemua((rs) => [...rs, r]);
    setTerbuka(r.id);
    setCalon([]);
    setTiangAwal(null);
    setLangkah("lihat");
  };

  /** Klik tiang JTR saat memilih ruas (dipanggil peta sebagai pengganti panel tiang). */
  const klikTiang = (t: TiangPeta) => {
    if (!draf || t.jaringan !== "jtr") return;
    if (langkah === "gardu" || !gardu) {
      pilihGardu(t.kelompok);
      return;
    }
    if (t.kelompok.toUpperCase() !== gardu) {
      setGalat(`Tiang ${t.kode} milik JTR gardu ${t.kelompok}, bukan ${gardu}.`);
      return;
    }
    setGalat(null);
    if (langkah === "awal") {
      setTiangAwal({ id: t.id });
      setLangkah("akhir");
      return;
    }
    if (langkah !== "akhir" || !tiangAwal || !jaringan) return;
    const jalur = telusuriJalur(jaringan.gawang, tiangAwal.id, t.id);
    if (!jalur.length) {
      setGalat(
        tiangAwal.id === t.id
          ? "Tiang akhir sama dengan tiang awal — klik tiang lain."
          : `Tiang ${t.kode} tidak satu jalur kabel dengan tiang awal. Pilih tiang di jurusan yang sama.`,
      );
      return;
    }
    if (jalur.length > 1) setCalon(jalur);
    else tambahJalur(jalur[0]);
  };

  const mulaiRuas = () => {
    setGalat(null);
    setCalon([]);
    setTiangAwal(null);
    setLangkah(gardu ? "awal" : "gardu");
  };
  /** Hanya selama belum ada ruas — ruas selalu milik satu gardu. */
  const gantiGardu = () => {
    if (ruas.length) return;
    batalPilih();
    setLangkah("gardu");
  };
  const dariGardu = () => {
    setTiangAwal({ id: null });
    setLangkah("akhir");
  };
  const batalPilih = () => {
    setCalon([]);
    setTiangAwal(null);
    setLangkah("lihat");
  };

  const ubahRuas = (id: string, patch: Partial<RuasRekonduktor>) => {
    ubahRuasSemua((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if ("kabel_jenis" in patch || "kabel_ukuran" in patch) setKabelBawaan((k) => ({ ...k, ...patch }));
  };
  const ubahTiang = (ruasId: string, tiangId: string, k: ItemTiang, v: number) =>
    ubahRuasSemua((rs) =>
      rs.map((r) => (r.id !== ruasId ? r : { ...r, tiang: r.tiang.map((t) => (t.tiang_id === tiangId ? { ...t, [k]: Math.max(0, Math.round(v) || 0) } : t)) })),
    );
  const hapusRuas = (id: string) => ubahRuasSemua((rs) => rs.filter((r) => r.id !== id));

  const ubahKepala = (patch: Partial<KepalaRekon>) => {
    setKepala((k) => ({ ...k, ...patch }));
    setBerubah(true);
  };

  const ubahLatar = async (latar: LatarSurvey, oleh: string) => {
    setKepala((k) => ({ ...k, latar }));
    if (!kepala.id) {
      setBerubah(true);
      return;
    }
    const { error } = await supabaseBrowser.rpc("ubah_latar_survey", { p_id: kepala.id, p_latar: latar, p_nama: oleh });
    if (error) setGalat(error.message);
  };

  const simpan = async (oleh: string) => {
    setSibuk(true);
    setGalat(null);
    try {
      const { data, error } = await supabaseBrowser.rpc("simpan_survey_rekonduktor", {
        p: { id: kepala.id, judul: kepala.judul, catatan: kepala.catatan, gardu_kode: gardu, ruas, material },
        p_nama: oleh,
      });
      if (error) throw error;
      const id = data as string;
      if (!kepala.id && kepala.latar !== "jalan") {
        await supabaseBrowser.rpc("ubah_latar_survey", { p_id: id, p_latar: kepala.latar, p_nama: oleh });
      }
      if (!kepala.id) window.history.replaceState(null, "", `/peta?rekonduktor=${id}`);
      setKepala((k) => ({ ...k, id }));
      setBerubah(false);
    } catch (e) {
      setGalat(pesanSurvey(e));
    } finally {
      setSibuk(false);
    }
  };

  const tutup = () => {
    if (berubah && !window.confirm("Survey belum disimpan. Tutup dan buang perubahannya?")) return;
    setBuka(null);
    setRuas([]);
    setGardu(null);
    setJaringan(null);
    setLangkah("lihat");
    setTiangAwal(null);
    setCalon([]);
    setGalat(null);
    setBerubah(false);
    setBingkai(null);
  };

  return {
    aktifMode: buka !== null,
    kepala, gardu, jaringan, ruas, langkah, tiangAwal, calon, terbuka, setTerbuka, opsiKabel, material,
    draf, berubah, galat, memuat, sibuk, bingkai,
    /** Klik tiang/gardu di peta sedang dipakai memilih ruas. */
    menangkapKlik: buka !== null && draf && langkah !== "lihat",
    pilihGardu, gantiGardu, klikTiang, mulaiRuas, dariGardu, batalPilih, tambahJalur,
    ubahRuas, ubahTiang, hapusRuas, ubahKepala, ubahLatar, simpan, tutup,
  };
}

export type RekonduktorPetaState = ReturnType<typeof useRekonduktorPeta>;
