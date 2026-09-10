import type { SaringanKondisi } from "./kondisiGardu";

export type StatusHar = "" | "belum" | "sudah";

/**
 * Saringan Master Gardu yang bisa dibawa di alamat halaman.
 *
 * Alasannya bukan kerapian: dashboard HARGARDU perlu bisa menautkan tiap
 * potongan batangnya ke daftar gardunya — "24 gardu tanpa tekep FCO" harus bisa
 * diklik dan mendarat pada dua puluh empat baris itu, bukan pada tabel kosong
 * yang saringannya harus disusun ulang dengan tangan.
 */
export interface SaringanUrl {
  ulp: string;
  kondisi: SaringanKondisi;
  statusHar: StatusHar;
}

const PISAH_ITEM = ";";
const PISAH_NILAI = ",";

/** `k=tekep_fco:tidak_ada,rusak;kondisi_trafo:__tidak_normal` */
export function bacaSaringanUrl(sp: URLSearchParams | null): SaringanUrl {
  const kondisi: SaringanKondisi = {};
  const k = sp?.get("k");
  if (k) {
    for (const bagian of k.split(PISAH_ITEM)) {
      const [item, nilai] = bagian.split(":");
      if (!item || !nilai) continue;
      const daftar = nilai.split(PISAH_NILAI).filter(Boolean);
      if (daftar.length > 0) kondisi[item] = daftar;
    }
  }
  const har = sp?.get("har");
  return {
    ulp: sp?.get("ulp") ?? "",
    kondisi,
    statusHar: har === "belum" || har === "sudah" ? har : "",
  };
}

export function tulisSaringanUrl(s: Partial<SaringanUrl>): string {
  const sp = new URLSearchParams();
  if (s.ulp) sp.set("ulp", s.ulp);
  if (s.kondisi) {
    const bagian = Object.entries(s.kondisi)
      .filter(([, v]) => v.length > 0)
      .map(([item, v]) => `${item}:${v.join(PISAH_NILAI)}`);
    if (bagian.length > 0) sp.set("k", bagian.join(PISAH_ITEM));
  }
  if (s.statusHar) sp.set("har", s.statusHar);
  const q = sp.toString();
  return q ? `/admin/master-gardu?${q}` : "/admin/master-gardu";
}
