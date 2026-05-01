import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const AGENT_SECRET = process.env.AGENT_SECRET ?? "";
const OVERLOAD_PCT = 80;
const HIGH_TEMP_C  = 60;

const INSPEKSI_FIELDS = "id, penyulang, lokasi, temuan, status, category, tgl_inspeksi, nama_inspektor, eksekutor, ulp, koordinat, foto_sebelum_url, foto_sesudah_url";
const POHON_FIELDS    = "id, penyulang, lokasi, deskripsi, status, tingkat_risiko, tgl_inspeksi, nama_inspektor, eksekutor, ulp, koordinat, foto_sebelum_url, foto_sesudah_url";

// WITA = UTC+8
function witaDate(offsetDays = 0): string {
  const d = new Date(Date.now() + (8 + offsetDays * 24) * 3_600_000);
  return d.toISOString().slice(0, 10);
}

function auth(req: NextRequest): boolean {
  return !!AGENT_SECRET && req.headers.get("x-agent-secret") === AGENT_SECRET;
}

// ── Query handlers ────────────────────────────────────────────────────────────

async function queryGardu(q: string) {
  let qb = supabaseAdmin
    .from("gardu")
    .select("kode, nama, alamat, feeder, daya, status, lat, lng, beban_kva, beban_persen");
  if (q) qb = qb.or(`kode.ilike.%${q}%,nama.ilike.%${q}%,alamat.ilike.%${q}%`);
  const { data } = await qb.order("kode").limit(10);
  return NextResponse.json({ type: "gardu", total: data?.length ?? 0, results: data ?? [] });
}

async function queryInspeksiUrgent() {
  const [{ data: jaringan }, { data: pohon }] = await Promise.all([
    supabaseAdmin.from("inspeksi")
      .select(INSPEKSI_FIELDS)
      .eq("category", "Urgent")
      .not("status", "eq", "Selesai")
      .order("tgl_inspeksi", { ascending: false })
      .limit(20),
    supabaseAdmin.from("inspeksi_pohon")
      .select(POHON_FIELDS)
      .eq("tingkat_risiko", "Sangat Tinggi")
      .not("status", "eq", "Selesai")
      .order("tgl_inspeksi", { ascending: false })
      .limit(20),
  ]);
  return NextResponse.json({
    type: "inspeksi_urgent",
    total: (jaringan?.length ?? 0) + (pohon?.length ?? 0),
    jaringan: jaringan ?? [],
    pohon: pohon ?? [],
  });
}

async function queryInspeksiBelumDitugaskan() {
  const [{ data: jaringan }, { data: pohon }] = await Promise.all([
    supabaseAdmin.from("inspeksi")
      .select(INSPEKSI_FIELDS)
      .in("status", ["Temuan", "Perlu Tindakan"])
      .order("tgl_inspeksi", { ascending: false })
      .limit(20),
    supabaseAdmin.from("inspeksi_pohon")
      .select(POHON_FIELDS)
      .in("status", ["Temuan", "Perlu Tindakan"])
      .order("tgl_inspeksi", { ascending: false })
      .limit(20),
  ]);
  return NextResponse.json({
    type: "inspeksi_belum_ditugaskan",
    total: (jaringan?.length ?? 0) + (pohon?.length ?? 0),
    jaringan: jaringan ?? [],
    pohon: pohon ?? [],
  });
}

async function queryInspeksiBelumSelesai() {
  const [{ data: jaringan }, { data: pohon }] = await Promise.all([
    supabaseAdmin.from("inspeksi")
      .select(INSPEKSI_FIELDS)
      .in("status", ["Ditugaskan", "Dalam Proses"])
      .order("tgl_inspeksi", { ascending: false })
      .limit(20),
    supabaseAdmin.from("inspeksi_pohon")
      .select(POHON_FIELDS)
      .in("status", ["Ditugaskan", "Dalam Proses"])
      .order("tgl_inspeksi", { ascending: false })
      .limit(20),
  ]);
  return NextResponse.json({
    type: "inspeksi_belum_selesai",
    total: (jaringan?.length ?? 0) + (pohon?.length ?? 0),
    jaringan: jaringan ?? [],
    pohon: pohon ?? [],
  });
}

