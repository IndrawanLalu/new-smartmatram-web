"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  bawaJtr, jurusanBawaan, keSurvey, keTitik, panjangGawang, pesanSurvey, sumberJtr, urutTopologis,
  type AlasanSurvey, type JaringanTiang, type StatusSurvey, type TiangSambung, type TitikSurvey,
} from "@/lib/surveyJaringan";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Survey Jaringan Baru di peta (S1, 21 Okt 2026) — /peta?survey=<id|baru>.
 *
 * Seluruh gambar dipegang di sini dan disimpan SEKALIGUS (simpan_survey_jaringan),
 * bukan per klik: menggambar banyak titik lalu membatalkan tidak meninggalkan
 * sisa di database. Mode:
 *   sambung — klik tiang JTM yang ada = titik sambung, lalu lanjut "tambah"
 *   tambah  — klik peta = tiang baru, induknya titik AKTIF (yang terakhir /
 *             yang diklik), sehingga cabang dibuat dengan mengklik titik lain
 *   lihat   — klik titik survey untuk menyunting isiannya
 *
 * Tiang baru JTM atau JTR (`jaringanBaru`, 22 Okt 2026). JTR hanya ditarik
 * dari gardu baru di survey ini atau dari kabel JTR sebelumnya.
 */

export type ModeSurvey = "lihat" | "sambung" | "tambah";

export interface KepalaSurvey {
  id: string | null;
  judul: string;
  alasan: AlasanSurvey;
  catatan: string;
  status: StatusSurvey;
  ulp: string | null;
  penyulang: string | null;
}

/** Isian yang diteruskan ke tiang berikutnya SEJENIS (bawaan = isian sebelumnya). */
type Bawaan = Pick<TitikSurvey, "jenis_tiang" | "konstruksi" | "konduktor_jenis" | "konduktor_ukuran" | "jtr_kabel_jenis" | "jtr_kabel_ukuran">;
const BAWAAN_KOSONG: Bawaan = {
  jenis_tiang: null, konstruksi: null, konduktor_jenis: null, konduktor_ukuran: null, jtr_kabel_jenis: null, jtr_kabel_ukuran: null,
};
const KEPALA_BARU: KepalaSurvey = { id: null, judul: "", alasan: "perluasan", catatan: "", status: "Draf", ulp: null, penyulang: null };

/** Induk titik baru: titik survey, atau tiang sambung. */
type Aktif = { titik: string } | { tiang: string } | null;

export interface OpsiIsian {
  jenis_tiang: string[];
  konstruksi: string[];
  konduktor_jenis: string[];
  konduktor_ukuran: string[];
  /** JTR dari Pengaturan JTR: jenis × tinggi ("Besi 9 m"), kabel & ukurannya. */
  jtr_jenis_tiang: string[];
  jtr_kabel_jenis: string[];
  jtr_kabel_ukuran: string[];
}

async function bacaOpsi(): Promise<OpsiIsian> {
  const [{ data }, { data: jtr }] = await Promise.all([
    supabaseBrowser
      .from("jtm_opsi_ref")
      .select("item_kode,label,urutan")
      .in("item_kode", ["jenis_tiang", "konstruksi", "jenis_konduktor", "ukuran_konduktor"])
      .eq("aktif", true)
      .order("urutan"),
    supabaseBrowser
      .from("jtr_ref")
      .select("kategori,label,urutan")
      .in("kategori", ["jenis_tiang", "ukuran_tiang", "jenis_kabel", "ukuran_kabel"])
      .eq("aktif", true)
      .order("urutan"),
  ]);
  const per = (k: string) => (data ?? []).filter((x) => x.item_kode === k).map((x) => x.label as string);
  const jr = (k: string) => (jtr ?? []).filter((x) => x.kategori === k).map((x) => x.label as string);
  return {
    jenis_tiang: per("jenis_tiang"), konstruksi: per("konstruksi"), konduktor_jenis: per("jenis_konduktor"), konduktor_ukuran: per("ukuran_konduktor"),
    jtr_jenis_tiang: jr("jenis_tiang").flatMap((j) => jr("ukuran_tiang").map((u) => `${j} ${u} m`)),
    jtr_kabel_jenis: jr("jenis_kabel"),
    jtr_kabel_ukuran: jr("ukuran_kabel"),
  };
}

