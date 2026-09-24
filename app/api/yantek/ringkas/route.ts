import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { ambilRentang } from "@/lib/yantekStore";
import {
  POSKO_MAP, extractNama, extractPrefix, durasiSah, median,
  type YantekRow,
} from "@/app/admin/yantek/_lib/yantek";

/**
 * Ringkasan Analisis Yantek untuk dashboard.
 *
 * Datanya ada di tabel `yantek_harian` (dulu berkas JSON di `data/yantek/`,
 * pindah 24 Sep 2026) — belasan ribu baris berisi ~45 kolom. Mengirim semuanya ke browser hanya untuk dijadikan enam angka jelas
 * pemborosan, dan `/api/yantek?all=true` memang sudah dihindari untuk alasan
 * yang sama. Jadi berkasnya dibaca di sisi server dan yang keluar hanya
 * ringkasannya — beberapa kilobyte.
 *
 * Perhitungannya memakai helper YANG SAMA dengan halaman Analisis Yantek
 * (`_lib/yantek.ts`), termasuk MEDIAN alih-alih rata-rata: durasi yantek
 * berekor panjang, jadi rata-rata sendirian memberi kesan yang salah. Dua
 * salinan rumus yang "seharusnya sama" adalah cara paling mudah menghasilkan
 * dua angka berbeda untuk hal yang sama.
 */

/** "44150" → "AMPENAN". Prefix menempel pada `personil_yantek`. */
const ULP_DARI_PREFIX = new Map(POSKO_MAP.map((p) => [p.kode, p.ulp]));

interface Harian { key: string; label: string; jumlah: number; rpt: number | null; rct: number | null }

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const ulp = (searchParams.get("ulp") ?? "").toUpperCase();
  const tr = Number(searchParams.get("tr")) || null;
  const tc = Number(searchParams.get("tc")) || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from/to harus YYYY-MM-DD" }, { status: 400 });
  }

  // Galat server dijawab 500, bukan ringkasan bernilai nol — nol yang dikarang
  // tidak bisa dibedakan dari hari tanpa gangguan (teknisaplikasi.md butir 6).
  let hari: { tanggal: string; rows: unknown[] }[];
  try {
    hari = await ambilRentang(supabase, from, to);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Data yantek gagal dibaca" },
      { status: 500 },
    );
  }

  const perHari: Harian[] = [];
  const perPetugas = new Map<string, { jumlah: number; lewat: number }>();
  const semuaRpt: number[] = [];
  const semuaRct: number[] = [];
  let total = 0;
  let lewatResponse = 0;
  let lewatRecovery = 0;
  let pelangganPadam = 0;
  let jumlahRating = 0;
  let totalRating = 0;
  let terakhir: string | null = null;

  const lewat = (v: number | null | undefined, target: number | null) =>
    target !== null && typeof v === "number" && Number.isFinite(v) && v > target;

  for (const h of hari) {
    let rows = h.rows as YantekRow[];

    if (ulp) {
      rows = rows.filter(
        (r) => ULP_DARI_PREFIX.get(extractPrefix(r.personil_yantek ?? "")) === ulp,
      );
    }
    if (rows.length === 0) continue;

    const tgl = h.tanggal;
    terakhir = tgl;
    total += rows.length;

    const rpt = durasiSah(rows, "durasi_menit_response");
    const rct = durasiSah(rows, "durasi_menit_recovery");
    semuaRpt.push(...rpt);
    semuaRct.push(...rct);

    perHari.push({
      key: tgl,
      label: String(Number(tgl.slice(8, 10))),
      jumlah: rows.length,
      // Hari tanpa durasi sah bernilai null, bukan 0 — nol berarti "ditangani
      // seketika", padahal yang benar "tidak ada data".
      rpt: rpt.length ? median(rpt) : null,
      rct: rct.length ? median(rct) : null,
    });

    for (const r of rows) {
      if (lewat(r.durasi_menit_response, tr)) lewatResponse += 1;
      if (lewat(r.durasi_menit_recovery, tc)) lewatRecovery += 1;
      pelangganPadam += Number(r.jml_pelanggan_padam ?? 0) || 0;

      const nilai = r.rating;
      if (nilai !== null && nilai !== undefined && Number.isFinite(Number(nilai))) {
        jumlahRating += 1;
        totalRating += Number(nilai);
      }

      const nama = extractNama(r.personil_yantek ?? "").trim() || "Tanpa nama";
      const e = perPetugas.get(nama) ?? { jumlah: 0, lewat: 0 };
      e.jumlah += 1;
      if (lewat(r.durasi_menit_response, tr) || lewat(r.durasi_menit_recovery, tc)) e.lewat += 1;
      perPetugas.set(nama, e);
    }
  }

  return NextResponse.json({
    total,
    rptMedian: semuaRpt.length ? median(semuaRpt) : null,
    rctMedian: semuaRct.length ? median(semuaRct) : null,
    lewatResponse,
    lewatRecovery,
    pelangganPadam,
    ratingRataRata: jumlahRating ? totalRating / jumlahRating : null,
    jumlahRating,
    terakhirData: terakhir,
    harian: perHari,
    topPetugas: [...perPetugas.entries()]
      .map(([nama, v]) => ({ nama, ...v }))
      .sort((a, b) => b.lewat - a.lewat || b.jumlah - a.jumlah)
      .slice(0, 6),
  });
}
