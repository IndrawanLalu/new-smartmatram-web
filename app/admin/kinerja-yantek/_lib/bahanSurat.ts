import { supabaseBrowser } from "@/lib/supabase-browser";
import type { DataSurat } from "../_hooks/useWoSurat";
import { hariLibur, JENIS_SURAT, susunLampiran, tglSurat, type PaketSurat } from "./woSurat";

const keDataUrl = (b: Blob) =>
  new Promise<string>((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => gagal(r.error);
    r.readAsDataURL(b);
  });

/** Tanda tangan dari bucket PRIVAT `ttd` — diunduh sebagai pengguna yang
 *  sedang masuk, tidak pernah lewat tautan publik. */
export async function ambilTtd(path: string | null) {
  if (!path) return null;
  const { data, error } = await supabaseBrowser.storage.from("ttd").download(path);
  if (error || !data) throw new Error(`Tanda tangan gagal dibaca (${path}): ${error?.message ?? "kosong"}`);
  return keDataUrl(data);
}

async function ambilLogo() {
  const r = await fetch("/logo-pln.png");
  return r.ok ? keDataUrl(await r.blob()) : null;
}

/** Bahan PDF & Excel — disusun sekali, supaya keduanya pasti sama isinya. */
export async function susunPaket(d: DataSurat, ulp: string, tahun: number, bulan: number, nomor: string): Promise<PaketSurat> {
  const libur = hariLibur(tahun, bulan, d.libur.map((l) => l.tanggal));
  const [logo, ttdManager, ttdTl] = await Promise.all([ambilLogo(), ambilTtd(d.set.ttd_manager), ambilTtd(d.set.ttd_tl)]);
  return {
    ulp,
    tahun,
    bulan,
    nomor,
    tglSurat: tglSurat(tahun, bulan),
    set: d.set,
    baris: JENIS_SURAT.map((jenis) => ({ jenis, nilai: d.angka[jenis.kunci] ?? null })),
    lampiran: susunLampiran(d.objek, tahun, bulan, libur),
    libur,
    logo,
    ttdManager,
    ttdTl,
  };
}

/** Potret angka surat untuk `wo_surat.angka`. */
export const potretAngka = (p: PaketSurat) => Object.fromEntries(p.baris.map((b) => [b.jenis.kunci, b.nilai]));
