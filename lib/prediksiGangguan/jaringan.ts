import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { impedansiKonduktor } from "./impedansi";

/**
 * Jalur fisik satu penyulang dari pangkalnya (dekat GI) sampai ujung, beserta
 * impedansi kumulatif Z1 tiap tiang. Sumber: master JTM.
 *
 * - Anggota = tiang yang dipikul segmen aktif penyulang itu (`segmen_tiang`,
 *   termasuk yang menumpang di tiang penyulang lain) + tiang miliknya.
 * - Induk per penyulang (`tiang_kode_penyulang.induk_id`) didahulukan dari
 *   induk batang. Leluhur yang bukan anggota ikut dimuat: Meninting keluar GI
 *   menumpang tiang Perumnas/Ampenan sejauh ±5,7 km, dan jarak itu nyata.
 * - Konduktor = isian JTM terkini untuk sirkit penyulang itu; tiang tanpa
 *   isian mewarisi konduktor induknya (pangkal tanpa isian = AAAC 150).
 */

export interface Titik {
  id: string;
  kode: string;
  lat: number | null;
  lng: number | null;
  induk: string | null;
  penanda: string | null;
  peralatan: string | null;
  /** Penyulang pemilik tiang (konduktor teratas). */
  pemilik: string | null;
  anggota: boolean;
  /** Jarak dari pangkal menyusuri jaringan (km). */
  km: number;
  /** Z1 kumulatif dari pangkal (Ω). */
  r: number;
  x: number;
  /** Bagian jalur dari pangkal yang konduktornya tidak terisi (km). */
  tanpaData: number;
}

export interface Jaringan {
  penyulang: string;
  titik: Map<string, Titik>;
  anak: Map<string, string[]>;
  /** Nama peralatan di ujung segmen penyulang ini / hanya di penyulang lain (tanpa awalan). */
  alatSendiri: Set<string>;
  alatLain: Set<string>;
}

interface BarisTiang {
  id: string; kode: string; induk_id: string | null; lat: number | null; lng: number | null;
  penanda: string | null; nama_peralatan: string | null; penyulang: string | null;
}

const KOLOM = "id,kode,induk_id,lat,lng,penanda,nama_peralatan,penyulang";
const POTONG = 150;
const SIMPAN_MS = 10 * 60 * 1000;
const tembolok = new Map<string, { t: number; j: Jaringan }>();

