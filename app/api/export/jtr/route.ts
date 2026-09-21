import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/auth";
import ExcelJS from "exceljs";

/**
 * Ekspor hasil inspeksi JTR per tiang.
 *
 * Susunan kolomnya mengikuti formulir yang sudah dipakai regu, supaya berkas ini
 * bisa langsung dipakai orang yang terbiasa dengan bentuk lamanya — satu baris
 * satu tiang, bukan satu baris satu gardu.
 *
 * Penyaringan tanggal memakai `dikonfirmasi_at`, yaitu kapan tiang itu terakhir
 * dilihat orang di lapangan. `created_at` hanya cadangan untuk baris lama yang
 * belum punya penanda itu.
 */

const KOLOM =
  // Aksesoris ikut KABEL: tiang ber-underbuild memikul dua kabel dengan dua set
  // klem masing-masing. Ditulis satu literal — sambungan `+` mematikan
  // inferensi tipe supabase-js.
  "kode,gardu_kode,ulp,jurusan,lat,lng,jenis,tinggi,kondisi,jamperan,andongan,tarikan_sr,arde_kondisi,arde_nilai_ohm,stay_jenis,stay_kondisi,rawan_row,underbuild_tm,catatan_perbaikan,dikonfirmasi_at,dikonfirmasi_oleh,created_at,tiang_konduktor!tiang_konduktor_tiang_id_fkey(nomor,jenis,ukuran,kondisi,aks_suspension,aks_large_angle,aks_dead_end)";

interface Konduktor {
  nomor: number;
  jenis: string | null;
  ukuran: string | null;
  kondisi: string | null;
  aks_suspension: string | null;
  aks_large_angle: string | null;
  aks_dead_end: string | null;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const tanggal = sp.get("tanggal") ?? "";
  const tahun = Number(sp.get("tahun") ?? 0);
  const bulan = Number(sp.get("bulan") ?? 0);
  const penyulang = sp.get("penyulang") ?? "";
  const garduFilter = sp.get("gardu") ?? "";

  // Rentang waktu dihitung di server supaya klien tidak perlu tahu kolom mana
  // yang dipakai menyaring.
  let mulai: Date;
  let sampai: Date;
  if (tanggal) {
    mulai = new Date(`${tanggal}T00:00:00`);
    sampai = new Date(mulai);
    sampai.setDate(sampai.getDate() + 1);
  } else if (tahun && bulan) {
    mulai = new Date(tahun, bulan - 1, 1);
    sampai = new Date(tahun, bulan, 1);
  } else {
    return NextResponse.json({ error: "Periode tidak lengkap" }, { status: 400 });
  }

  let q = supabaseAdmin
    .from("tiang")
    .select(KOLOM)
    .eq("status_hidup", "aktif")
    .not("gardu_kode", "is", null)
    .order("dikonfirmasi_at", { ascending: false });

  if (user.role !== "UP3" && user.unit) q = q.eq("ulp", user.unit);
  if (garduFilter) q = q.eq("gardu_kode", garduFilter);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Penyulang tinggal di master gardu, bukan di tiang — diambil terpisah lalu
  // dipasangkan, supaya tidak ada dua tempat yang bisa berselisih.
  const { data: gardu } = await supabaseAdmin.from("gardu").select("kode,ulp,nama,feeder");
  const petaGardu = new Map(
    (gardu ?? []).map((g) => [`${g.kode.toUpperCase()}|${g.ulp.toUpperCase()}`, g]),
  );

