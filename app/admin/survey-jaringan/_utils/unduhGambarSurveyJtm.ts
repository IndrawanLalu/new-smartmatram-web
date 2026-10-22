import React from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ambilLatar, ambilLogo, unduhBerkas } from "@/lib/gambarSurvey/latar";
import { fotoBertanda } from "@/lib/gambarSurvey/tandaFoto";
import type { SurveyJaringan, TiangSambung, TitikSurvey } from "@/lib/surveyJaringan";
import { susunGambarJtm, type TiangSekitar } from "../_lib/gambarSurveyJtm";
import { RASIO_FOTO_PDF, type FotoPdf } from "../_lib/fotoPdf";

/** Jaringan JTM yang ada di sekitar survey — patokan di gambar (±150 m di luar bingkai). */
const MARGIN_DERAJAT = 0.0015;
const BATAS_SEKITAR = 1500;

async function ambilSekitar(titik: { lat: number; lng: number }[]): Promise<TiangSekitar[]> {
  const lat = titik.map((t) => t.lat);
  const lng = titik.map((t) => t.lng);
  const { data, error } = await supabaseBrowser
    .from("tiang")
    .select("id,kode,induk_id,lat,lng,penanda")
    .not("penyulang", "is", null)
    .is("gardu_kode", null)
    .eq("status_hidup", "aktif")
    .gte("lat", Math.min(...lat) - MARGIN_DERAJAT).lte("lat", Math.max(...lat) + MARGIN_DERAJAT)
    .gte("lng", Math.min(...lng) - MARGIN_DERAJAT).lte("lng", Math.max(...lng) + MARGIN_DERAJAT)
    .limit(BATAS_SEKITAR);
  if (error) throw error;
  return (data ?? [])
    .filter((x) => x.lat !== null && x.lng !== null)
    .map((x) => ({ ...x, lat: Number(x.lat), lng: Number(x.lng) }) as TiangSekitar);
}

export async function unduhGambarSurveyJtm(
  s: SurveyJaringan,
  titik: TitikSurvey[],
  sambung: Map<string, TiangSambung>,
  labelPenanda: (k: string) => string,
) {
  if (!titik.length) throw new Error("Survey ini belum punya gambar.");
  const [sekitar, logo, foto] = await Promise.all([
    ambilSekitar([...titik, ...sambung.values()]),
    ambilLogo(),
    // Foto dipotong pas kotaknya di PDF, simbol yang ditempel ikut tergambar.
    Promise.all(s.foto.slice(0, 4).map(async (f, i) => ({ src: await fotoBertanda(f, RASIO_FOTO_PDF, 900), ket: f.ket, nomor: i + 1 }))),
  ]);
  const g = susunGambarJtm(titik, sambung, sekitar, labelPenanda);
  const [{ pdf }, { default: GambarSurveyJtmPdf }, latar] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../_lib/GambarSurveyJtmPdf"),
    ambilLatar(g.ruang),
  ]);
  const el = React.createElement(GambarSurveyJtmPdf, {
    s, g, titik, sambung: [...sambung.values()], foto: foto.filter((f): f is FotoPdf => !!f.src), logo, latar,
  }) as unknown as React.ReactElement<DocumentProps>;
  unduhBerkas(await pdf(el).toBlob(), `Gambar survey ${s.judul}.pdf`);
}