async function queryInspeksiSearch(params: URLSearchParams) {
  const jenis        = params.get("jenis") ?? "all";
  const status       = params.get("status") ?? "all";
  const tanggalDari  = params.get("tanggal_dari") ?? "";
  const tanggalSampai = params.get("tanggal_sampai") ?? "";
  const limit        = Math.min(parseInt(params.get("limit") ?? "10"), 20);

  const STATUS_VALUES = ["Temuan", "Perlu Tindakan", "Ditugaskan", "Dalam Proses", "Selesai"];

  function buildQuery(table: "inspeksi" | "inspeksi_pohon", fields: string) {
    let qb = supabaseAdmin.from(table).select(fields);
    if (status !== "all" && STATUS_VALUES.includes(status)) qb = qb.eq("status", status);
    if (tanggalDari)   qb = qb.gte("tgl_inspeksi", tanggalDari);
    if (tanggalSampai) qb = qb.lte("tgl_inspeksi", tanggalSampai);
    return qb.order("tgl_inspeksi", { ascending: false }).limit(limit);
  }

  const results: { jaringan?: unknown[]; pohon?: unknown[] } = {};

  if (jenis === "jaringan" || jenis === "all") {
    const { data } = await buildQuery("inspeksi", INSPEKSI_FIELDS);
    results.jaringan = data ?? [];
  }
  if (jenis === "pohon" || jenis === "all") {
    const { data } = await buildQuery("inspeksi_pohon", POHON_FIELDS);
    results.pohon = data ?? [];
  }

  const total = (results.jaringan?.length ?? 0) + (results.pohon?.length ?? 0);
  return NextResponse.json({ type: "inspeksi_search", total, ...results });
}

async function queryInspeksiDetail(id: string, jenis: string) {
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });

  const table  = jenis === "pohon" ? "inspeksi_pohon" : "inspeksi";
  const fields = jenis === "pohon" ? POHON_FIELDS : INSPEKSI_FIELDS;

  const { data, error } = await supabaseAdmin.from(table).select(fields).eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });

  return NextResponse.json({ type: "inspeksi_detail", data });
}

