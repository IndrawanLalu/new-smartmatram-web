/**
 * Pembaca file Excel "DAFTAR DETAIL REKAPITULASI GANGGUAN ALL" dari APKT.
 *
 * Tujuannya: file hasil unduh APKT bisa langsung diunggah apa adanya — tanpa
 * pengguna perlu menghapus kop, mengganti judul kolom, atau mengubah format
 * waktu. Karena itu kolom dicari lewat NAMA judulnya, bukan lewat posisi:
 * ekspor APKT sesekali menggeser/menambah kolom, dan mematok indeks kolom
 * berarti diam-diam salah baca saat itu terjadi.
 *
 * Hanya dipakai di server (route handler) — exceljs tidak boleh masuk bundel
 * klien.
 */

import ExcelJS from "exceljs";
import {
  dedupNoLaporan,
  parseNum,
  parseTglLapor,
  ulpDariPosko,
} from "@/lib/apktGangguan";

/** Judul kolom Excel (huruf besar, spasi rapat) → kolom DB. */
const KOLOM: Record<string, string> = {
  "POSKO": "nama_posko",
  "NO LAPOR": "no_laporan",
  "NO LAPORAN": "no_laporan",
  "TGL/JAM LAPOR": "waktu_lapor",
  "TGL/JAM DATANG": "waktu_response",
  "TGL/JAM NYALA": "waktu_recovery",
  "DURASI RESPONSE TIME": "durasi_response_time",
  "DURASI RECOVERY TIME": "durasi_recovery_time",
  "DURASI PENUGASAN REGU": "durasi_dispatch_time",
  "DURASI PERJALANAN REGU": "durasi_perjalanan_time",
  "JARAK CLOSING (M)": "jarak_closing",
  "JARAK CLOSING": "jarak_closing",
  "DISPATCH OLEH": "dispatch_oleh",
  "IDPEL/NO METER": "idpel_nometer",
  "NAMA PELAPOR": "nama_pelapor",
  "ALAMAT PELAPOR": "alamat_pelapor",
  "NO TELP PELAPOR": "no_telp_pelapor",
  "KETERANGAN PELAPOR": "keterangan_pelapor",
  "SUMBER LAPOR": "media",
  "DISELESAIKAN OLEH": "diselesaikan_oleh",
  "STATUS": "status_akhir",
  "REFERENSI MARKING": "referensi_marking",
  "KODE GANGGUAN": "kode_gangguan",
  "JENIS GANGGUAN": "jenis_gangguan",
  "PENYEBAB": "penyebab",
  "TINDAKAN": "tindakan",
  "KETERANGAN BATAL": "ket_batal",
  "BATAL OLEH": "batal_by",
  "KETERANGAN MARKING": "ket_marking",
};

/** Kolom durasi memakai format "hari - jam : menit : detik", bukan angka. */
const KOLOM_DURASI = new Set([
  "durasi_response_time",
  "durasi_recovery_time",
  "durasi_dispatch_time",
  "durasi_perjalanan_time",
]);

/**
 * Kolom yang TIDAK ada di Excel sengaja tidak ikut ditulis.
 *
 * `pembuat_laporan` dan `is_marking` hanya ada di payload GraphQL. Kalau
 * keduanya dikirim bernilai null, unggah Excel akan mengosongkan data yang
 * sudah benar dari tarikan JSON sebelumnya.
 */
const KOLOM_DB = [
  ...new Set(Object.values(KOLOM)),
  "ulp",
  "tgl_lapor",
  "synced_at",
];

const rapatkan = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

/** "0 - 1 : 26 : 18" (hari - jam : menit : detik) → 5178 detik. "-" → null. */
export function parseDurasi(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s || s === "-") return null;
  const hari = s.match(/^(\d+)\s*-\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)$/);
  if (hari) return +hari[1] * 86400 + +hari[2] * 3600 + +hari[3] * 60 + +hari[4];
  const jam = s.match(/^(\d+)\s*:\s*(\d+)\s*:\s*(\d+)$/);
  if (jam) return +jam[1] * 3600 + +jam[2] * 60 + +jam[3];
  return parseNum(s);
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Nilai sel kolom waktu → "DD/MM/YYYY HH:mm:ss".
 *
 * Ekspor APKT menulis waktu sebagai teks, tapi Excel bisa saja mengenalinya
 * sebagai tanggal sungguhan (mis. bila file pernah dibuka & disimpan ulang).
 * Keduanya harus keluar dalam bentuk yang sama karena `parseTglLapor` dan
 * tampilan tabel membacanya sebagai teks.
 */
