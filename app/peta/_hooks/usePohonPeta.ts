"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { Lapisan } from "./usePetaDaftar";

/**
 * Lapisan pohon (8 Okt 2026) — dua sumber, satu peta:
 *
 *   TEMUAN   `perabasan_pohon`: jawaban vegetasi inspeksi JTM yang menyentuh /
 *            berpotensi, di koordinat TIANGNYA (regu tidak menitik pohon).
 *            Bukan per bulan — temuan menunggu sampai dirabas.
 *   DIRABAS  `perabasan_realisasi` (WO) + `perabasan_luar_wo`, di koordinat
 *            GPS pohonnya, satu bulan tanggal kerja.
 *
 * "Tertangani" per SEGMEN: item WO perabasan segmen itu Selesai/Diverifikasi
 * pada atau sesudah tanggal inspeksinya. Pohon dirabas tidak menyimpan
 * tiangnya, jadi pencocokan per tiang tidak mungkin.
 *
 * Tampil PER PENYULANG lewat folder "Pohon" di panel kiri, sama dengan JTM
 * (keputusan user 8 Okt 2026). Daftarnya dibaca saat peta dibuka — puluhan–
 * ratusan baris — dan yang digambar hanya penyulang yang dicentang.
 */

export type JenisPohon = "menyentuh" | "berpotensi" | "dirabas";
export const WARNA_POHON: Record<JenisPohon, string> = {
  menyentuh: "#DC2626",
  berpotensi: "#F59E0B",
  dirabas: "#16A34A",
};

/** Alamat temuan di `jtm_temuan` — kunci `tugaskan_temuan_jtm`. */
export interface KunciTugas {
  tiang_id: string;
  item_kode: string;
  bagian: string | null;
  sirkit_segmen_id: string | null;
}

/** Status penugasan temuan pohon; null = inspeksinya belum disetujui (belum bisa ditugaskan). */
export type StatusTugasPohon = "Belum ditugaskan" | "Ditugaskan" | "Selesai" | null;

export interface TemuanPohon {
  tiangId: string;
  tiangKode: string;
  lat: number;
  lng: number;
  vegetasi: "menyentuh" | "berpotensi";
  jenisPohon: string | null;
  tgl: string | null;
  disetujui: boolean;
  fotoUrl: string | null;
  catatan: string | null;
  segmen: string;
  penyulang: string;
  ulp: string;
  tertangani: boolean;
  statusTugas: StatusTugasPohon;
  /** Regu / peran yang ditugaskan. */
  regu: string | null;
  /** Ada = bisa ditugaskan dari peta (disetujui & belum ditugaskan). */
  kunciTugas: KunciTugas | null;
}

export interface PohonDirabas {
  id: string;
  lat: number;
  lng: number;
  jenisPohon: string | null;
  waktu: string;
  petugas: string | null;
  fotoSebelum: string | null;
  fotoSesudah: string | null;
  penyulang: string;
  segmen: string | null;
  ulp: string;
  luarWo: boolean;
}

/** Sumber pohon (arahan user 8 Okt 2026: penyaring sumber WAJIB ada). */
export type SumberPohon = "inspeksi" | "perabasan";
export const LABEL_SUMBER: Record<SumberPohon, string> = {
  inspeksi: "Dari inspeksi JTM",
  perabasan: "Dari perabasan",
};

export interface SaringPohon {
  sumber: Set<SumberPohon>;
  /** Tingkat vegetasi temuan inspeksi. */
  vegetasi: Set<TemuanPohon["vegetasi"]>;
  sembunyikanTertangani: boolean;
  /** Penugasan temuan inspeksi (8 Okt 2026): belum / sudah ditugaskan. */
  tugas: Set<"belum" | "sudah">;
}

const dua = (n: number) => String(n).padStart(2, "0");
const angka = (v: unknown) => (v === null || v === undefined ? NaN : Number(v));
const UTAMA = { menyentuh: 2, berpotensi: 1 } as const;

type Baris = Record<string, unknown>;
type Seg = { nama?: string; ulp?: string; penyulang?: string } | null;

/** Nama penyulang sebagai kunci lapisan `pohon:<PENYULANG>`. */
const kunciPenyulang = (s: unknown) => String(s ?? "").trim().toUpperCase() || "(TANPA PENYULANG)";

