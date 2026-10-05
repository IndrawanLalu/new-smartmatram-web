import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { susunHasilJtr, type KabelJtr, type TiangJtrExcel } from "@/lib/jtrHasilExcel";

/**
 * Ekspor hasil inspeksi JTR per tiang — bentuknya sama dengan JTM
 * (lib/jtrHasilExcel.ts → lib/hasilInspeksiExcel.ts): satu baris satu tiang,
 * urut penyulang → gardu → jurusan → tiang, plus sheet Rekap Temuan.
 *
 * Penyaringan tanggal memakai `dikonfirmasi_at`, yaitu kapan tiang itu terakhir
 * dilihat orang di lapangan. `created_at` hanya cadangan untuk baris lama yang
 * belum punya penanda itu.
 */

const KOLOM =
  // Aksesoris ikut KABEL: tiang ber-underbuild memikul dua kabel dengan dua set
  // klem masing-masing. Ditulis satu literal — sambungan `+` mematikan
  // inferensi tipe supabase-js.
  "kode,gardu_kode,ulp,jurusan,lat,lng,jenis,tinggi,kondisi,jamperan,andongan,tarikan_sr,arde_kondisi,arde_nilai_ohm,stay_jenis,stay_kondisi,rawan_row,underbuild_tm,catatan_perbaikan,foto_temuan,dikonfirmasi_at,dikonfirmasi_oleh,created_at,tiang_konduktor";

type Konduktor = KabelJtr;

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

  // Milik + batang pinjaman, kabel milik gardu itu saja (`jtr_tiang_lengkap`).
  // SEMUA baris, berhalaman: PostgREST memulangkan paling banyak 1.000 baris
  // per permintaan — tanpa ini tiang ke-1.001 dst. hilang diam-diam.
  type Baris = Record<string, unknown> & { tiang_konduktor?: Konduktor[] | null };
  let data: Baris[];
  let gardu: { kode: string; ulp: string; nama: string | null; feeder: string | null }[];
  try {
    [data, gardu] = await Promise.all([
      fetchAllRows<Baris>(() => {
        let q = supabaseAdmin
          .from("jtr_tiang_lengkap")
          .select(KOLOM)
          .eq("status_hidup", "aktif");
        if (user.role !== "UP3" && user.unit) q = q.eq("ulp", user.unit);
        if (garduFilter) q = q.eq("gardu_kode", garduFilter);
        return q.order("dikonfirmasi_at", { ascending: false }).order("id").order("gardu_kode");
      }),
      // Penyulang tinggal di master gardu, bukan di tiang — diambil terpisah lalu
      // dipasangkan. Dulu tanpa halaman: dari 2.500-an gardu hanya 1.000 pertama
      // yang terbaca, dan tiang gardu sisanya keluar dengan penyulang KOSONG.
      fetchAllRows(() => supabaseAdmin.from("gardu").select("kode,ulp,nama,feeder").order("kode").order("ulp")),
    ]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const perKodeUlp = new Map(gardu.map((g) => [`${g.kode.toUpperCase()}|${(g.ulp ?? "").toUpperCase()}`, g]));
  // Cadangan: gardu yang di master tercatat di ULP lain (penyulang lintas ULP).
  const perKode = new Map(gardu.map((g) => [g.kode.toUpperCase(), g]));
  const petaGardu = {
    get: (kunci: string) => perKodeUlp.get(kunci) ?? perKode.get(kunci.split("|")[0]),
  };

  const baris = data.filter((t) => {
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

  // Pilihan yang BUKAN normal = temuan — daftar yang sama dengan yang dipakai HP.
  const { data: ref } = await supabaseAdmin.from("jtr_ref").select("kategori,kode,label,normal");
  const tidakNormal = new Set(
    (ref ?? []).filter((r) => r.normal === false).flatMap((r) => [
      `${r.kategori}|${String(r.kode ?? "").toUpperCase()}`,
      `${r.kategori}|${String(r.label ?? "").toUpperCase()}`,
    ]),
  );
  const adalahTemuan = (kategori: string, nilai: string | null | undefined) =>
    !!nilai && tidakNormal.has(`${kategori}|${nilai.toUpperCase()}`);

  const angkaAtauNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const tiang: TiangJtrExcel[] = baris
    .map((t) => {
      const g = petaGardu.get(`${String(t.gardu_kode).toUpperCase()}|${String(t.ulp).toUpperCase()}`);
      return {
        penyulang: g?.feeder ?? "",
        ulp: String(t.ulp ?? ""),
        gardu: String(t.gardu_kode ?? ""),
        garduNama: g?.nama ?? "",
        jurusan: String(t.jurusan ?? ""),
        kode: String(t.kode ?? ""),
        tanggal: (t.dikonfirmasi_at as string) ?? (t.created_at as string) ?? null,
        petugas: (t.dikonfirmasi_oleh as string) ?? null,
        jenis: (t.jenis as string) ?? null,
        tinggi: angkaAtauNull(t.tinggi),
        kondisi: (t.kondisi as string) ?? null,
        underbuildTm: !!t.underbuild_tm,
        jamperan: (t.jamperan as TiangJtrExcel["jamperan"] | null) ?? [],
        andongan: (t.andongan as string) ?? null,
        tarikanSr: angkaAtauNull(t.tarikan_sr),
        ardeKondisi: (t.arde_kondisi as string) ?? null,
        ardeOhm: angkaAtauNull(t.arde_nilai_ohm),
        stayJenis: (t.stay_jenis as string) ?? null,
        stayKondisi: (t.stay_kondisi as string) ?? null,
        rawanRow: (t.rawan_row as string[] | null) ?? [],
        catatan: (t.catatan_perbaikan as string) ?? null,
        fotoTemuan: (t.foto_temuan as Record<string, string | null> | null) ?? null,
        kabel: [...(t.tiang_konduktor ?? [])].sort((a, b) => a.nomor - b.nomor),
        lat: angkaAtauNull(t.lat),
        lng: angkaAtauNull(t.lng),
      };
    })
    .sort(
      (a, b) =>
        a.penyulang.localeCompare(b.penyulang) ||
        a.gardu.localeCompare(b.gardu, "id", { numeric: true }) ||
        a.jurusan.localeCompare(b.jurusan) ||
        a.kode.localeCompare(b.kode, "id", { numeric: true }),
    );

  const ulpJudul = user.role !== "UP3" && user.unit ? `ULP ${user.unit}` : "SEMUA ULP";
  const periode = tanggal
    ? new Date(`${tanggal}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : new Date(tahun, bulan - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const judul = [
    "HASIL INSPEKSI JTR",
    ulpJudul,
    penyulang ? `PENYULANG ${penyulang}` : null,
    garduFilter ? `GARDU ${garduFilter}` : null,
    periode,
  ].filter(Boolean).join(" — ");
  const wb = susunHasilJtr(tiang, adalahTemuan, judul);

  const buf = await wb.xlsx.writeBuffer();
  const nama = `Hasil_Inspeksi_JTR_${user.role !== "UP3" && user.unit ? user.unit : "SemuaULP"}_${
    tanggal || `${tahun}-${String(bulan).padStart(2, "0")}`
  }.xlsx`;

  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nama}"`,
    },
  });
}