  type Baris = Record<string, unknown> & { tiang_konduktor?: Konduktor[] | null };
  const baris = ((data ?? []) as unknown as Baris[]).filter((t) => {
    const iso = (t.dikonfirmasi_at as string) ?? (t.created_at as string);
    if (!iso) return false;
    const d = new Date(iso);
    if (d < mulai || d >= sampai) return false;
    if (penyulang) {
      const g = petaGardu.get(
        `${String(t.gardu_kode).toUpperCase()}|${String(t.ulp).toUpperCase()}`,
      );
      if ((g?.feeder ?? "") !== penyulang) return false;
    }
    return true;
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inspeksi JTR");

  ws.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Tanggal", key: "tanggal", width: 12 },
    { header: "ULP", key: "ulp", width: 14 },
    { header: "Penyulang", key: "penyulang", width: 16 },
    { header: "Gardu", key: "gardu", width: 10 },
    { header: "Nama Gardu", key: "nama_gardu", width: 26 },
    { header: "Jurusan", key: "jurusan", width: 8 },
    { header: "Tiang", key: "tiang", width: 16 },
    { header: "Jenis Tiang", key: "jenis", width: 11 },
    { header: "Tinggi (m)", key: "tinggi", width: 10 },
    { header: "Kondisi Tiang", key: "kondisi", width: 13 },
    { header: "Underbuild TM", key: "tm", width: 13 },
    { header: "Kabel 1", key: "k1", width: 22 },
    { header: "Kabel 2", key: "k2", width: 22 },
    { header: "Kabel 3", key: "k3", width: 22 },
    // Satu kolom per kabel, isinya suspension / large angle / dead end.
    // Sembilan kolom terpisah membuat lembarnya melebar tanpa terbaca.
    { header: "Aksesoris K1", key: "aks1", width: 22 },
    { header: "Aksesoris K2", key: "aks2", width: 22 },
    { header: "Aksesoris K3", key: "aks3", width: 22 },
    { header: "Jamperan", key: "jamperan", width: 20 },
    { header: "Andongan", key: "andongan", width: 11 },
    { header: "Tarikan SR", key: "sr", width: 10 },
    { header: "Arde", key: "arde", width: 11 },
    { header: "Nilai Arde (Ω)", key: "arde_ohm", width: 13 },
    { header: "Stay", key: "stay", width: 14 },
    { header: "Rawan ROW", key: "row", width: 18 },
    { header: "Catatan Perbaikan", key: "catatan", width: 38 },
    { header: "Petugas", key: "petugas", width: 18 },
    { header: "Koordinat", key: "koordinat", width: 24 },
    { header: "Peta", key: "peta", width: 30 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D3573" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const kabel = (list: Konduktor[] | null | undefined, n: number) => {
    const k = list?.find((x) => x.nomor === n);
    if (!k) return "";
    return [k.jenis, k.ukuran, k.kondisi && k.kondisi !== "Baik" ? `(${k.kondisi})` : ""]
      .filter(Boolean)
      .join(" ");
  };

  /** Aksesoris satu kabel: "Baik / Tidak Ada / Rusak" untuk ketiga klemnya. */
  const aks = (list: Konduktor[] | null | undefined, n: number) => {
    const k = list?.find((x) => x.nomor === n);
    if (!k) return "";
    return [k.aks_suspension, k.aks_large_angle, k.aks_dead_end]
      .map((v) => v ?? "")
      .join(" / ");
  };

  baris.forEach((t, i) => {
    const g = petaGardu.get(
      `${String(t.gardu_kode).toUpperCase()}|${String(t.ulp).toUpperCase()}`,
    );
    const iso = (t.dikonfirmasi_at as string) ?? (t.created_at as string);
    const jam = (t.jamperan as { jenis?: string; kondisi?: string }[] | null) ?? [];
    const lat = t.lat as number | null;
    const lng = t.lng as number | null;

    ws.addRow({
      no: i + 1,
      tanggal: iso ? new Date(iso).toLocaleDateString("id-ID") : "",
      ulp: t.ulp,
      penyulang: g?.feeder ?? "",
      gardu: t.gardu_kode,
      nama_gardu: g?.nama ?? "",
      jurusan: t.jurusan ?? "",
      tiang: t.kode,
      jenis: t.jenis ?? "",
      tinggi: t.tinggi ?? "",
      kondisi: t.kondisi ?? "",
      tm: t.underbuild_tm ? "Ya" : "",
      k1: kabel(t.tiang_konduktor, 1),
      k2: kabel(t.tiang_konduktor, 2),
      k3: kabel(t.tiang_konduktor, 3),
      aks1: aks(t.tiang_konduktor, 1),
      aks2: aks(t.tiang_konduktor, 2),
      aks3: aks(t.tiang_konduktor, 3),
      jamperan: jam.length ? `${jam[0].jenis ?? ""} · ${jam[0].kondisi ?? ""}` : "Tidak ada",
      andongan: t.andongan ?? "",
      sr: t.tarikan_sr ?? 0,
      arde: t.arde_kondisi ?? "",
      arde_ohm: t.arde_nilai_ohm ?? "",
      stay: t.stay_kondisi ?? "",
      row: ((t.rawan_row as string[] | null) ?? []).join(", "),
      catatan: t.catatan_perbaikan ?? "",
      petugas: t.dikonfirmasi_oleh ?? "",
      koordinat: lat !== null && lng !== null ? `${lat}, ${lng}` : "",
      peta: lat !== null && lng !== null ? `https://maps.google.com/?q=${lat},${lng}` : "",
    });
  });

  ws.autoFilter = { from: "A1", to: "AC1" };

  const buf = await wb.xlsx.writeBuffer();
  const nama = tanggal
    ? `inspeksi-jtr-${tanggal}.xlsx`
    : `inspeksi-jtr-${tahun}-${String(bulan).padStart(2, "0")}.xlsx`;

  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nama}"`,
    },
  });
}
