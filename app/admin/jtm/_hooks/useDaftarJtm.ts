"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { STATUS_JTM, statusTampil, type StatusJtm } from "../_lib/tampilan";

/**
 * Daftar inspeksi JTM — satu baris satu inspeksi segmen. Pola Kinerja
 * Pelayanan Teknik (teknisaplikasi.md butir 7): yang MASIH BERJALAN selalu
 * dimuat; yang disetujui/dibatalkan disaring per periode. Semua kueri
 * dipaginasi (butir 13).
 *
 * KENAPA PERSETUJUAN MENENTUKAN SEGALANYA: `tiang_kondisi_terakhir` — dasar
 * semua angka JTM, termasuk daftar Perlu Perbaikan — hanya memuat inspeksi
 * berstatus 'Diverifikasi'. Selama tidak diputuskan, pekerjaan regu tersimpan
 * rapi dan tidak muncul di angka mana pun.
 */

export interface InspeksiJtm {
  id: string;
  segmen_id: string | null;
  segmen_nama: string | null;
  penyulang: string;
  ulp: string;
  tier: string;
  status: string;
  tgl_mulai: string | null;
  tgl_selesai: string | null;
  petugas_nama: string | null;
  catatan: string | null;
  verified_at: string | null;
  verified_by: string | null;
  verified_note: string | null;
  tiang_segmen: number;
  tiang_dinilai: number;
  jawaban: number;
  temuan: number;
  jumlah_foto: number;
}

/** Baris daftar = inspeksi + panjang segmennya + catatan kembar. */
export interface BarisJtm extends InspeksiJtm {
  panjang_km: number;
  /** WO asal (J4): nama & tanggal WO inspeksi yang tersambung. null = di luar WO. */
  wo_nama: string | null;
  tgl_wo: string | null;
  /** Jumlah catatan terbuka lain di segmen & tier yang sama (lahir sebelum `jtm-lanjut.sql`). */
  kembar: number;
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
    nilaiLabel: string | null;
    normal: boolean;
    catatan: string | null;
    fotoUrl: string | null;
  }[];
}

const KOLOM =
  "id,segmen_id,segmen_nama,penyulang,ulp,tier,status,tgl_mulai,tgl_selesai,petugas_nama,catatan,verified_at,verified_by,verified_note,tiang_segmen,tiang_dinilai,jawaban,temuan,jumlah_foto";
const AKTIF = ["Dijadwalkan", "Dalam Proses", "Selesai", "Ditolak"];
const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

