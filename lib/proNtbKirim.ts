import { supabaseAdmin } from "@/lib/supabase-admin";
import { bacaSheetPro, TAB_PRO_NTB, type TabProNtb } from "@/lib/proNtbSheet";
import { cekProNtb } from "@/lib/proNtbCek";
import { ambilBarisBulan, barisDariData } from "@/app/admin/kinerja-yantek/_lib/ambilProNtb";
import { bandingkan, muatanKirim, type BarisKirim } from "@/app/admin/kinerja-yantek/_lib/cekProNtb";
import { timBawaan } from "@/app/admin/kinerja-yantek/_lib/proNtb";

/**
 * Kirim ke spreadsheet PRO NTB lewat Apps Script (scripts/apps-script-pro-ntb.gs),
 * SATU TAB per panggilan (9 Nov 2026): semua tab sekaligus bisa melewati batas
 * 6 menit Google dan jawabannya tidak pernah sampai.
 *
 * Isi kiriman disusun DI SERVER dari `pro_ntb_baris` (WO + realisasi sebulan,
 * scripts/pro-ntb-baris.sql) — tombol dan Kirim otomatis mengirim hal yang sama.
 * NAMA TIM = bawaan (ketikan di layar Copy to PRO NTB tidak ikut).
 */

export type SumberKirim = "tombol" | "otomatis";

export interface HasilTab {
  ok: boolean;
  status: number;
  error?: string;
  hasil: { kode: string; aksi: string }[];
}

/** Versi skrip spreadsheet terendah yang dipakai: 4 = tulis blok + `lanjut`. */
const VERSI_MIN = 4;
/** Panggilan ulang per tab saat skrip menjawab `lanjut` (tiap panggilan ≤ 4,5 menit). */
const PUTARAN_MAKS = 6;
/** Baris hasil per catatan kiriman (pro_ntb_kirim_log) — cukup untuk menelusuri galat. */
const LOG_MAKS = 500;
const TIDAK_MENJAWAB = "Skrip spreadsheet tidak menjawab — bisa jadi masih berjalan. Tunggu ±5 menit lalu kirim ulang: baris yang sudah tertulis tampil sebagai \"Diperbarui\" (tidak dobel).";