export function usePohonPeta(ulp: string, tahun: number, bulan: number, saring: SaringPohon, nyala: Set<string>) {
  const [temuan, setTemuan] = useState<TemuanPohon[]>([]);
  const [dirabas, setDirabas] = useState<PohonDirabas[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const kunci = `${ulp}|${tahun}|${bulan}|${nonce}`;
  const [kunciSelesai, setKunciSelesai] = useState<string | null>(null);
  const sibuk = kunciSelesai !== kunci;

  useEffect(() => {
    let hidup = true;
    const awal = `${tahun}-${dua(bulan)}-01`;
    const akhir = bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${dua(bulan + 1)}-01`;
    const kerja = async () => {
      try {
        const [pohon, selesai, rabas, luar, tugas] = await Promise.all([
          fetchAllRows<Baris>(() =>
            supabaseBrowser
              .from("perabasan_pohon")
              .select("segmen_id,tiang_id,tiang_kode,lat,lng,vegetasi,jenis_pohon,tgl_inspeksi,terverifikasi,foto_url,catatan,segmen(nama,ulp,penyulang)")
              .order("segmen_id").order("tiang_id"),
          ),
          fetchAllRows<Baris>(() =>
            supabaseBrowser
              .from("wo_perabasan_item")
              .select("id,segmen_id,tgl_selesai")
              .in("status", ["Selesai", "Diverifikasi"])
              .not("tgl_selesai", "is", null)
              .order("id"),
          ),
          fetchAllRows<Baris>(() =>
            supabaseBrowser
              .from("perabasan_realisasi")
              .select("id,lat,lng,jenis_pohon,dikerjakan_at,petugas_nama,foto_sebelum_url,foto_sesudah_url,wo_perabasan_item(ulp,penyulang,segmen_nama)")
              .gte("dikerjakan_at", `${awal}T00:00:00+08:00`).lt("dikerjakan_at", `${akhir}T00:00:00+08:00`)
              .order("id"),
          ),
          fetchAllRows<Baris>(() => {
            let q = supabaseBrowser
              .from("perabasan_luar_wo")
              .select("id,lat,lng,jenis_pohon,tgl,created_at,regu,foto_sebelum_url,foto_sesudah_url,penyulang,ulp,ulp_regu")
              .gte("tgl", awal).lt("tgl", akhir)
              .in("status", ["Selesai", "Diverifikasi"]);
            if (ulp) q = q.eq("ulp_regu", ulp);
            return q.order("id");
          }),
          // Status penugasan temuan vegetasi — sumbernya sama dengan tab Temuan JTM.
          fetchAllRows<Baris>(() => {
            let q = supabaseBrowser
              .from("jtm_temuan")
              .select("tiang_id,item_kode,bagian,sirkit_segmen_id,status_tugas,eksekutor,team_name")
              .eq("item_kode", "vegetasi");
            if (ulp) q = q.eq("ulp", ulp);
            return q.order("tiang_id").order("bagian").order("sirkit_segmen_id");
          }),
        ]);
        if (!hidup) return;

        // Segmen → tanggal perabasan selesai paling akhir.
        const rabasSegmen = new Map<string, string>();
        for (const s of selesai) {
          const id = String(s.segmen_id), t = String(s.tgl_selesai);
          if (!rabasSegmen.has(id) || t > (rabasSegmen.get(id) as string)) rabasSegmen.set(id, t);
        }

        // Per tiang: temuan yang BELUM ditugaskan didahulukan (itu yang perlu
        // tindakan), lalu yang ditugaskan.
        const tugasTiang = new Map<string, Baris>();
        for (const t of tugas) {
          const id = String(t.tiang_id);
          const lama = tugasTiang.get(id);
          if (!lama || (t.status_tugas === "Belum ditugaskan" && lama.status_tugas !== "Belum ditugaskan")) tugasTiang.set(id, t);
        }

        // Satu tiang bisa muncul untuk beberapa segmen (tiang bersama): satu
        // ikon per tiang, yang paling parah.
        const perTiang = new Map<string, TemuanPohon>();
        for (const r of pohon) {
          const seg = r.segmen as Seg;
          if (ulp && seg?.ulp !== ulp) continue;
          const lat = angka(r.lat), lng = angka(r.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const tgl = r.tgl_inspeksi ? String(r.tgl_inspeksi).slice(0, 10) : null;
          const sel = rabasSegmen.get(String(r.segmen_id));
          const t: TemuanPohon = {
            tiangId: String(r.tiang_id),
            tiangKode: String(r.tiang_kode ?? "—"),
            lat, lng,
            vegetasi: r.vegetasi === "menyentuh" ? "menyentuh" : "berpotensi",
            jenisPohon: (r.jenis_pohon as string | null) ?? null,
            tgl,
            disetujui: !!r.terverifikasi,
            fotoUrl: (r.foto_url as string | null) ?? null,
            catatan: (r.catatan as string | null) ?? null,
            segmen: seg?.nama ?? "—",
            penyulang: kunciPenyulang(seg?.penyulang),
            ulp: seg?.ulp ?? "",
            tertangani: !!sel && (!tgl || sel >= tgl),
            ...(() => {
              const tg = tugasTiang.get(String(r.tiang_id));
              if (!tg) return { statusTugas: null, regu: null, kunciTugas: null };
              const status = tg.status_tugas as Exclude<StatusTugasPohon, null>;
              return {
                statusTugas: status,
                regu: [tg.eksekutor, tg.team_name].filter(Boolean).join(" · ") || null,
                kunciTugas:
                  status === "Belum ditugaskan"
                    ? {
                        tiang_id: String(tg.tiang_id),
                        item_kode: String(tg.item_kode),
                        bagian: (tg.bagian as string | null) ?? null,
                        sirkit_segmen_id: (tg.sirkit_segmen_id as string | null) ?? null,
                      }
                    : null,
              };
            })(),
          };
          const lama = perTiang.get(t.tiangId);
          if (!lama || UTAMA[t.vegetasi] > UTAMA[lama.vegetasi]) perTiang.set(t.tiangId, t);
        }
        setTemuan([...perTiang.values()]);

        const dariWo: PohonDirabas[] = rabas
          .map((r) => {
            const item = r.wo_perabasan_item as { ulp?: string; penyulang?: string; segmen_nama?: string } | null;
            return {
              id: String(r.id),
              lat: angka(r.lat), lng: angka(r.lng),
              jenisPohon: (r.jenis_pohon as string | null) ?? null,
              waktu: String(r.dikerjakan_at),
              petugas: (r.petugas_nama as string | null) ?? null,
              fotoSebelum: (r.foto_sebelum_url as string | null) ?? null,
              fotoSesudah: (r.foto_sesudah_url as string | null) ?? null,
              penyulang: kunciPenyulang(item?.penyulang),
              segmen: item?.segmen_nama ?? null,
              ulp: (item?.ulp ?? "").toUpperCase(),
              luarWo: false,
            };
          })
          .filter((p) => !ulp || p.ulp === ulp);
        const diLuar: PohonDirabas[] = luar.map((r) => ({
          id: String(r.id),
          lat: angka(r.lat), lng: angka(r.lng),
          jenisPohon: (r.jenis_pohon as string | null) ?? null,
          waktu: String(r.created_at ?? r.tgl),
          petugas: (r.regu as string | null) ?? null,
          fotoSebelum: (r.foto_sebelum_url as string | null) ?? null,
          fotoSesudah: (r.foto_sesudah_url as string | null) ?? null,
          penyulang: kunciPenyulang(r.penyulang),
          segmen: null,
          ulp: String(r.ulp_regu ?? r.ulp ?? "").toUpperCase(),
          luarWo: true,
        }));
        setDirabas([...dariWo, ...diLuar].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)));
        setGalat(null);
      } catch (e) {
        // Gagal ≠ kosong (teknisaplikasi butir 6): yang lama dibuang, panel menyebut galatnya.
        if (hidup) {
          setTemuan([]);
          setDirabas([]);
          setGalat(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (hidup) setKunciSelesai(kunci);
      }
    };
    void kerja();
    return () => { hidup = false; };
  }, [ulp, tahun, bulan, nonce, kunci]);

  /** Satu baris folder per penyulang — bentuknya `Lapisan` supaya panel kiri,
   *  pencarian, dan "lompat ke sini" memperlakukannya sama dengan JTM. */
  const daftar = useMemo<Lapisan[]>(() => {
    const per = new Map<string, { n: number; ulp: string; lat: number[]; lng: number[] }>();
    const ikut = [
      ...(saring.sumber.has("inspeksi") ? temuan : []),
      ...(saring.sumber.has("perabasan") ? dirabas : []),
    ];
    for (const x of ikut) {
      const a = per.get(x.penyulang) ?? { n: 0, ulp: x.ulp, lat: [], lng: [] };
      a.n += 1;
      a.lat.push(x.lat);
      a.lng.push(x.lng);
      per.set(x.penyulang, a);
    }
    return [...per.entries()]
      .map(([kode, a]) => ({
        jaringan: "pohon" as const,
        kode, nama: kode, ulp: a.ulp, feeder: kode,
        jumlahTiang: a.n,
        latMin: Math.min(...a.lat), latMaks: Math.max(...a.lat),
        lngMin: Math.min(...a.lng), lngMaks: Math.max(...a.lng),
      }))
      .sort((x, y) => x.kode.localeCompare(y.kode, "id"));
  }, [temuan, dirabas, saring.sumber]);

  // Hanya penyulang yang dicentang di folder Pohon yang digambar.
  const temuanPilih = useMemo(() => temuan.filter((t) => nyala.has(`pohon:${t.penyulang}`)), [temuan, nyala]);
  const dirabasPilih = useMemo(() => dirabas.filter((p) => nyala.has(`pohon:${p.penyulang}`)), [dirabas, nyala]);
  const temuanTampil = useMemo(
    () =>
      saring.sumber.has("inspeksi")
        ? temuanPilih.filter(
            (t) =>
              saring.vegetasi.has(t.vegetasi) &&
              !(saring.sembunyikanTertangani && t.tertangani) &&
              // Belum disetujui (statusTugas null) ikut "belum ditugaskan".
              saring.tugas.has(t.statusTugas === "Ditugaskan" || t.statusTugas === "Selesai" ? "sudah" : "belum"),
          )
        : [],
    [temuanPilih, saring],
  );
  const dirabasTampil = saring.sumber.has("perabasan") ? dirabasPilih : [];

  return {
    daftar,
    temuan: temuanTampil,
    dirabas: dirabasTampil,
    total: temuanPilih.length + dirabasPilih.length,
    /** Jumlah per sumber se-ULP (untuk penyaring sumber di panel kiri). */
    perSumber: { inspeksi: temuan.length, perabasan: dirabas.length } as Record<SumberPohon, number>,
    tertangani: temuanPilih.filter((t) => t.tertangani).length,
    sibuk,
    galat,
    muatUlang: () => setNonce((n) => n + 1),
  };
}
