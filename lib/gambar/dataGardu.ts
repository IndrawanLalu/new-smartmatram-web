import { supabaseAdmin } from "@/lib/supabase-admin";
import type { JurusanData } from "@/lib/garduAmbang";

/**
 * Bahan kartu `#DATA <kode>` (WA): master gardu, beban puncak (pengukuran
 * malam terakhir), tegangan ujung terakhir per jurusan, dan pemeliharaan
 * terakhir beserta pengukuran siang sebelum/sesudah. Dibaca dengan service
 * role — pemanggil (webhook WA) yang menjaga siapa yang boleh bertanya.
 */

export interface MasterGardu {
  kode: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  merk: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
}

export interface BebanPuncak {
  tanggal: string;
  jam: string | null;
  kva: number | null;
  persen: number | null;
  bebanKva: number | null;
  suhu: number | null;
  arus: { R: number | null; S: number | null; T: number | null; N: number | null };
  tegangan: { RN: number | null; SN: number | null; TN: number | null };
  petugas: string | null;
  perjurusan: Record<string, JurusanData>;
}

export interface UjungJurusan {
  jurusan: string;
  rn: number | null;
  sn: number | null;
  tn: number | null;
  bawahStandar: boolean;
  jarakM: number | null;
  tgl: string;
  status: string;
}

export interface UkurHar {
  arus: { R: number | null; S: number | null; T: number | null; N: number | null };
  tegangan: { RN: number | null; SN: number | null; TN: number | null };
  perjurusan: Record<string, JurusanData>;
  pentanahan: { arrester: number | null; trafo: number | null; netral: number | null };
}

export interface Pemeliharaan {
  tgl: string | null;
  status: string;
  regu: string | null;
  catatan: string | null;
  fuse: Record<string, { R?: string; S?: string; T?: string }>;
  sebelum: UkurHar | null;
  sesudah: UkurHar | null;
}

export interface DataGardu {
  gardu: MasterGardu;
  beban: BebanPuncak | null;
  ujung: UjungJurusan[];
  har: Pemeliharaan | null;
}

const angka = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const KOLOM_MASTER = "kode,ulp,nama,alamat,penyulang,kva_master,merk,status,lat,lng";

/** Gardu yang cocok: kode persis dulu, lalu sebagian kode / nama / alamat. */
export async function cariGardu(q: string, ulp: string | null): Promise<MasterGardu[]> {
  const persis = supabaseAdmin.from("gardu_master_state").select(KOLOM_MASTER).ilike("kode", q.replace(/[%_]/g, ""));
  const { data, error } = await (ulp ? persis.ilike("ulp", ulp) : persis);
  if (error) throw new Error(error.message);
  if (data?.length) return data as MasterGardu[];
  const pola = `%${q.replace(/[%_,()]/g, "")}%`;
  const { data: mirip, error: e2 } = await supabaseAdmin.from("gardu_master_state").select(KOLOM_MASTER)
    .or(`kode.ilike.${pola},nama.ilike.${pola},alamat.ilike.${pola}`).order("kode").limit(10);
  if (e2) throw new Error(e2.message);
  return (mirip ?? []) as MasterGardu[];
}

function jurusanBersih(p: unknown): Record<string, JurusanData> {
  return p && typeof p === "object" ? (p as Record<string, JurusanData>) : {};
}

function keUkurHar(r: Record<string, unknown> | undefined): UkurHar | null {
  if (!r) return null;
  return {
    arus: { R: angka(r.arus_r), S: angka(r.arus_s), T: angka(r.arus_t), N: angka(r.arus_n) },
    tegangan: { RN: angka(r.teg_rn), SN: angka(r.teg_sn), TN: angka(r.teg_tn) },
    perjurusan: jurusanBersih(r.perjurusan),
    pentanahan: { arrester: angka(r.pertanahan_arrester), trafo: angka(r.pertanahan_trafo), netral: angka(r.pertanahan_netral) },
  };
}