export function rentangBulan(bulan: string) {
  const [y, m] = bulan.split("-").map(Number);
  const akhir = `${bulan}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const hari = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return { dari: `${bulan}-01`, sampai: hari < akhir ? hari : akhir };
}

type Muatan = { dari: string; sampai: string; muatan: BarisKirim[] };
/** 9 tab dikirim berurutan dalam beberapa menit — isi disusun sekali (±9 dtk). */
const SIMPAN_MS = 2 * 60 * 1000;
const simpanan = new Map<string, { pada: number; isi: Promise<Muatan> }>();

/** Isi kiriman sebulan satu ULP — semua tab. */
export function siapkanMuatan(ulp: string, bulan: string): Promise<Muatan> {
  const k = `${ulp}|${bulan}`;
  const ada = simpanan.get(k);
  if (ada && Date.now() - ada.pada < SIMPAN_MS) return ada.isi;
  const isi = susunMuatan(ulp, bulan);
  simpanan.set(k, { pada: Date.now(), isi });
  isi.catch(() => simpanan.delete(k));
  return isi;
}

async function susunMuatan(ulp: string, bulan: string): Promise<Muatan> {
  const { dari, sampai } = rentangBulan(bulan);
  const { data: s, error } = await supabaseAdmin.from("pro_ntb_sheet").select("spreadsheet_id").eq("ulp", ulp).maybeSingle();
  if (error) throw new Error(error.message);
  if (!s) throw new Error("Spreadsheet PRO NTB ULP ini belum diatur.");
  const [sheet, data] = await Promise.all([bacaSheetPro(s.spreadsheet_id, dari, sampai), ambilBarisBulan(supabaseAdmin, ulp, bulan)]);
  return { dari, sampai, muatan: muatanKirim(bandingkan(barisDariData(data), sheet).baris, timBawaan) };
}

async function panggilSkrip(url: string, isi: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(isi),
    redirect: "follow", // Apps Script membalas lewat 302
  });
  const teks = await res.text();
  let j: { ok?: boolean; versi?: number; lanjut?: boolean; error?: string; hasil?: { kode: string; aksi: string }[] };
  try { j = JSON.parse(teks); } catch { j = { ok: false, error: `Jawaban skrip bukan JSON (${res.status}) — periksa akses "Siapa saja" di deployment.` }; }
  return { res, j };
}

export async function kirimTab(o: {
  ulp: string; tab: TabProNtb; baris: BarisKirim[]; dari: string; sampai: string;
  coba: boolean; oleh: string | null; sumber: SumberKirim;
}): Promise<HasilTab> {
  // Jejak hanya baris yang BERUBAH / gagal / sisa — baris "ubah" tanpa sel
  // berubah (mayoritas kiriman harian) tidak disimpan, supaya log harian
  // otomatis 4 ULP tidak tumbuh ratusan MB setahun.
  const catat = (hasil: { aksi: string; berubah?: Record<string, unknown> }[] | null, galat: string | null) =>
    supabaseAdmin.from("pro_ntb_kirim_log").insert({
      ulp: o.ulp, tab: o.tab, sumber: o.sumber, coba: o.coba, dari: o.dari, sampai: o.sampai,
      jumlah: o.baris.length, oleh: o.oleh, galat,
      hasil: hasil?.filter((h) => h.aksi !== "ubah" || Object.keys(h.berubah ?? {}).length > 0).slice(0, LOG_MAKS) ?? null,
    });

  const { data: k, error } = await supabaseAdmin.from("pro_ntb_sheet_kunci").select("script_url,rahasia").eq("ulp", o.ulp).maybeSingle();
  if (error) throw new Error(error.message);
  if (!k?.script_url) return { ok: false, status: 400, error: "Skrip spreadsheet ULP ini belum dipasang (kunci + URL).", hasil: [] };

  const isi = { rahasia: k.rahasia, coba: o.coba, tab: o.tab, baris: o.baris, rentang: { dari: o.dari, sampai: o.sampai } };
  // Gabungan hasil semua putaran: putaran berikutnya hanya menggantikan baris
  // yang di putaran sebelumnya masih "sisa" (waktu habis).
  const gabung = new Map<string, { kode: string; aksi: string }>();
  for (let putaran = 1; ; putaran++) {
    let r: Awaited<ReturnType<typeof panggilSkrip>>;
    try {
      r = await panggilSkrip(k.script_url, isi);
    } catch (e) {
      await catat([...gabung.values()], `${TIDAK_MENJAWAB} (${(e as Error).message})`);
      return { ok: false, status: 504, error: TIDAK_MENJAWAB, hasil: [...gabung.values()] };
    }
    const { res, j } = r;
    // Skrip lama: v1 mengabaikan `tab` (mengosongkan baris SMART tab lain),
    // v2–3 menulis per baris tanpa `lanjut` (kiriman awal bulan > 6 menit).
    if (j.ok && (j.versi ?? 1) < VERSI_MIN) {
      const pesan = "Skrip spreadsheet masih versi lama — tempel ulang scripts/apps-script-pro-ntb.gs, lalu Terapkan → Kelola deployment → Edit → Versi baru.";
      await catat(j.hasil ?? null, pesan);
      return { ok: false, status: 502, error: pesan, hasil: j.hasil ?? [] };
    }
    for (const h of j.hasil ?? []) {
      const lama = gabung.get(h.kode);
      if (!lama || lama.aksi === "sisa") gabung.set(h.kode, h);
    }
    const ok = res.ok && j.ok !== false;
    if (!ok || o.coba || !j.lanjut || putaran >= PUTARAN_MAKS) {
      const hasil = [...gabung.values()];
      await catat(hasil, ok ? (j.lanjut ? `masih ada sisa sesudah ${putaran} putaran` : null) : j.error ?? "gagal");
      return { ok: ok && !j.lanjut, status: ok ? (j.lanjut ? 504 : 200) : res.ok ? 502 : res.status,
        error: ok ? (j.lanjut ? `Belum selesai sesudah ${putaran} putaran — kirim ulang untuk melanjutkan.` : undefined) : j.error, hasil };
    }
  }
}

/**
 * Satu putaran otomatis satu ULP & bulan: kirim tiap tab berurutan, lalu cek
 * ulang kolom PRO NTB. Tab yang gagal tidak menghentikan tab berikutnya.
 * Kembali: ringkasan satu baris.
 */
export async function kirimOtomatisBulan(ulp: string, bulan: string): Promise<string> {
  const { dari, sampai, muatan } = await siapkanMuatan(ulp, bulan);

  // Coba dulu satu tab (tidak menulis): skrip versi lama ditolak SEBELUM
  // menulis apa pun (v1 mengosongkan baris SMART di tab lain).
  const uji = await kirimTab({
    ulp, tab: TAB_PRO_NTB[0], baris: muatan.filter((b) => b.tab === TAB_PRO_NTB[0]), dari, sampai,
    coba: true, oleh: "otomatis", sumber: "otomatis",
  });
  if (!uji.ok) throw new Error(uji.error ?? "coba kirim gagal");

  let jumlah = 0;
  const gagal: string[] = [];
  // Semua tab, juga yang kosong: baris SMART yang dihapus di SMART ikut dikosongkan.
  for (const tab of TAB_PRO_NTB) {
    const baris = muatan.filter((b) => b.tab === tab);
    const r = await kirimTab({ ulp, tab, baris, dari, sampai, coba: false, oleh: "otomatis", sumber: "otomatis" });
    const n = r.hasil.filter((h) => h.aksi === "gagal").length;
    jumlah += baris.length;
    if (!r.ok) gagal.push(`${tab}: ${r.error ?? "gagal"}`);
    else if (n) gagal.push(`${tab}: ${n} baris gagal`);
  }
  await cekProNtb(ulp, bulan, "kirim", "otomatis").catch(() => null);
  return `${bulan}: ${jumlah} baris${gagal.length ? ` · ${gagal.join(" · ")}` : " · semua tab berhasil"}`;
}