async function queryPengukuran(noGardu: string) {
  if (!noGardu) return NextResponse.json({ error: "no_gardu wajib diisi" }, { status: 400 });
  const { data } = await supabaseAdmin
    .from("pengukuran_gardu")
    .select("id, no_gardu, penyulang, tanggal_pengukuran, jam_pengukuran, persen_beban, beban_kva, kva_trafo, suhu_trafo, total_arus_r, total_arus_s, total_arus_t, total_arus_n, petugas_nama, petugas_unit, amg_sent_at, wo_sent_at")
    .ilike("no_gardu", `%${noGardu}%`)
    .order("tanggal_pengukuran", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  const results = data ?? [];
  const seen = new Set<string>();
  const latest = results.filter(r => {
    if (seen.has(r.no_gardu)) return false;
    seen.add(r.no_gardu);
    return true;
  });
  return NextResponse.json({ type: "pengukuran", total: latest.length, results: latest });
}

async function queryPengukuranAnomali() {
  const { data } = await supabaseAdmin
    .from("pengukuran_gardu")
    .select("id, no_gardu, penyulang, tanggal_pengukuran, persen_beban, suhu_trafo, kva_trafo, petugas_unit, amg_sent_at")
    .or(`persen_beban.gte.${OVERLOAD_PCT},suhu_trafo.gt.${HIGH_TEMP_C}`)
    .order("tanggal_pengukuran", { ascending: false })
    .limit(50);

  const seen = new Set<string>();
  const unique = (data ?? []).filter(r => {
    if (seen.has(r.no_gardu)) return false;
    seen.add(r.no_gardu);
    return true;
  });

  return NextResponse.json({
    type: "pengukuran_anomali",
    total: unique.length,
    overload: unique.filter(r => (r.persen_beban ?? 0) >= OVERLOAD_PCT),
    suhu_tinggi: unique.filter(r => (r.suhu_trafo ?? 0) > HIGH_TEMP_C),
  });
}

async function queryPengukuranBelumAmg() {
  const { data } = await supabaseAdmin
    .from("pengukuran_gardu")
    .select("id, no_gardu, penyulang, tanggal_pengukuran, persen_beban, suhu_trafo, petugas_unit")
    .is("amg_sent_at", null)
    .order("tanggal_pengukuran", { ascending: false })
    .limit(50);

  const seen = new Set<string>();
  const unique = (data ?? []).filter(r => {
    if (seen.has(r.no_gardu)) return false;
    seen.add(r.no_gardu);
    return true;
  });

  return NextResponse.json({ type: "pengukuran_belum_amg", total: unique.length, results: unique });
}

async function queryRekap(periode: string) {
  const today     = witaDate(0);
  const yesterday = witaDate(-1);
  const dayOfWeek = new Date(today).getDay();
  const weekStart = witaDate(-(dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const monthStart = today.slice(0, 7) + "-01";

  let startDate: string;
  let label: string;
  switch (periode) {
    case "kemarin":    startDate = yesterday;  label = "Kemarin";    break;
    case "minggu_ini": startDate = weekStart;  label = "Minggu Ini"; break;
    case "bulan_ini":  startDate = monthStart; label = "Bulan Ini";  break;
    default:           startDate = today;      label = "Hari Ini";   break;
  }

  const [{ data: insp }, { data: pohon }, { data: ukur }] = await Promise.all([
    supabaseAdmin.from("inspeksi").select("id, status, category").gte("created_at", startDate),
    supabaseAdmin.from("inspeksi_pohon").select("id, status, tingkat_risiko").gte("created_at", startDate),
    supabaseAdmin.from("pengukuran_gardu").select("id, no_gardu, persen_beban, suhu_trafo").gte("tanggal_pengukuran", startDate),
  ]);

  return NextResponse.json({
    type: "rekap",
    periode: label,
    inspeksi_jaringan: {
      total:   insp?.length ?? 0,
      urgent:  insp?.filter(i => i.category === "Urgent").length ?? 0,
      selesai: insp?.filter(i => i.status === "Selesai").length ?? 0,
    },
    inspeksi_pohon: {
      total:         pohon?.length ?? 0,
      sangat_tinggi: pohon?.filter(p => p.tingkat_risiko === "Sangat Tinggi").length ?? 0,
      selesai:       pohon?.filter(p => p.status === "Selesai").length ?? 0,
    },
    pengukuran: {
      total:       ukur?.length ?? 0,
      gardu_unik:  new Set(ukur?.map(u => u.no_gardu)).size,
      overload:    ukur?.filter(u => (u.persen_beban ?? 0) >= OVERLOAD_PCT).length ?? 0,
      suhu_tinggi: ukur?.filter(u => (u.suhu_trafo ?? 0) > HIGH_TEMP_C).length ?? 0,
    },
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type   = searchParams.get("type") ?? "";
  const q      = searchParams.get("q") ?? "";
  const periode = searchParams.get("periode") ?? "hari_ini";
  const id      = searchParams.get("id") ?? "";
  const jenis   = searchParams.get("jenis") ?? "jaringan";

  switch (type) {
    case "gardu":                     return queryGardu(q);
    case "pengukuran":                return queryPengukuran(q);
    case "inspeksi_urgent":           return queryInspeksiUrgent();
    case "inspeksi_belum_ditugaskan": return queryInspeksiBelumDitugaskan();
    case "inspeksi_belum_selesai":    return queryInspeksiBelumSelesai();
    case "inspeksi_search":           return queryInspeksiSearch(searchParams);
    case "inspeksi_detail":           return queryInspeksiDetail(id, jenis);
    case "pengukuran_anomali":        return queryPengukuranAnomali();
    case "pengukuran_belum_amg":      return queryPengukuranBelumAmg();
    case "rekap":                     return queryRekap(periode);
    default:
      return NextResponse.json({
        error: `Type '${type}' tidak dikenal`,
        pilihan: ["gardu", "pengukuran", "inspeksi_urgent", "inspeksi_belum_ditugaskan", "inspeksi_belum_selesai", "inspeksi_search", "inspeksi_detail", "pengukuran_anomali", "pengukuran_belum_amg", "rekap"],
      }, { status: 400 });
  }
}