function teksWaktu(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v instanceof Date) {
    // exceljs menyimpan tanggal Excel sebagai UTC; baca dengan getter UTC
    // supaya tidak bergeser sejam di zona waktu WITA.
    return (
      `${p2(v.getUTCDate())}/${p2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()} ` +
      `${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}:${p2(v.getUTCSeconds())}`
    );
  }
  const s = cell.text?.trim() ?? "";
  return s === "" || s === "-" ? null : s;
}

export interface HasilBacaExcel {
  rows: Record<string, unknown>[];
  /** Baris "PERIODE TANGGAL : ..." di kop, kalau ada — untuk ditampilkan lagi. */
  periode: string | null;
  /** Rentang tgl_lapor yang benar-benar ada di file. */
  dari: string | null;
  sampai: string | null;
  /** Baris dengan nomor laporan ganda di dalam satu file. */
  ganda: number;
  error: string | null;
}

const KOSONG: HasilBacaExcel = {
  rows: [],
  periode: null,
  dari: null,
  sampai: null,
  ganda: 0,
  error: null,
};

export async function bacaExcelApkt(buf: ArrayBuffer): Promise<HasilBacaExcel> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    return { ...KOSONG, error: "File tidak terbaca sebagai Excel (.xlsx)." };
  }

  const ws = wb.worksheets[0];
  if (!ws) return { ...KOSONG, error: "File Excel tidak punya sheet." };

  // Cari baris judul kolom. Di atasnya ada kop PLN, judul, dan periode yang
  // jumlah barisnya bisa berubah antar-ekspor.
  let barisJudul = 0;
  const petaKolom = new Map<number, string>();
  for (let r = 1; r <= Math.min(30, ws.rowCount); r++) {
    const isi = new Map<number, string>();
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const db = KOLOM[rapatkan(cell.text ?? "")];
      if (db) isi.set(col, db);
    });
    if ([...isi.values()].includes("no_laporan")) {
      barisJudul = r;
      isi.forEach((db, col) => petaKolom.set(col, db));
      break;
    }
  }
  if (!barisJudul) {
    return {
      ...KOSONG,
      error:
        'Judul kolom "NO LAPOR" tidak ditemukan. Pastikan ini file "Detail Rekapitulasi Gangguan" dari APKT, bukan file lain.',
    };
  }

  // Periode di kop — dicari di baris mana pun di atas judul kolom.
  let periode: string | null = null;
  for (let r = 1; r < barisJudul && !periode; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const t = cell.text?.trim() ?? "";
      if (!periode && /PERIODE\s+TANGGAL/i.test(t)) periode = t;
    });
  }

  const stempel = new Date().toISOString();
  const mentah: Record<string, unknown>[] = [];

  for (let r = barisJudul + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const out: Record<string, unknown> = {};
    for (const k of KOLOM_DB) out[k] = null;

    for (const [col, db] of petaKolom) {
      const cell = row.getCell(col);
      if (KOLOM_DURASI.has(db)) out[db] = parseDurasi(cell.text);
      else if (db === "jarak_closing") out[db] = parseNum(cell.text?.trim());
      else if (db.startsWith("waktu_")) out[db] = teksWaktu(cell);
      else {
        const s = cell.text?.trim() ?? "";
        out[db] = s === "" ? null : s;
      }
    }

    // Baris tanpa nomor laporan = baris kosong atau footer, bukan data.
    if (!out.no_laporan) continue;

    out.tgl_lapor = parseTglLapor(out.waktu_lapor);
    out.ulp = ulpDariPosko(out.nama_posko);
    out.synced_at = stempel;
    mentah.push(out);
  }

  if (mentah.length === 0) {
    return {
      ...KOSONG,
      periode,
      error: "Judul kolom terbaca, tapi tidak ada satu pun baris laporan di file ini.",
    };
  }

  const rows = dedupNoLaporan(mentah);
  const tgl = rows
    .map((r) => r.tgl_lapor)
    .filter((t): t is string => typeof t === "string")
    .sort();

  return {
    rows,
    periode,
    dari: tgl[0] ?? null,
    sampai: tgl[tgl.length - 1] ?? null,
    ganda: mentah.length - rows.length,
    error: null,
  };
}