function jarakKm(a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
  const s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

async function perPotong<T>(ids: string[], ambil: (potong: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const hasil: T[] = [];
  for (let i = 0; i < ids.length; i += POTONG) {
    const { data, error } = await ambil(ids.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    hasil.push(...(data ?? []));
  }
  return hasil;
}

async function bangun(penyulang: string): Promise<Jaringan | null> {
  const db = supabaseAdmin;
  const segmen = await daftarSegmen();
  const ujung = (x: BarisSegmen) => [namaAlat(x.titik_awal_nama ?? ""), namaAlat(x.titik_akhir_nama ?? "")];
  const milik = segmen.filter((x) => x.penyulang === penyulang);
  const idSeg = milik.map((x) => x.id);
  const alatSendiri = new Set(milik.flatMap(ujung).filter(Boolean));
  const alatLain = new Set(segmen.filter((x) => x.penyulang !== penyulang).flatMap(ujung).filter((n) => n && !alatSendiri.has(n)));

  const [dipikul, punya, kodeP] = await Promise.all([
    perPotong<{ tiang_id: string }>(idSeg, (p) => db.from("segmen_tiang").select("tiang_id").in("segmen_id", p)),
    fetchAllRows<{ id: string }>(() => db.from("tiang").select("id").eq("penyulang", penyulang).eq("status_hidup", "aktif").order("id")),
    fetchAllRows<{ tiang_id: string; kode: string; induk_id: string | null }>(() =>
      db.from("tiang_kode_penyulang").select("tiang_id,kode,induk_id").eq("penyulang", penyulang).order("tiang_id")),
  ]);
  const anggota = new Set([...dipikul.map((x) => x.tiang_id), ...punya.map((x) => x.id)]);
  if (!anggota.size) return null;

  const kodeDi = new Map(kodeP.map((k) => [k.tiang_id, k.kode]));
  const indukDi = new Map(kodeP.filter((k) => k.induk_id).map((k) => [k.tiang_id, k.induk_id as string]));

  const baris = new Map<string, BarisTiang>();
  for (const t of await perPotong<BarisTiang>([...anggota], (p) => db.from("tiang").select(KOLOM).in("id", p))) baris.set(t.id, t);
  const induk = (t: BarisTiang) => indukDi.get(t.id) ?? t.induk_id;
  for (let putaran = 0; putaran < 50; putaran++) {
    const hilang = [...new Set([...baris.values()].map(induk).filter((i): i is string => !!i && !baris.has(i)))];
    if (!hilang.length) break;
    const leluhur = await perPotong<BarisTiang>(hilang, (p) => db.from("tiang").select(KOLOM).in("id", p));
    if (!leluhur.length) break;
    for (const t of leluhur) baris.set(t.id, t);
  }

  const isian = await perPotong<{ tiang_id: string; item_kode: string; nilai: string; sirkit_penyulang: string | null; penyulang: string | null }>(
    [...baris.keys()],
    (p) => db.from("jtm_isian_terkini").select("tiang_id,item_kode,nilai,sirkit_penyulang,penyulang")
      .in("item_kode", ["jenis_konduktor", "ukuran_konduktor"]).in("tiang_id", p),
  );
  const kond = new Map<string, { jenis?: string; ukuran?: string }>();
  for (const x of isian) {
    if ((x.sirkit_penyulang ?? x.penyulang) !== penyulang) continue;
    const k = kond.get(x.tiang_id) ?? {};
    if (x.item_kode === "jenis_konduktor") k.jenis = x.nilai; else k.ukuran = x.nilai;
    kond.set(x.tiang_id, k);
  }

  const anak = new Map<string, string[]>();
  const akar: string[] = [];
  for (const t of baris.values()) {
    const i = induk(t);
    if (i && baris.has(i)) (anak.get(i) ?? anak.set(i, []).get(i)!).push(t.id);
    else akar.push(t.id);
  }

  // Telusur dari pangkal: konduktor ruas induk→anak = isian di anak (atau warisan induk).
  const titik = new Map<string, Titik>();
  const warisan = new Map<string, { jenis?: string; ukuran?: string } | undefined>();
  const antre = akar.map((id) => {
    const t = baris.get(id)!;
    warisan.set(id, kond.get(id));
    titik.set(id, {
      id, kode: kodeDi.get(id) ?? t.kode, lat: t.lat, lng: t.lng, induk: null, penanda: t.penanda,
      peralatan: t.nama_peralatan, pemilik: t.penyulang, anggota: anggota.has(id), km: 0, r: 0, x: 0, tanpaData: 0,
    });
    return id;
  });
  while (antre.length) {
    const pid = antre.shift()!;
    const p = titik.get(pid)!;
    for (const cid of anak.get(pid) ?? []) {
      if (titik.has(cid)) continue;
      const c = baris.get(cid)!;
      const sendiri = kond.get(cid);
      const k = sendiri?.ukuran || sendiri?.jenis ? sendiri : warisan.get(pid);
      warisan.set(cid, k);
      const z = impedansiKonduktor(k?.jenis, k?.ukuran);
      const L = jarakKm(p, c);
      titik.set(cid, {
        id: cid, kode: kodeDi.get(cid) ?? c.kode, lat: c.lat, lng: c.lng, induk: pid, penanda: c.penanda,
        peralatan: c.nama_peralatan, pemilik: c.penyulang, anggota: anggota.has(cid),
        km: p.km + L, r: p.r + z.r * L, x: p.x + z.x * L, tanpaData: p.tanpaData + (k ? 0 : L),
      });
      antre.push(cid);
    }
  }
  return { penyulang, titik, anak, alatSendiri, alatLain };
}

export async function muatJaringan(penyulang: string): Promise<Jaringan | null> {
  const ada = tembolok.get(penyulang);
  if (ada && Date.now() - ada.t < SIMPAN_MS) return ada.j;
  const j = await bangun(penyulang);
  if (j) tembolok.set(penyulang, { t: Date.now(), j });
  return j;
}

/** Semua titik di hilir `id` (termasuk dirinya). */
export function hilir(j: Jaringan, id: string): string[] {
  const hasil: string[] = [];
  const tumpuk = [id];
  while (tumpuk.length) {
    const n = tumpuk.pop()!;
    hasil.push(n);
    tumpuk.push(...(j.anak.get(n) ?? []));
  }
  return hasil;
}

/** Nama alat tanpa awalan jenis: "REC. KARANG SEME" → "KARANG SEME". */
export function namaAlat(s: string): string {
  return s.toUpperCase().replace(/^(REC|RECLOSER|LBSM|LBS|SSO|FCO|OL|GH|PMT)\.?\s+/, "").replace(/\s+/g, " ").trim();
}

/** Tiang tempat sebuah peralatan (recloser dsb.) terpasang di jaringan ini. */
export function cariAlat(j: Jaringan, nama: string): Titik | null {
  const n = namaAlat(nama);
  for (const t of j.titik.values()) if (t.peralatan && namaAlat(t.peralatan) === n) return t;
  return null;
}

/**
 * Peralatan di tiang ini milik penyulang ini? Satu tiang bisa memikul dua
 * penyulang: Rec. Karang Seme ada di tiang BTW-060 (milik Batu Dawa) tetapi
 * memutus Bung Karno. Penentunya nama ujung segmen; alat tanpa nama ikut
 * pemilik tiang.
 */
export function alatMilik(j: Jaringan, t: Titik): boolean {
  const n = t.peralatan ? namaAlat(t.peralatan) : "";
  if (n && j.alatSendiri.has(n)) return true;
  if (n && j.alatLain.has(n)) return false;
  return t.pemilik === j.penyulang;
}

// ── Nama penyulang: sheet/WA ↔ master JTM ────────────────────────────────────

interface BarisSegmen { id: string; penyulang: string; titik_awal_nama: string | null; titik_akhir_nama: string | null }
let segmenAktif: { t: number; baris: BarisSegmen[] } | null = null;

async function daftarSegmen(): Promise<BarisSegmen[]> {
  if (!segmenAktif || Date.now() - segmenAktif.t > SIMPAN_MS) {
    const baris = await fetchAllRows<BarisSegmen>(() =>
      supabaseAdmin.from("segmen").select("id,penyulang,titik_awal_nama,titik_akhir_nama").eq("status", "aktif").order("id"));
    segmenAktif = { t: Date.now(), baris };
  }
  return segmenAktif.baris;
}

const ringkas = (s: string) =>
  s.toUpperCase().replace(/^(OL|IN)\.?\s+/, "").replace(/\bTIGA\b/g, "3").replace(/[^A-Z0-9]/g, "");

/**
 * "MVTIC TIGA GILI" (sheet) = "MVTIC 3 GILI" (JTM); "CEMARA" = "OL. CEMARA" /
 * "IN CEMARA". Kalau lebih dari satu cocok, ambil yang segmennya paling banyak.
 */
export async function namaPenyulangJtm(nama: string): Promise<string | null> {
  const hitung = new Map<string, number>();
  for (const x of await daftarSegmen()) hitung.set(x.penyulang, (hitung.get(x.penyulang) ?? 0) + 1);
  const daftar = [...hitung].map(([asli, n]) => ({ asli, n }));
  const persis = daftar.find((x) => x.asli === nama.toUpperCase().trim());
  if (persis) return persis.asli;
  const r = ringkas(nama);
  return daftar.filter((x) => ringkas(x.asli) === r).sort((a, b) => b.n - a.n)[0]?.asli ?? null;
}
