import React from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { keGawang } from "../_hooks/useAnalisisJtr";
import type { UsulanJtr } from "../_hooks/useUsulanJtr";
import { nadaUjung } from "@/app/peta/_hooks/useUjungPeta";
import { ambilLatar, ambilLogo, unduhBerkas } from "@/lib/gambarSurvey/latar";
import { susunGambar, type Koord, type UjungGambar } from "../_lib/gambarSurvey";

/**
 * Gambar survey satu usulan (PDF A3): JTR SELURUH gardu itu dari data JTR
 * sekarang (jurusan lain abu-abu) di atas peta jalan OpenStreetMap, angka &
 * material dari usulan tersimpan.
 */

/** ilike tanpa wildcard — kode gardu boleh mengandung "_". */
const polaPersis = (s: string) => s.replace(/[%_\\]/g, "\\$&");

/**
 * Tegangan ujung terakhir tiap jurusan gardu ini (setahun terakhir), yang
 * belum dibatalkan/dikembalikan — sama dengan "Semua bulan" di lapisan peta.
 */
async function ambilUjung(kode: string): Promise<(Koord & UjungGambar)[]> {
  const sejak = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabaseBrowser
    .from("tegangan_ujung_daftar")
    .select("jurusan,v_rn,v_sn,v_tn,v_min,lat,lng,tgl_ukur,status_tampil")
    .ilike("gardu_kode", polaPersis(kode))
    .gte("tgl_ukur", sejak)
    .neq("status", "Dibatalkan")
    .order("tgl_ukur", { ascending: false });
  if (error) throw error;
  const per = new Map<string, Koord & UjungGambar>();
  for (const x of data ?? []) {
    if (x.status_tampil === "Dikembalikan" || x.lat === null || x.lng === null || per.has(x.jurusan)) continue;
    per.set(x.jurusan, {
      jurusan: x.jurusan, lat: Number(x.lat), lng: Number(x.lng),
      v_rn: Number(x.v_rn), v_sn: Number(x.v_sn), v_tn: Number(x.v_tn),
      nada: nadaUjung(Number(x.v_min)), tgl: x.tgl_ukur,
    });
  }
  return [...per.values()];
}

export async function unduhGambarSurvey(u: UsulanJtr) {
  const kode = u.gardu_kode.toUpperCase();
  const [rows, gardu, logo, ujung] = await Promise.all([
    fetchAllRows<Record<string, unknown>>(() =>
      supabaseBrowser.from("analisis_jtr_gawang").select("*").eq("gardu_kode", kode).order("jurusan").order("tiang_id"),
    ),
    supabaseBrowser.from("gardu").select("nama,lat,lng").ilike("kode", polaPersis(kode)).limit(1).maybeSingle(),
    ambilLogo(),
    ambilUjung(kode),
  ]);
  if (gardu.error) throw gardu.error;
  const gawang = rows.map(keGawang);
  if (!gawang.length) throw new Error(`Data JTR gardu ${kode} tidak ditemukan.`);

  const ids = [...new Set(gawang.map((x) => x.tiang_id))];
  const koord = new Map<string, Koord>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabaseBrowser.from("tiang").select("id,lat,lng").in("id", ids.slice(i, i + 150));
    if (error) throw error;
    for (const x of data ?? []) if (x.lat !== null && x.lng !== null) koord.set(x.id, { lat: Number(x.lat), lng: Number(x.lng) });
  }
  if (!koord.size) throw new Error(`Tiang JTR gardu ${kode} belum berkoordinat.`);

  const g = gardu.data;
  const gambar = susunGambar({
    gawang,
    koord,
    gardu: g?.lat != null && g?.lng != null ? { lat: Number(g.lat), lng: Number(g.lng) } : null,
    garduKode: kode,
    jurusan: u.jurusan,
    pecah: u.opsi ? { titikId: u.opsi.titikId, pindah: u.opsi.pindah, kabelBaru: u.opsi.kabelBaru, cara: u.opsi.cara ?? "potong" } : null,
    sisip: u.pekerjaan === "sisip" && u.titik_lat !== null && u.titik_lng !== null ? { lat: u.titik_lat, lng: u.titik_lng } : null,
    ujung,
  });

  const [{ pdf }, { default: GambarSurveyPdf }, latar] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../_lib/GambarSurveyPdf"),
    ambilLatar(gambar.ruang),
  ]);
  const el = React.createElement(GambarSurveyPdf, { u, g: gambar, garduNama: g?.nama ?? null, logo, latar }) as unknown as React.ReactElement<DocumentProps>;
  unduhBerkas(await pdf(el).toBlob(), `Gambar survey ${kode}-${u.jurusan}.pdf`);
}
