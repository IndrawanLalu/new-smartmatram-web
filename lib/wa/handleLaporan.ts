/**
 * Handler laporan "INFO REALTIME PENORMALAN GANGGUAN" masuk via WA.
 * Dipanggil app/api/wa-webhook saat pesan cocok signature (auto-deteksi, tanpa "#").
 * Simpan ke Supabase (gangguan_realtime) + append ke Google Sheet, lalu balas konfirmasi.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { parsePenormalan, type PenormalanData } from "@/lib/wa/parsePenormalan";
import { appendGangguanSheet } from "@/lib/wa/gangguanSheet";

interface WaMeta {
  from: string;
  messageId?: string;
}

function fmtTanggal(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function konfirmasi(id: number | string, d: PenormalanData): string {
  const lokasi = [d.up3 && `UP3 ${d.up3}`, d.ulp && `ULP ${d.ulp}`].filter(Boolean).join(" / ");
  const titik = [d.keypoint, d.penyulang && `Pyl. ${d.penyulang}`].filter(Boolean).join(" · ") || "—";
  const lines = [
    `✅ *Tersimpan* — ${d.jenis} #${id}`,
    `📍 ${titik}${lokasi ? ` (${lokasi})` : ""}`,
    `📅 ${fmtTanggal(d.tanggal)} · Padam ${d.waktu_padam ?? "—"} → Nyala ${d.waktu_nyala ?? "—"}` +
      (d.durasi_menit != null ? ` (${d.durasi_menit} mnt)` : ""),
  ];
  const detail = [
    d.beban_kw != null && `⚡ ${d.beban_kw} kW`,
    d.relay && `Relay ${d.relay}`,
    d.total_trip_tahun != null && `Trip: ${d.total_trip_tahun}×`,
  ].filter(Boolean).join(" · ");
  if (detail) lines.push(detail);
  lines.push("", "_SMART MATARAM — PLN UP3 Mataram_");
  return lines.join("\n");
}

/** Map data → object keyed by header sheet. Sesuaikan header di baris 1 GangguanRealtime. */
function toSheetRow(d: PenormalanData, meta: WaMeta): Record<string, string | number | null> {
  return {
    Tanggal: fmtTanggal(d.tanggal),
    Jenis: d.jenis,
    Judul: d.judul,
    "Section Padam": d.section_padam,
    Keypoint: d.keypoint,
    Penyulang: d.penyulang,
    UP3: d.up3,
    ULP: d.ulp,
    "Trafo/GI": d.trafo_gi,
    "Waktu Padam": d.waktu_padam,
    "Waktu Nyala": d.waktu_nyala,
    "Durasi (menit)": d.durasi_menit,
    Relay: d.relay,
    "Beban (kW)": d.beban_kw,
    "Arus R": d.arus_r,
    "Arus S": d.arus_s,
    "Arus T": d.arus_t,
    "Arus N": d.arus_n,
    "Total Trip": d.total_trip_tahun,
    "ENS (kWh)": d.ens_kwh,
    Penyebab: d.penyebab,
    Eksekusi: d.eksekusi,
    Cuaca: d.cuaca,
    Sumber: d.sumber,
    Pelapor: meta.from,
  };
}

export async function handlePenormalanReport(text: string, meta: WaMeta): Promise<string> {
  const { ok, data, errors } = parsePenormalan(text);
  if (!ok || !data) {
    return (
      "⚠️ *Laporan penormalan terdeteksi, tapi belum lengkap:*\n" +
      errors.map((e) => `• ${e}`).join("\n") +
      "\n\nPastikan format standar Dispatcher (Tanggal, Section Padam, Waktu Padam wajib ada)."
    );
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("gangguan_realtime")
    .insert({ ...data, wa_from: meta.from, wa_message_id: meta.messageId ?? null })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique violation → pesan yang sama sudah pernah dicatat
    if (error.code === "23505") {
      return `ℹ️ Laporan ini sudah tercatat sebelumnya (${data.keypoint ?? data.section_padam}, ${fmtTanggal(data.tanggal)} ${data.waktu_padam}).`;
    }
    console.error("[handleLaporan] insert error:", error.message);
    return "⚠️ Gagal menyimpan ke database. Coba lagi atau hubungi admin.";
  }

  // Best-effort: kegagalan sheet tidak membatalkan simpan DB
  const sheet = await appendGangguanSheet(toSheetRow(data, meta));
  if (!sheet.ok) console.error("[handleLaporan] sheet append gagal:", sheet.error);

  return konfirmasi(inserted.id, data);
}
