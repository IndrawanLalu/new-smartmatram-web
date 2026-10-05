import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { grupWa, kirimGrup } from "@/lib/wa/kirimGrup";

/**
 * WA temuan JTM berkategori URGENT — saat regu mengirim penilaian
 * (rencana-notif-temuan-jtm.md, B3). Dipanggil container `pekerja`:
 *
 *   POST /api/wa-notify-jtm   header x-webhook-secret: <CRON_SECRET>
 *   body { periksa_ids: string[] }   ← baris yang BARU menjadi Urgent
 *
 * Satu pesan per tiang (semua temuan urgentnya). Temuan pohon → grup
 * `perabasan` ULP, selain pohon → grup `jaringan`, sama dengan temuan inspeksi
 * lama. Kategori dicek ulang di sini: yang sudah bukan Urgent tidak dikirim.
 */

const ISIAN_POHON = new Set(["vegetasi", "jenis_pohon", "posisi_pohon"]);

interface Periksa {
  id: string;
  titik_id: string;
  item_kode: string;
  bagian: string;
  nilai: string | null;
  catatan: string | null;
  foto_url: string | null;
  kategori_temuan: string | null;
}

const waktu = () =>
  new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar", dateStyle: "full", timeStyle: "short" });

export async function POST(req: NextRequest) {
  if (req.headers.get("x-webhook-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { periksa_ids } = (await req.json().catch(() => ({}))) as { periksa_ids?: string[] };
  if (!Array.isArray(periksa_ids) || periksa_ids.length === 0) return NextResponse.json({ skipped: true });

  const { data: baris } = await supabaseAdmin
    .from("inspeksi_jtm_periksa")
    .select("id,titik_id,item_kode,bagian,nilai,catatan,foto_url,kategori_temuan")
    .in("id", periksa_ids.slice(0, 200));
  const urgent = ((baris ?? []) as Periksa[]).filter((p) => p.kategori_temuan === "Urgent");
  if (urgent.length === 0) return NextResponse.json({ skipped: true, reason: "tidak ada yang masih Urgent" });

  const idTitik = [...new Set(urgent.map((p) => p.titik_id))];
  const { data: titik } = await supabaseAdmin
    .from("inspeksi_jtm_titik")
    .select("id,tiang_id,inspeksi_id,inspeksi_jtm(ulp,penyulang,petugas_nama,status,segmen(nama)),tiang(kode,lat,lng)")
    .in("id", idTitik);

  const kodeItem = [...new Set(urgent.map((p) => p.item_kode))];
  const [{ data: item }, { data: opsi }] = await Promise.all([
    supabaseAdmin.from("jtm_item_ref").select("kode,nama").in("kode", kodeItem),
    supabaseAdmin.from("jtm_opsi_ref").select("item_kode,kode,label").in("item_kode", kodeItem),
  ]);
  const namaItem = new Map((item ?? []).map((i) => [i.kode as string, i.nama as string]));
  const labelOpsi = new Map((opsi ?? []).map((o) => [`${o.item_kode}|${o.kode}`, o.label as string]));

  const satu = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  let terkirim = 0;
  const lewat: string[] = [];

  for (const t of titik ?? []) {
    const insp = satu(t.inspeksi_jtm as unknown) as
      | { ulp: string; penyulang: string; petugas_nama: string | null; status: string; segmen: unknown }
      | null;
    const tiang = satu(t.tiang as unknown) as { kode: string; lat: number | null; lng: number | null } | null;
    if (!insp || insp.status === "Dibatalkan") continue;
    const segmen = (satu(insp.segmen) as { nama: string } | null)?.nama ?? "";

    // Nama tiang DI PENYULANG yang diinspeksi (batang bisa bernama lain di penyulang pemiliknya).
    const { data: nama } = await supabaseAdmin
      .from("tiang_kode_penyulang")
      .select("kode")
      .eq("tiang_id", t.tiang_id)
      .eq("penyulang", insp.penyulang)
      .maybeSingle();
    const namaTiang = (nama?.kode as string) ?? tiang?.kode ?? "—";

    const milik = urgent.filter((p) => p.titik_id === t.id);
    for (const pohon of [true, false]) {
      const daftar = milik.filter((p) => ISIAN_POHON.has(p.item_kode) === pohon);
      if (daftar.length === 0) continue;
      const kategori = pohon ? "perabasan" : "jaringan";
      const grup = await grupWa(kategori, insp.ulp);
      if (!grup) {
        lewat.push(`${namaTiang}: grup ${kategori} ${insp.ulp} belum diatur`);
        continue;
      }
      const baris = daftar.map((p) => {
        const isian = `${namaItem.get(p.item_kode) ?? p.item_kode}${p.bagian !== "-" ? ` (${p.bagian})` : ""}`;
        const keadaan = labelOpsi.get(`${p.item_kode}|${p.nilai}`) ?? p.nilai ?? "—";
        return `• ${isian}: *${keadaan}*${p.catatan ? ` — ${p.catatan}` : ""}`;
      });
      const peta = tiang?.lat != null && tiang?.lng != null ? `https://maps.google.com/?q=${tiang.lat},${tiang.lng}` : null;
      const pesan = [
        pohon ? `🚨🌳 *TEMUAN POHON JTM — URGENT*` : `🚨⚡ *TEMUAN JTM — URGENT*`,
        ``,
        `📅 *Waktu:* ${waktu()} WITA`,
        `🏢 *ULP:* ${insp.ulp}`,
        `⚡ *Penyulang:* ${insp.penyulang}`,
        `🗼 *Tiang:* ${namaTiang}${segmen ? ` · ${segmen}` : ""}`,
        `🔧 *Temuan:*`,
        ...baris,
        `👤 *Inspektor:* ${insp.petugas_nama ?? "-"}`,
        peta ? `📍 *Lokasi:* ${peta}` : null,
        ``,
        `⚠️ *Perlu tindakan segera oleh tim ${pohon ? "PERABASAN" : "Jaringan"}!*`,
        ``,
        `_SMART MATARAM — PLN UP3 Mataram_`,
      ].filter((x) => x !== null).join("\n");
      const foto = daftar.find((p) => p.foto_url)?.foto_url ?? undefined;
      if (await kirimGrup(grup, pesan, foto)) terkirim++;
    }
  }

  if (lewat.length) console.warn(`[wa-notify-jtm] dilewati: ${lewat.join("; ")}`);
  return NextResponse.json({ terkirim, dilewati: lewat });
}
