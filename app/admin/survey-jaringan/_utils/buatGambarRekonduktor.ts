import React from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { bacaJaringanGardu } from "@/lib/bacaJtrGardu";
import { ambilLatar, ambilLogo } from "@/lib/gambarSurvey/latar";
import { fotoBertanda } from "@/lib/gambarSurvey/tandaFoto";
import type { SurveyJaringan } from "@/lib/surveyJaringan";
import { susunGambarRekon } from "../_lib/gambarRekonduktor";
import type { FotoPdf } from "../_lib/fotoPdf";

/** Gambar survey Rekonduktor JTR (berkas) — dipratinjau dulu, diunduh dari pratinjau. */
export async function buatGambarRekonduktor(s: SurveyJaringan): Promise<Blob> {
  if (!s.ruas.length || !s.gardu_kode) throw new Error("Survey ini belum punya ruas.");
  const [jaringan, logo, foto] = await Promise.all([
    bacaJaringanGardu(s.gardu_kode),
    ambilLogo(),
    Promise.all(s.foto.slice(0, 4).map(async (f, i) => {
      const b = await fotoBertanda(f, 900);
      return b ? { ...b, ket: f.ket, nomor: i + 1 } : null;
    })),
  ]);
  const g = susunGambarRekon(s.ruas, jaringan, s.gardu_kode);
  const [{ pdf }, { default: GambarRekonduktorPdf }, latar] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../_lib/GambarRekonduktorPdf"),
    ambilLatar(g.ruang, s.latar),
  ]);
  const el = React.createElement(GambarRekonduktorPdf, {
    s, g, foto: foto.filter((f): f is FotoPdf => !!f), logo, latar,
  }) as unknown as React.ReactElement<DocumentProps>;
  return pdf(el).toBlob();
}
