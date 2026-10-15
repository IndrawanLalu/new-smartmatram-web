"use client";

import { useJarakJtr } from "../_hooks/useJarakJtr";
import type { TitikUjungPeta } from "../_hooks/useUjungPeta";

/**
 * "Jarak dari gardu" tegangan ujung: lewat kabel JTR bila rantai tiangnya
 * sampai ke gardu, garis lurus sebagai pembanding / cadangan.
 */

export const meter = (v: number | null) =>
  v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2).replace(".", ",")} km` : `${Math.round(v)} m`;

export default function JarakGardu({ t }: { t: TitikUjungPeta }) {
  const jtr = useJarakJtr(t);
  const lurus = t.jarak_gardu_m === null ? "gardu belum bertitik" : `${meter(t.jarak_gardu_m)} garis lurus`;
  if (jtr === undefined) return <>Jarak dari gardu: menghitung… · {lurus}</>;
  if (jtr === null) return <>Jarak dari gardu: {lurus} (JTR belum lengkap)</>;
  return (
    <>
      Jarak dari gardu: <b>{meter(jtr)} lewat JTR</b> · {lurus}
    </>
  );
}
