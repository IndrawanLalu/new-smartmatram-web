/**
 * Keterangan WO tunggakan (keputusan user 29 Okt 2026, scripts/wo-tunggakan.sql).
 * WO yang belum selesai dibawa ke bulan berikutnya; realisasi dihitung di bulan
 * dikerjakan, jadi angka bulan WO tidak berubah. Kata di layar disepakati user:
 *   tunggakan   → "WO September belum dikerjakan" (+ " · masuk WO Oktober")
 *   susulan     → "Selesai di Oktober" (di WO bulan lalu)
 */

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "September" — beda tahun dari acuan ikut ditulis ("Desember 2026"). */
function namaBulanDari(tgl: string, tahunAcuan: number) {
  const [t, b] = tgl.slice(0, 7).split("-").map(Number);
  return `${NAMA_BULAN[b - 1]}${t !== tahunAcuan ? ` ${t}` : ""}`;
}

/** Keterangan baris WO bulan lalu yang tampil di WO bulan acuan. */
export function ketTunggakan(tglWo: string, acuan: { tahun: number; bulan: number }, selesai: boolean, diWoIni: boolean) {
  return `WO ${namaBulanDari(tglWo, acuan.tahun)}${selesai ? "" : " belum dikerjakan"}${diWoIni ? ` · masuk WO ${NAMA_BULAN[acuan.bulan - 1]}` : ""}`;
}

/** Keterangan baris WO yang dikerjakan susulan sesudah bulan WO-nya. */
export function ketSusulan(tglSusulan: string, tahunWo: number) {
  return `Selesai di ${namaBulanDari(tglSusulan, tahunWo)}`;
}
