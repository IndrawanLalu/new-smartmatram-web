import { NextResponse } from "next/server";
import { daftarPeristiwa, temuanUntuk } from "@/lib/prediksiGangguan/peristiwa";
import { daftarTemuan, type BarisTemuan } from "@/lib/prediksiGangguan/temuan";
import { akses } from "./_akses";

export const dynamic = "force-dynamic";

const SEMUA = ["2000-01-01", "2999-12-31"] as const;

export interface Kalibrasi { trafo: string; n: number; xs: number; min: number; max: number }
export interface Rapor {
  oc: { n: number; masuk: number; saran1: number; top3: number };
  ef: { n: number; masukZona: number; saran1: number; top3: number };
}

function kalibrasi(semua: BarisTemuan[]): Kalibrasi[] {
  const per = new Map<string, number[]>();
  for (const t of semua) if (t.trafo && t.xs_hitung != null) (per.get(t.trafo) ?? per.set(t.trafo, []).get(t.trafo)!).push(Number(t.xs_hitung));
  return [...per].map(([trafo, xs]) => {
    xs.sort((a, b) => a - b);
    return { trafo, n: xs.length, xs: xs[Math.floor(xs.length / 2)], min: xs[0], max: xs[xs.length - 1] };
  }).sort((a, b) => a.trafo.localeCompare(b.trafo));
}

function rapor(semua: BarisTemuan[]): Rapor {
  const oc = semua.filter((t) => t.jenis === "OC2" || t.jenis === "OC3");
  const ef = semua.filter((t) => t.jenis === "EF" || t.jenis === "TAK_JELAS");
  // "Saran ke-" = urutan kelompok cabang (OC) / seksi (EF) yang dibaca regu di WA.
  const ke = (d: BarisTemuan[], n: number) => d.filter((t) => t.seksi_ke != null && t.seksi_ke <= n).length;
  return {
    oc: { n: oc.length, masuk: oc.filter((t) => t.peringkat != null).length, saran1: ke(oc, 1), top3: ke(oc, 3) },
    ef: { n: ef.length, masukZona: ef.filter((t) => t.masuk_zona).length, saran1: ke(ef, 1), top3: ke(ef, 3) },
  };
}

// GET /api/prediksi-lokasi?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&ulp=AMPENAN
export async function GET(req: Request) {
  const a = await akses();
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const dari = q.get("dari"), sampai = q.get("sampai");
  if (!dari || !sampai) return NextResponse.json({ error: "Periode wajib diisi" }, { status: 400 });
  const ulp = a.unit ?? (q.get("ulp") && q.get("ulp") !== "SEMUA" ? q.get("ulp") : null);

  try {
    const [peristiwa, temuanPeriode, temuanSemua] = await Promise.all([
      daftarPeristiwa(dari, sampai, ulp),
      daftarTemuan(dari, sampai, ulp),
      daftarTemuan(...SEMUA, null),
    ]);
    return NextResponse.json({
      peristiwa: peristiwa.map((p) => ({ ...p, temuan: temuanUntuk(p, temuanPeriode) ?? null })),
      kalibrasi: kalibrasi(temuanSemua),
      rapor: rapor(ulp ? temuanSemua.filter((t) => t.ulp === ulp) : temuanSemua),
      bolehIsi: a.bolehIsi,
    });
  } catch (e) {
    const pesan = (e as Error).message;
    const hint = /lokasi_gangguan_temuan/.test(pesan) ? " — jalankan scripts/prediksi-lokasi-gangguan.sql di Supabase." : "";
    return NextResponse.json({ error: pesan + hint }, { status: 500 });
  }
}