export function useSurveyPeta(awal: string | null) {
  const [buka, setBuka] = useState(awal);
  const [kepala, setKepala] = useState<KepalaSurvey>(KEPALA_BARU);
  const [titik, setTitik] = useState<TitikSurvey[]>([]);
  const [sambung, setSambung] = useState<Map<string, TiangSambung>>(new Map());
  const [mode, setMode] = useState<ModeSurvey>("lihat");
  const [aktif, setAktif] = useState<Aktif>(null);
  const [terpilih, setTerpilih] = useState<string | null>(null);
  const [bawaan, setBawaan] = useState<Record<JaringanTiang, Bawaan>>({ JTM: BAWAAN_KOSONG, JTR: BAWAAN_KOSONG });
  /** Jenis tiang yang ditaruh klik peta berikutnya. */
  const [jaringanBaru, setJaringanBaru] = useState<JaringanTiang>("JTM");
  const [berubah, setBerubah] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [opsi, setOpsi] = useState<OpsiIsian | null>(null);
  /** Bingkai peta — hanya berubah saat survey dimuat. */
  const [bingkai, setBingkai] = useState<{ lat: number; lng: number }[] | null>(null);
  // Klik tiang yang ada juga sampai ke peta sebagai klik biasa (kanvas):
  // klik peta sesaat sesudahnya bukan "tiang baru".
  const barusanTiang = useRef(0);

  useEffect(() => {
    if (!buka) return;
    let batal = false;
    void bacaOpsi().then((o) => !batal && setOpsi(o));
    if (buka === "baru") {
      setKepala(KEPALA_BARU);
      setTitik([]);
      setSambung(new Map());
      setMode("sambung");
      return () => { batal = true; };
    }
    setMemuat(true);
    (async () => {
      const [s, t] = await Promise.all([
        supabaseBrowser.from("survey_jaringan_daftar").select("*").eq("id", buka).maybeSingle(),
        supabaseBrowser.from("survey_titik").select("*").eq("survey_id", buka).order("urutan"),
      ]);
      if (s.error || t.error) throw s.error ?? t.error;
      if (!s.data) throw new Error("Survey tidak ditemukan.");
      const sv = keSurvey(s.data);
      const ts = (t.data ?? []).map(keTitik);
      const ids = [...new Set(ts.map((x) => x.induk_tiang_id).filter((x): x is string => !!x))];
      const { data: tg, error } = ids.length
        ? await supabaseBrowser.from("tiang").select("id,kode,penyulang,lat,lng").in("id", ids)
        : { data: [], error: null };
      if (error) throw error;
      if (batal) return;
      const peta = new Map((tg ?? []).map((x) => [x.id as string, { ...x, lat: Number(x.lat), lng: Number(x.lng) } as TiangSambung]));
      setKepala({ id: sv.id, judul: sv.judul, alasan: sv.alasan, catatan: sv.catatan ?? "", status: sv.status, ulp: sv.ulp, penyulang: sv.penyulang });
      setTitik(ts);
      setSambung(peta);
      setMode("lihat");
      setBingkai([...ts, ...peta.values()]);
    })()
      .catch((e) => !batal && setGalat(pesanSurvey(e)))
      .finally(() => !batal && setMemuat(false));
    return () => { batal = true; };
  }, [buka]);

  // Gambar yang belum disimpan tidak boleh hilang diam-diam.
  useEffect(() => {
    if (!berubah) return;
    const tahan = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [berubah]);

  const draf = kepala.status === "Draf";
  const perId = useMemo(() => new Map(titik.map((t) => [t.id, t])), [titik]);
  const panjang = useMemo(() => panjangGawang(titik, sambung), [titik, sambung]);

  const ubahTitik = (f: (t: TitikSurvey[]) => TitikSurvey[]) => {
    setTitik(f);
    setBerubah(true);
  };

  /** Klik tiang yang ada (dipanggil peta sebagai pengganti panel tiang). */
  const klikTiang = useCallback((t: TiangPeta) => {
    barusanTiang.current = Date.now();
    if (t.jaringan !== "jtm" || !draf) return;
    setSambung((m) => new Map(m).set(t.id, { id: t.id, kode: t.kode, penyulang: t.kelompok, lat: t.lat, lng: t.lng }));
    setAktif({ tiang: t.id });
    setMode("tambah");
  }, [draf]);

  /** Klik peta: tiang survey baru, induknya titik aktif. */
  const tambahDi = (lat: number, lng: number) => {
    if (mode !== "tambah" || !aktif || !draf || Date.now() - barusanTiang.current < 400) return;
    const induk = "titik" in aktif ? perId.get(aktif.titik) : undefined;
    const jtr = jaringanBaru === "JTR";
    if (jtr && !sumberJtr(induk)) {
      setGalat("Tiang JTR ditarik dari gardu baru di survey ini, atau dari tiang yang sudah dilewati kabel JTR. Klik titik itu dulu.");
      return;
    }
    setGalat(null);
    const id = crypto.randomUUID();
    ubahTitik((ts) => [
      ...ts,
      {
        id, urutan: ts.length + 1, lat, lng,
        induk_titik_id: "titik" in aktif ? aktif.titik : null,
        induk_tiang_id: "tiang" in aktif ? aktif.tiang : null,
        ...bawaan[jaringanBaru],
        penanda: null, gardu_kva: null, gardu_nama: null, gardu_jenis: null, gardu_arah: 0, catatan: null,
        jaringan: jaringanBaru,
        kabel: jtr ? "JTR" : "JTM",
        jurusan: jtr && induk ? jurusanBawaan(induk, ts) : null,
      },
    ]);
    setAktif({ titik: id });
    setTerpilih(id);
  };

  /** Klik titik survey: dipilih untuk disunting, dan jadi pangkal tiang berikutnya. */
  const pilih = (id: string) => {
    setTerpilih(id);
    setAktif({ titik: id });
  };

  const ubah = (id: string, patch: Partial<TitikSurvey>) => {
    const t = perId.get(id);
    if (!t) return;
    const p = { ...patch };
    if (p.jaringan && p.jaringan !== t.jaringan) {
      // Ganti jenis tiang: isian tiang ikut bawaan jenis barunya. Tiang JTR
      // hanya memikul kabel JTR, tanpa gardu/peralatan & konstruksi JTM.
      p.jenis_tiang = bawaan[p.jaringan].jenis_tiang;
      if (p.jaringan === "JTR") Object.assign(p, { kabel: "JTR", penanda: null, konstruksi: null, gardu_kva: null, gardu_nama: null, gardu_jenis: null });
    }
    const baru = { ...t, ...p };
    if (bawaJtr(baru.kabel) && !baru.jurusan) {
      const induk = baru.induk_titik_id ? perId.get(baru.induk_titik_id) : undefined;
      if (induk) p.jurusan = jurusanBawaan(induk, titik.filter((x) => x.id !== id));
    }
    ubahTitik((ts) => ts.map((x) => (x.id === id ? { ...x, ...p } : x)));
    // Bawaan hanya dari isian yang DIKETIK, bukan yang ikut berubah karena ganti jenis.
    const b = Object.fromEntries(Object.entries(patch).filter(([k]) => k in BAWAAN_KOSONG));
    if (Object.keys(b).length) setBawaan((x) => ({ ...x, [baru.jaringan]: { ...x[baru.jaringan], ...b } }));
  };

  const geser = (id: string, lat: number, lng: number) => ubah(id, { lat, lng });

  /** Hapus satu titik; anak-anaknya menyambung ke induknya. */
  const hapus = (id: string) => {
    const t = perId.get(id);
    if (!t) return;
    ubahTitik((ts) =>
      ts.filter((x) => x.id !== id).map((x) =>
        x.induk_titik_id === id ? { ...x, induk_titik_id: t.induk_titik_id, induk_tiang_id: t.induk_tiang_id } : x,
      ),
    );
    setTerpilih(null);
    setAktif(t.induk_titik_id ? { titik: t.induk_titik_id } : t.induk_tiang_id ? { tiang: t.induk_tiang_id } : null);
  };

  const ubahKepala = (patch: Partial<KepalaSurvey>) => {
    setKepala((k) => ({ ...k, ...patch }));
    setBerubah(true);
  };

  const simpan = async (oleh: string) => {
    setSibuk(true);
    setGalat(null);
    try {
      const { data, error } = await supabaseBrowser.rpc("simpan_survey_jaringan", {
        p: { id: kepala.id, judul: kepala.judul, alasan: kepala.alasan, catatan: kepala.catatan, titik: urutTopologis(titik) },
        p_nama: oleh,
      });
      if (error) throw error;
      const id = data as string;
      if (!kepala.id) window.history.replaceState(null, "", `/peta?survey=${id}`);
      setKepala((k) => ({ ...k, id }));
      setBerubah(false);
      return id;
    } catch (e) {
      setGalat(pesanSurvey(e));
      return null;
    } finally {
      setSibuk(false);
    }
  };

  const tutup = () => {
    if (berubah && !window.confirm("Gambar survey belum disimpan. Tutup dan buang perubahannya?")) return;
    setBuka(null);
    setTitik([]);
    setSambung(new Map());
    setMode("lihat");
    setAktif(null);
    setTerpilih(null);
    setGalat(null);
    setBerubah(false);
    setBingkai(null);
  };

  return {
    aktifMode: buka !== null,
    kepala, titik, sambung, perId, panjang, mode, setMode, aktif, terpilih, setTerpilih, jaringanBaru, setJaringanBaru,
    draf, berubah, galat, memuat, sibuk, opsi, bingkai,
    klikTiang, tambahDi, pilih, ubah, geser, hapus, ubahKepala, simpan, tutup,
  };
}

export type SurveyPetaState = ReturnType<typeof useSurveyPeta>;
