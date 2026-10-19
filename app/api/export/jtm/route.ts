import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { susunHasilJtm, type ItemJtm, type KondisiJtm, type TiangJtm } from "@/lib/jtmHasilExcel";

/**
 * Ekspor Hasil Inspeksi JTM: keadaan TERAKHIR tiap tiang, per penyulang
 * berurutan (lib/jtmHasilExcel.ts). Tiang yang belum dinilai ikut, supaya
 * daftar tiang satu penyulang utuh.
 *
 * Satu batang bisa punya nama di dua penyulang (underbuild / titik pertemuan):
 * ia muncul di keduanya, dengan nama, induk, dan isian per kabel milik
 * penyulang itu. Semua bacaan berhalaman — PostgREST memulangkan paling banyak
 * 1.000 baris per permintaan.
 */

const POTONG = 150;
const urutKode = (a: string, b: string) => a.localeCompare(b, "id", { numeric: true });

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const ulp = user.role === "UP3" ? (sp.get("ulp") ?? "").toUpperCase() : (user.unit ?? "").toUpperCase();
  const penyulang = sp.get("penyulang") ?? "";

  try {
    const [item, nama, batang, kondisi, anggota] = await Promise.all([
      fetchAllRows<ItemJtm & { urutan: number }>(() =>
        supabaseAdmin.from("jtm_item_ref").select("kode,nama,kelompok,satuan,urutan").eq("aktif", true).order("urutan").order("kode"),
      ),
      fetchAllRows<{ tiang_id: string; penyulang: string; ulp: string; kode: string; induk_id: string | null }>(() => {
        let q = supabaseAdmin.from("tiang_kode_penyulang").select("tiang_id,penyulang,ulp,kode,induk_id");
        if (ulp) q = q.eq("ulp", ulp);
        if (penyulang) q = q.eq("penyulang", penyulang);
        return q.order("tiang_id").order("penyulang");
      }),
      fetchAllRows<{ id: string; induk_id: string | null; nomor_lama: string | null; penanda: string | null; gardu_di_tiang: string | null; lat: number | null; lng: number | null; ulp: string }>(() => {
        let q = supabaseAdmin
          .from("tiang")
          .select("id,induk_id,nomor_lama,penanda,gardu_di_tiang,lat,lng,ulp")
          .eq("status_hidup", "aktif")
          .is("gardu_kode", null);
        if (ulp) q = q.eq("ulp", ulp);
        return q.order("id");
      }),
      fetchAllRows<KondisiJtm & { tiang_id: string; sirkit_segmen_id: string | null; sirkit_penyulang: string | null }>(() => {
        let q = supabaseAdmin
          .from("tiang_kondisi_terakhir")
          .select("tiang_id,item_kode,bagian,sirkit_segmen_id,sirkit_penyulang,nilai,nilai_label,nilai_angka,catatan,normal,foto_url,tgl,inspeksi_id");
        if (ulp) q = q.eq("ulp", ulp);
        return q.order("tiang_id").order("item_kode").order("bagian").order("sirkit_segmen_id");
      }),
      fetchAllRows<{ tiang_id: string; segmen: { nama: string; penyulang: string; status: string }[] | null }>(() =>
        supabaseAdmin.from("segmen_tiang").select("tiang_id,segmen(nama,penyulang,status)").order("segmen_id").order("tiang_id"),
      ),
    ]);

    // Kategori pilihan regu (view kecil `jtm_kategori_temuan`); belum ada = tanpa kategori.
    const kategori = await fetchAllRows<{ inspeksi_id: string; tiang_id: string; item_kode: string; bagian: string; sirkit_segmen_id: string | null; kategori_temuan: string }>(() =>
      supabaseAdmin.from("jtm_kategori_temuan").select("inspeksi_id,tiang_id,item_kode,bagian,sirkit_segmen_id,kategori_temuan")
        .order("inspeksi_id").order("tiang_id").order("item_kode").order("bagian"),
    ).catch(() => []);
    const kunciKat = (x: { inspeksi_id: string | null; tiang_id: string; item_kode: string; bagian: string | null; sirkit_segmen_id: string | null }) =>
      `${x.inspeksi_id}|${x.tiang_id}|${x.item_kode}|${x.bagian ?? "-"}|${x.sirkit_segmen_id ?? ""}`;
    const katPer = new Map(kategori.map((k) => [kunciKat(k), k.kategori_temuan]));

    const perBatang = new Map(batang.map((t) => [t.id, t]));
    const namaDi = new Map(nama.map((n) => [`${n.tiang_id}|${n.penyulang}`, n.kode]));
    const kondisiPer = new Map<string, typeof kondisi>();
    for (const k of kondisi) kondisiPer.set(k.tiang_id, [...(kondisiPer.get(k.tiang_id) ?? []), k]);
    const segmenDi = new Map<string, string[]>();
    for (const a of anggota) {
      // Diketik larik oleh supabase-js, datang sebagai objek (banyak-ke-satu).
      const sg = a.segmen as unknown;
      const s = (Array.isArray(sg) ? sg[0] : sg) as { nama: string; penyulang: string; status: string } | null;
      if (!s || s.status !== "aktif") continue;
      const k = `${a.tiang_id}|${s.penyulang}`;
      segmenDi.set(k, [...(segmenDi.get(k) ?? []), s.nama]);
    }

    // Petugas & status dari inspeksi asal keadaan terakhirnya.
    const idInspeksi = [...new Set(kondisi.map((k) => k.inspeksi_id).filter((x): x is string => !!x))];
    const inspeksi = new Map<string, { petugas_nama: string | null; status: string | null }>();
    for (let i = 0; i < idInspeksi.length; i += POTONG) {
      const { data } = await supabaseAdmin
        .from("inspeksi_jtm")
        .select("id,petugas_nama,status")
        .in("id", idInspeksi.slice(i, i + POTONG));
      for (const r of data ?? []) inspeksi.set(r.id as string, r as { petugas_nama: string | null; status: string | null });
    }

    /** Induk di penyulang itu: yang diatur khusus, kalau tidak naik lewat batang
     *  sampai tiang yang bernama di penyulang ini (sama dengan penamaan). */
    const induk = (n: (typeof nama)[number]) => {
      if (n.induk_id) return namaDi.get(`${n.induk_id}|${n.penyulang}`) ?? null;
      let naik = perBatang.get(n.tiang_id)?.induk_id ?? null;
      for (let langkah = 0; naik && langkah < 500; langkah++) {
        const k = namaDi.get(`${naik}|${n.penyulang}`);
        if (k) return k;
        naik = perBatang.get(naik)?.induk_id ?? null;
      }
      return null;
    };

    const tiang: TiangJtm[] = nama
      .filter((n) => perBatang.has(n.tiang_id))
      .map((n) => {
        const b = perBatang.get(n.tiang_id)!;
        const ks = (kondisiPer.get(n.tiang_id) ?? []).filter((k) => !k.sirkit_penyulang || k.sirkit_penyulang === n.penyulang);
        const terakhir = ks.reduce<(typeof ks)[number] | null>((m, k) => (k.tgl && (!m || (m.tgl ?? "") < k.tgl) ? k : m), null);
        const insp = terakhir?.inspeksi_id ? inspeksi.get(terakhir.inspeksi_id) : undefined;
        return {
          penyulang: n.penyulang,
          ulp: n.ulp,
          kode: n.kode,
          segmen: (segmenDi.get(`${n.tiang_id}|${n.penyulang}`) ?? []).join(", "),
          nomorLama: b.nomor_lama,
          induk: induk(n),
          penanda: b.penanda,
          garduKode: b.penanda === "gardu" ? b.gardu_di_tiang : null,
          lat: b.lat === null ? null : Number(b.lat),
          lng: b.lng === null ? null : Number(b.lng),
          petugas: insp?.petugas_nama ?? null,
          statusInspeksi: insp?.status ?? null,
          kondisi: ks.map((k) => ({
            ...k,
            bagian: k.bagian ?? "-",
            nilai_angka: k.nilai_angka === null ? null : Number(k.nilai_angka),
            kategori: katPer.get(kunciKat(k)) ?? null,
          })),
        };
      })
      .sort((a, b) => a.penyulang.localeCompare(b.penyulang) || urutKode(a.kode, b.kode));

    if (tiang.length === 0) {
      return NextResponse.json({ error: "Belum ada tiang JTM untuk pilihan ini." }, { status: 404 });
    }

    const hariIni = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const judul = [
      "HASIL INSPEKSI JTM",
      ulp ? `ULP ${ulp}` : "SEMUA ULP",
      penyulang ? `PENYULANG ${penyulang}` : "SEMUA PENYULANG",
      `keadaan terakhir per ${new Date(hariIni).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
    ].join(" — ");
    const wb = susunHasilJtm(tiang, item, judul);
    const buf = await wb.xlsx.writeBuffer();
    const berkas = `Hasil_Inspeksi_JTM_${ulp || "SemuaULP"}_${(penyulang || "SemuaPenyulang").replace(/[^A-Za-z0-9]+/g, "_")}_${hariIni}.xlsx`;

    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${berkas}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
