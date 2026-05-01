import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const AMG_BASE = process.env.AMG_URL ?? "http://10.33.1.77/gardu";
const AMG_USER = process.env.AMG_USERNAME ?? "";
const AMG_PASS = process.env.AMG_PASSWORD ?? "";

const KODE_PREFIX = process.env.AMG_KODE_PREFIX ?? "44150"; // ULP AMPENAN

// YYYY-MM-DD → DD-MM-YYYY
function toAmgDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

// i_nominal = kVA * 1000 / (√3 * 400V)
function calcINominal(kva: number): string {
  return ((kva * 1000) / (Math.sqrt(3) * 400)).toFixed(2);
}

function calcUnbalance(r: number, s: number, t: number): string {
  const avg = (r + s + t) / 3;
  if (avg === 0) return "0";
  const sumDev = Math.abs(r - avg) + Math.abs(s - avg) + Math.abs(t - avg);
  return ((sumDev / (3 * avg)) * 100).toFixed(2);
}

function buildBody(row: Record<string, unknown>): URLSearchParams {
  const perjurusan = (row.perjurusan ?? {}) as Record<string, {
    arus: { R: number; S: number; T: number; N: number };
    tegangan: { R: number; S: number; T: number };
  }>;

  const f: Record<string, string> = {
    kode:               KODE_PREFIX + String(row.no_gardu ?? ""),
    i_nominal:          calcINominal(Number(row.kva_trafo ?? 0)),
    daya_trafo:         String(row.kva_trafo ?? 0),
    mode:               "input",
    tglcatat:           toAmgDate(String(row.tanggal_pengukuran ?? "")),
    jam:                String(row.jam_pengukuran ?? "00:00:00"),

    // Sekunder (total semua jurusan)
    arus_r_sekunder:    String(row.total_arus_r ?? 0),
    teg_rs_sekunder:    String(row.total_teg_rs ?? 0),
    teg_rn_sekunder:    String(row.total_teg_rn ?? 0),
    arus_s_sekunder:    String(row.total_arus_s ?? 0),
    teg_rt_sekunder:    String(row.total_teg_rt ?? 0),
    teg_sn_sekunder:    String(row.total_teg_sn ?? 0),
    arus_t_sekunder:    String(row.total_arus_t ?? 0),
    teg_st_sekunder:    String(row.total_teg_st ?? 0),
    teg_tn_sekunder:    String(row.total_teg_tn ?? 0),
    arus_n_sekunder:    String(row.total_arus_n ?? 0),

    // PJU — tidak direkam di Smart Mataram, kirim 0
    arus_r_pju:         "0",
    arus_s_pju:         "0",
    arus_t_pju:         "0",

    // Unbalance: (|R-avg| + |S-avg| + |T-avg|) / (3 × avg) × 100
    arus_unbalance:     calcUnbalance(
      Number(row.total_arus_r ?? 0),
      Number(row.total_arus_s ?? 0),
      Number(row.total_arus_t ?? 0),
    ),

    beban_total:        String(row.beban_kva ?? 0),
    beban_total_persen: String(row.persen_beban ?? 0),
    temperatur:         String(row.suhu_trafo ?? 0),
    keterangan:         String(row.petugas_nama ?? ""),
    submit:             "Simpan",
  };

  // Per jurusan A→a, B→b, C→c, D→d, K→k
  for (const [key, suffix] of [["A","a"],["B","b"],["C","c"],["D","d"],["K","k"]]) {
    const jur = perjurusan[key];
    f[`arusphasa_r_${suffix}`] = String(jur?.arus?.R ?? "");
    f[`tegujung_r_${suffix}`]  = String(jur?.tegangan?.R ?? "");
    f[`arusphasa_s_${suffix}`] = String(jur?.arus?.S ?? "");
    f[`tegujung_s_${suffix}`]  = String(jur?.tegangan?.S ?? "");
    f[`arusphasa_t_${suffix}`] = String(jur?.arus?.T ?? "");
    f[`tegujung_t_${suffix}`]  = String(jur?.tegangan?.T ?? "");
    f[`arusphasa_n_${suffix}`] = String(jur?.arus?.N ?? "");
  }

  return new URLSearchParams(f);
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function loginAmg(): Promise<string> {
  const res = await fetch(`${AMG_BASE}/index.php/cLogin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": BROWSER_UA,
      "Origin": "http://10.33.1.77",
      "Referer": `${AMG_BASE}/index.php/cLogin`,
    },
    body: new URLSearchParams({ username: AMG_USER, password: AMG_PASS, submit: "Log In" }),
    redirect: "manual",
  });

  const raw = res.headers.get("set-cookie") ?? "";
  // AMG set beberapa ci_session bertahap — ambil yang terakhir (sudah fully authenticated)
  const allMatches = [...raw.matchAll(/ci_session=([^;]+)/g)];
  if (!allMatches.length) throw new Error("Login AMG gagal — periksa AMG_USERNAME / AMG_PASSWORD di .env.local");
  return `ci_session=${allMatches[allMatches.length - 1][1]}`;
}

export async function POST(req: NextRequest) {
  const { pengukuranId } = await req.json() as { pengukuranId: string };

  if (!pengukuranId) {
    return NextResponse.json({ error: "pengukuranId wajib diisi" }, { status: 400 });
  }
  if (!AMG_USER || !AMG_PASS) {
    return NextResponse.json({ error: "Konfigurasi AMG belum lengkap di server. Tambahkan AMG_USERNAME dan AMG_PASSWORD di .env.local VPS, lalu restart PM2." }, { status: 500 });
  }

  // 1. Ambil data dari Supabase
  const { data: row, error: dbErr } = await supabaseAdmin
    .from("pengukuran_gardu")
    .select("*")
    .eq("id", pengukuranId)
    .single();

  if (dbErr || !row) {
    return NextResponse.json({ error: "Data pengukuran tidak ditemukan" }, { status: 404 });
  }

  // 2. Login ke AMG — fresh setiap request (CI regenerasi session ID tiap request)
  let sessionCookie: string;
  try {
    sessionCookie = await loginAmg();
  } catch (e) {
    const msg = String(e);
    const isNetwork = msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("EHOSTUNREACH");
    return NextResponse.json({
      error: isNetwork
        ? "Server tidak bisa menjangkau AMG (10.33.1.77). Fitur ini hanya berfungsi jika server berada di jaringan intranet PLN."
        : msg,
    }, { status: isNetwork ? 503 : 401 });
  }

  // 3. POST data ke cUkur/ (form save_ukur di cGardu submit ke cUkur controller)
  let saveRes: Response;
  try {
    saveRes = await fetch(`${AMG_BASE}/index.php/cUkur/save_ukur`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": BROWSER_UA,
        "Cookie": sessionCookie,
        "Referer": `${AMG_BASE}/index.php/cUkur/save_ukur`,
      },
      body: buildBody(row as Record<string, unknown>),
      redirect: "manual",
    });
  } catch (e) {
    const msg = String(e);
    const hint = msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("EHOSTUNREACH")
      ? " — Pastikan server bisa mengakses jaringan intranet PLN (10.33.1.77)."
      : "";
    return NextResponse.json({ error: "Gagal kirim ke AMG: " + msg + hint }, { status: 503 });
  }

  // Pastikan bukan redirect ke halaman login (session ditolak)
  const redirectTo = saveRes.headers.get("location") ?? "";
  if (redirectTo.toLowerCase().includes("login")) {
    return NextResponse.json({ error: "AMG menolak session — coba kirim ulang" }, { status: 401 });
  }
  if (saveRes.status !== 200 && saveRes.status !== 302 && saveRes.status !== 301) {
    return NextResponse.json({ error: `AMG error (HTTP ${saveRes.status})` }, { status: 502 });
  }

  // 4. Update amg_sent_at di Supabase
  await supabaseAdmin
    .from("pengukuran_gardu")
    .update({ amg_sent_at: new Date().toISOString() })
    .eq("id", pengukuranId);

  return NextResponse.json({ ok: true });
}
