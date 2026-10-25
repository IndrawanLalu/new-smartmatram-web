import type { RekapSection, SectionSegmen, SegmenBaris } from "../_hooks/useMasterSegmen";

/**
 * Daftar segmen dikelompokkan Penyulang → Section → Segmen (X4). Section
 * diurutkan hulu → hilir; segmen di dalamnya tetap urutan masukan (paling lama
 * tidak diinspeksi di atas). Segmen tanpa tiang belum punya section — ditaruh
 * di kelompok "Belum dititik" penyulangnya.
 */

export interface KelompokSection {
  /** null = kelompok "Belum dititik". */
  rekap: RekapSection | null;
  baris: SegmenBaris[];
}

export interface KelompokPenyulang {
  penyulang: string;
  ulp: string;
  bagian: KelompokSection[];
}

const kunci = (penyulang: string, ulp: string) => `${penyulang.toUpperCase()}|${ulp.toUpperCase()}`;

export function kelompokkanSection(
  baris: SegmenBaris[],
  sectionDari: Map<string, SectionSegmen>,
  rekap: RekapSection[],
  /** Section tanpa segmen ikut tampil — dimatikan saat mencari, supaya hasilnya ringkas. */
  denganKosong: boolean,
  ulp: string,
): KelompokPenyulang[] {
  const per = new Map<string, KelompokPenyulang & { section: Map<string, KelompokSection>; belum: SegmenBaris[] }>();
  const ambil = (penyulang: string, u: string) => {
    const k = kunci(penyulang, u);
    let p = per.get(k);
    if (!p) {
      p = { penyulang, ulp: u, bagian: [], section: new Map(), belum: [] };
      per.set(k, p);
    }
    return p;
  };
  const rekapId = new Map(rekap.map((r) => [r.section_id, r]));

  if (denganKosong) {
    for (const r of rekap) {
      if (ulp && r.ulp !== ulp) continue;
      ambil(r.penyulang, r.ulp).section.set(r.section_id, { rekap: r, baris: [] });
    }
  }
  for (const b of baris) {
    const p = ambil(b.penyulang, b.ulp);
    const s = sectionDari.get(b.segmen_id);
    const r = s ? rekapId.get(s.section_id) : undefined;
    if (!s || !r) {
      p.belum.push(b);
      continue;
    }
    let k = p.section.get(s.section_id);
    if (!k) {
      k = { rekap: r, baris: [] };
      p.section.set(s.section_id, k);
    }
    k.baris.push(b);
  }

  return [...per.values()]
    .map(({ section, belum, ...p }) => ({
      ...p,
      bagian: [
        ...[...section.values()].sort((a, b) => a.rekap!.urutan - b.rekap!.urutan || a.rekap!.nama.localeCompare(b.rekap!.nama)),
        ...(belum.length ? [{ rekap: null, baris: belum }] : []),
      ],
    }))
    .sort((a, b) => a.penyulang.localeCompare(b.penyulang) || a.ulp.localeCompare(b.ulp));
}