const dua = (n: number) => String(n).padStart(2, "0");
const akhirBulan = (t: number, b: number) => new Date(t, b, 0).getDate();
const potong = <T,>(a: T[], n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

export type SaringStatus = "SEMUA" | StatusJtm;

export function useDaftarJtm(user: CurrentUser) {
  const bolehSemua = canSeeAllUnits(user.role);
  const sekarang = new Date();
  const tahunIni = sekarang.getFullYear();

  const [data, setData] = useState<InspeksiJtm[]>([]);
  const [panjang, setPanjang] = useState<Map<string, number>>(new Map());
  const [woPeta, setWoPeta] = useState<Map<string, { nama: string; tgl: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [memproses, setMemproses] = useState<string | null>(null);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, gantiTahun] = useState(tahunIni);
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState<SaringStatus>("SEMUA");
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(() => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]), [bolehSemua, user.unit]);
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };

  const tarik = useCallback(async () => {
    const awal = bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`;
    const akhir = bulan === 0 ? `${tahun}-12-31` : `${tahun}-${dua(bulan)}-${dua(akhirBulan(tahun, bulan))}`;
    // Batas hari mengikuti WITA — kolomnya cap waktu, bukan tanggal.
    const dari = `"${awal}T00:00:00+08:00"`;
    const sampai = `"${akhir}T23:59:59+08:00"`;
    const aktif = () => {
      let x = supabaseBrowser.from("inspeksi_jtm_ringkas").select(KOLOM).in("status", AKTIF).order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    // Disetujui menurut tanggal selesai; dibatalkan menurut tanggal mulai
    // (inspeksi yang dibatalkan belum tentu pernah selesai).
    const tertutup = () => {
      let x = supabaseBrowser
        .from("inspeksi_jtm_ringkas")
        .select(KOLOM)
        .or(
          `and(status.eq.Diverifikasi,tgl_selesai.gte.${dari},tgl_selesai.lte.${sampai}),` +
            `and(status.eq.Dibatalkan,tgl_mulai.gte.${dari},tgl_mulai.lte.${sampai})`,
        )
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    const segmen = () => {
      let x = supabaseBrowser.from("segmen_ringkas").select("segmen_id,panjang_km").order("segmen_id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    // Sambungan inspeksi → WO. Dua tabel kecil (hanya yang ber-WO), jadi
    // ditarik utuh daripada mengubah view daftar.
    const sambung = () =>
      supabaseBrowser.from("inspeksi_jtm").select("id,wo_item_id").not("wo_item_id", "is", null).order("id");
    const itemWo = () => supabaseBrowser.from("wo_inspeksi_item_status").select("id,wo_nama,tgl_wo").order("id");
    const [a, t, s, sb, iw] = await Promise.all([
      fetchAllRows<InspeksiJtm>(aktif),
      fetchAllRows<InspeksiJtm>(tertutup),
      fetchAllRows<{ segmen_id: string; panjang_km: number | null }>(segmen),
      fetchAllRows<{ id: string; wo_item_id: string }>(sambung).catch(() => []),
      fetchAllRows<{ id: string; wo_nama: string; tgl_wo: string }>(itemWo).catch(() => []),
    ]);
    const woItem = new Map(iw.map((x) => [x.id, x]));
    const wo = new Map(
      sb.flatMap((x) => {
        const i = woItem.get(x.wo_item_id);
        return i ? [[x.id, { nama: i.wo_nama, tgl: i.tgl_wo }] as const] : [];
      }),
    );
    return { rows: [...a, ...t], km: new Map(s.map((x) => [x.segmen_id, Number(x.panjang_km ?? 0)])), wo };
  }, [ulp, bulan, tahun]);

  useEffect(() => {
    let hidup = true;
    tarik().then(
      (h) => {
        if (!hidup) return;
        setData(h.rows);
        setPanjang(h.km);
        setWoPeta(h.wo);
        setGalat(null);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        setData([]);
        setGalat(e.message);
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [tarik, nonce]);

  const semua = useMemo<BarisJtm[]>(() => {
    const terbuka = new Map<string, number>();
    const kunci = (d: InspeksiJtm) => `${d.segmen_id ?? d.id}|${d.tier}`;
    for (const d of data) {
      if (d.status !== "Diverifikasi" && d.status !== "Dibatalkan") terbuka.set(kunci(d), (terbuka.get(kunci(d)) ?? 0) + 1);
    }
    return data
      .map((d) => ({
        ...d,
        panjang_km: d.segmen_id ? (panjang.get(d.segmen_id) ?? 0) : 0,
        wo_nama: woPeta.get(d.id)?.nama ?? null,
        tgl_wo: woPeta.get(d.id)?.tgl ?? null,
        kembar: d.status !== "Diverifikasi" && d.status !== "Dibatalkan" ? (terbuka.get(kunci(d)) ?? 1) - 1 : 0,
      }))
      .sort((x, y) => (y.tgl_selesai ?? y.tgl_mulai ?? "").localeCompare(x.tgl_selesai ?? x.tgl_mulai ?? ""));
  }, [data, panjang, woPeta]);

  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    if (!k) return semua;
    return semua.filter((d) =>
      [d.segmen_nama ?? "", d.penyulang, d.petugas_nama ?? ""].some((v) => v.toUpperCase().includes(k)),
    );
  }, [semua, cari]);

  const baris = useMemo(
    () => dasarChip.filter((d) => status === "SEMUA" || statusTampil(d.status) === status),
    [dasarChip, status],
  );

  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_JTM.map((x) => [x, 0])) as Record<StatusJtm, number>;
    for (const d of dasarChip) h[statusTampil(d.status)] += 1;
    return h;
  }, [dasarChip]);

  const segarkanSatu = async (id: string) => {
    const { data: r } = await supabaseBrowser.from("inspeksi_jtm_ringkas").select(KOLOM).eq("id", id).maybeSingle();
    if (r) setData((p) => p.map((x) => (x.id === id ? (r as unknown as InspeksiJtm) : x)));
  };

  const oleh = user.name || user.email || "";

  /** RPC; galatnya DILEMPAR supaya modal bisa menampilkan toast. Penjaga di
   *  database sudah menjelaskan sendiri kenapa ditolak — diteruskan apa adanya. */
  const rpc = async <T,>(id: string, fn: string, args: Record<string, unknown>) => {
    setMemproses(id);
    try {
      const { data: hasil, error } = await supabaseBrowser.rpc(fn, args);
      if (error) throw new Error(error.message);
      return hasil as T;
    } finally {
      setMemproses(null);
    }
  };

  const putuskan = async (id: string, setuju: boolean, catatan?: string) => {
    await rpc(id, "putuskan_inspeksi_jtm", { p_id: id, p_setuju: setuju, p_nama: oleh, p_catatan: catatan || null });
    await segarkanSatu(id);
  };

  /**
   * BUKAN penolakan. Menolak = "ulangi"; membatalkan = "jangan diulang" (salah
   * segmen, uji coba). Tiang yang sudah dinilai tidak ikut dibatalkan.
   */
  const batalkan = async (id: string, alasan: string) => {
    await rpc(id, "batalkan_inspeksi_jtm", { p_id: id, p_alasan: alasan, p_nama: oleh });
    await segarkanSatu(id);
  };

  /** Hanya untuk catatan nol tiang — bekas layar yang pernah dibuka. */
  const buang = async (id: string) => {
    await rpc(id, "buang_inspeksi_kosong_jtm", { p_id: id, p_oleh: oleh });
    setData((p) => p.filter((x) => x.id !== id));
  };

  /** Menyatukan catatan kembar ke `id` — banyak baris berubah, jadi dimuat ulang. */
  const gabung = async (id: string) => {
    const h = await rpc<{ penyapuan_dibuang: number; tiang_dinilai: number }>(id, "gabung_inspeksi_jtm", {
      p_tujuan: id,
      p_oleh: oleh,
    });
    muat();
    return h;
  };

  return {
    semua, baris, hitung, loading, galat, memproses,
    ulp, setUlp, daftarUlp, bulan, setBulan, tahun, setTahun, daftarTahun, cari, setCari, status, setStatus,
    muat, putuskan, batalkan, buang, gabung,
  };
}

/**
 * Isi satu inspeksi, dibaca hanya saat modalnya dibuka — satu inspeksi bisa
 * memuat ribuan jawaban (200 tiang × 30 isian), jadi dipaginasi dan dipecah
 * per 100 titik supaya URL-nya tidak kepanjangan.
 */
export async function ambilIsiInspeksi(id: string): Promise<JawabanTiang[]> {
  interface Titik { id: string; tiang_id: string; jarak_m: number | null; dinilai_at: string | null; tiang: { kode: string } | { kode: string }[] | null }
  interface Periksa { titik_id: string; item_kode: string; bagian: string | null; nilai: string | null; nilai_angka: number | null; catatan: string | null; foto_url: string | null }

  const titik = await fetchAllRows<Titik>(() =>
    supabaseBrowser.from("inspeksi_jtm_titik").select("id,tiang_id,jarak_m,dinilai_at,tiang(kode)").eq("inspeksi_id", id).order("dinilai_at").order("id"),
  );
  if (titik.length === 0) return [];

  const [periksa, item, opsi] = await Promise.all([
    Promise.all(
      potong(titik.map((t) => t.id)).map((ids) =>
        fetchAllRows<Periksa>(() =>
          supabaseBrowser
            .from("inspeksi_jtm_periksa")
            .select("titik_id,item_kode,bagian,nilai,nilai_angka,catatan,foto_url")
            .in("titik_id", ids)
            .order("id"),
        ),
      ),
    ).then((x) => x.flat()),
    supabaseBrowser.from("jtm_item_ref").select("kode,nama,urutan"),
    supabaseBrowser.from("jtm_opsi_ref").select("item_kode,kode,label,normal"),
  ]);
  if (item.error) throw new Error(item.error.message);
  if (opsi.error) throw new Error(opsi.error.message);

  const nama = new Map((item.data ?? []).map((i) => [i.kode as string, i.nama as string]));
  const urut = new Map((item.data ?? []).map((i) => [i.kode as string, Number(i.urutan ?? 0)]));
  const lbl = new Map((opsi.data ?? []).map((o) => [`${o.item_kode}|${o.kode}`, o]));

  const per = new Map<string, JawabanTiang["isi"]>();
  for (const p of periksa) {
    const o = lbl.get(`${p.item_kode}|${p.nilai}`);
    const angka = p.nilai_angka !== null ? String(p.nilai_angka) : null;
    const d = per.get(p.titik_id) ?? [];
    d.push({
      itemKode: p.item_kode,
      itemNama: nama.get(p.item_kode) ?? p.item_kode,
      bagian: p.bagian ?? "-",
      nilaiLabel: (o?.label as string | undefined) ?? p.nilai ?? angka,
      // Item angka dan teks tidak punya daftar pilihan, jadi tidak punya
      // penilaian normal/tidak — dianggap normal supaya tidak jadi temuan palsu.
      normal: o ? !!o.normal : true,
      catatan: p.catatan,
      fotoUrl: p.foto_url,
    });
    per.set(p.titik_id, d);
  }

  return titik.map((t) => {
    const tg = Array.isArray(t.tiang) ? t.tiang[0] : t.tiang;
    return {
      tiangId: t.tiang_id,
      tiangKode: tg?.kode ?? "—",
      jarakM: t.jarak_m !== null ? Number(t.jarak_m) : null,
      dinilaiAt: t.dinilai_at,
      isi: (per.get(t.id) ?? []).sort((a, b) => (urut.get(a.itemKode) ?? 0) - (urut.get(b.itemKode) ?? 0)),
    };
  });
}
