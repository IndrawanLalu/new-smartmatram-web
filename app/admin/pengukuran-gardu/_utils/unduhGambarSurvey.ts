import React from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { keGawang } from "../_hooks/useAnalisisJtr";
import type { UsulanJtr } from "../_hooks/useUsulanJtr";
import { susunGambar, type Koord } from "../_lib/gambarSurvey";

/**
 * Gambar survey satu usulan (PDF A3): JTR SELURUH gardu itu dari data JTR
 * sekarang (jurusan lain abu-abu), angka & material dari usulan tersimpan.
 */

const keDataUrl = (b: Blob) =>
  new Promise<string>((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => gagal(r.error);
    r.readAsDataURL(b);
  });

async function ambilLogo() {
  const r = await fetch("/logo-pln.png");
  return r.ok ? keDataUrl(await r.blob()) : null;
}

export async function unduhGambarSurvey(u: UsulanJtr) {
  const kode = u.gardu_kode.toUpperCase();
  const [rows, gardu, logo] = await Promise.all([
    fetchAllRows<Record<string, unknown>>(() =>
      supabaseBrowser.from("analisis_jtr_gawang").select("*").eq("gardu_kode", kode).order("jurusan").order("tiang_id"),
    ),
    supabaseBrowser.from("gardu").select("nama,lat,lng").ilike("kode", kode.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle(),
    ambilLogo(),
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
    pecah: u.opsi ? { titikId: u.opsi.titikId, pindah: u.opsi.pindah, kabelBaru: u.opsi.kabelBaru } : null,
    sisip: u.pekerjaan === "sisip" && u.titik_lat !== null && u.titik_lng !== null ? { lat: u.titik_lat, lng: u.titik_lng } : null,
  });

  const [{ pdf }, { default: GambarSurveyPdf }] = await Promise.all([import("@react-pdf/renderer"), import("../_lib/GambarSurveyPdf")]);
  const el = React.createElement(GambarSurveyPdf, { u, g: gambar, garduNama: g?.nama ?? null, logo }) as unknown as React.ReactElement<DocumentProps>;
  const blob = await pdf(el).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Gambar survey ${kode}-${u.jurusan}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