export async function ambilDataGardu(g: MasterGardu): Promise<DataGardu> {
  const kode = g.kode.toUpperCase();
  const [ukur, tu, har] = await Promise.all([
    // Beban puncak = pengukuran gardu (malam). Kode tidak unik lintas ULP →
    // dipersempit ke unit petugasnya; yang dikembalikan admin tidak dipakai.
    supabaseAdmin.from("pengukuran_gardu")
      .select("tanggal_pengukuran,jam_pengukuran,kva_trafo,persen_beban,beban_kva,suhu_trafo,total_arus_r,total_arus_s,total_arus_t,total_arus_n,total_teg_rn,total_teg_sn,total_teg_tn,petugas_nama,petugas_unit,perjurusan")
      .ilike("no_gardu", kode).is("dikembalikan_at", null)
      .order("tanggal_pengukuran", { ascending: false }).order("jam_pengukuran", { ascending: false, nullsFirst: false })
      .limit(10),
    supabaseAdmin.from("tegangan_ujung_daftar")
      .select("jurusan,v_rn,v_sn,v_tn,di_bawah_standar,jarak_gardu_m,tgl_ukur,jam_ukur,status,status_tampil")
      .ilike("gardu_kode", kode).ilike("ulp", g.ulp)
      .order("tgl_ukur", { ascending: false }).order("jam_ukur", { ascending: false }).limit(60),
    supabaseAdmin.from("pemeliharaan_gardu")
      .select("id,status,tgl_selesai,petugas_nama,catatan_perbaikan,reting_fuse")
      .ilike("gardu_kode", kode).ilike("ulp", g.ulp).in("status", ["Selesai", "Diverifikasi"])
      .order("tgl_selesai", { ascending: false, nullsFirst: false }).limit(1),
  ]);
  for (const r of [ukur, tu, har]) if (r.error) throw new Error(r.error.message);

  const u = (ukur.data ?? []).find((x) => (x.petugas_unit ?? "").toUpperCase() === g.ulp.toUpperCase()) ?? ukur.data?.[0];
  const beban: BebanPuncak | null = u
    ? {
        tanggal: u.tanggal_pengukuran,
        jam: u.jam_pengukuran ? String(u.jam_pengukuran).slice(0, 5) : null,
        kva: angka(u.kva_trafo),
        persen: angka(u.persen_beban),
        bebanKva: angka(u.beban_kva),
        suhu: angka(u.suhu_trafo),
        arus: { R: angka(u.total_arus_r), S: angka(u.total_arus_s), T: angka(u.total_arus_t), N: angka(u.total_arus_n) },
        tegangan: { RN: angka(u.total_teg_rn), SN: angka(u.total_teg_sn), TN: angka(u.total_teg_tn) },
        petugas: u.petugas_nama,
        perjurusan: jurusanBersih(u.perjurusan),
      }
    : null;

  // Tegangan ujung: yang terbaru per jurusan, hanya kiriman yang sah
  // (Disetujui / Menunggu verifikasi) — dikembalikan & dibatalkan dilewati.
  const ujung = new Map<string, UjungJurusan>();
  for (const t of tu.data ?? []) {
    if (t.status !== "Terkirim" || ujung.has(t.jurusan)) continue;
    ujung.set(t.jurusan, {
      jurusan: t.jurusan, rn: angka(t.v_rn), sn: angka(t.v_sn), tn: angka(t.v_tn),
      bawahStandar: !!t.di_bawah_standar, jarakM: angka(t.jarak_gardu_m), tgl: t.tgl_ukur, status: t.status_tampil,
    });
  }

  let pemeliharaan: Pemeliharaan | null = null;
  const h = har.data?.[0];
  if (h) {
    const { data: uk, error } = await supabaseAdmin.from("pemeliharaan_gardu_ukur")
      .select("tahap,arus_r,arus_s,arus_t,arus_n,teg_rn,teg_sn,teg_tn,pertanahan_arrester,pertanahan_trafo,pertanahan_netral,perjurusan")
      .eq("pemeliharaan_id", h.id);
    if (error) throw new Error(error.message);
    pemeliharaan = {
      tgl: h.tgl_selesai,
      status: h.status === "Diverifikasi" ? "Disetujui" : "Menunggu persetujuan",
      regu: h.petugas_nama,
      catatan: h.catatan_perbaikan,
      fuse: (h.reting_fuse ?? {}) as Pemeliharaan["fuse"],
      sebelum: keUkurHar(uk?.find((x) => x.tahap === "sebelum")),
      sesudah: keUkurHar(uk?.find((x) => x.tahap === "sesudah")),
    };
  }

  return { gardu: g, beban, ujung: [...ujung.values()].sort((a, b) => a.jurusan.localeCompare(b.jurusan)), har: pemeliharaan };
}
