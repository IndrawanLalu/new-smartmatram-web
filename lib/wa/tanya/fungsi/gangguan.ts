import { fetchSheetData } from "@/lib/sheets";
import { parseTanggalToISO } from "@/lib/gangguanAnalytics";
import { normalizeFeeder } from "@/lib/feeder";
import type { FungsiTanya } from "./jenis";

/**
 * Gangguan penyulang dari Google Sheets `gangguanPenyulang` — sumber yang sama
 * dengan Beranda, Command Center, dan Morning Brief. Satu baris = satu trip;
 * "semua ULP" = baris yang ULP-nya salah satu ULP UP3 Mataram (isi sheet).
 */

interface Kejadian {
  tgl: string;
  ulp: string;
  penyulang: string;
  keypoint: string;
  jam: string;
  indikator: string;
  detik: number;
  penyebab: string;
}

const BATAS = 10;
const tgl = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};
/** "0:34:00" → detik. */
const keDetik = (t: string) => {
  const p = t.split(".")[0].split(":").map((x) => parseInt(x) || 0);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
};
const lama = (detik: number) => {
  const m = Math.round(detik / 60);
  return m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} m` : `${m} mnt`;
};

function hitung<T>(rows: T[], kunci: (r: T) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(kunci(r), (m.get(kunci(r)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

export const gangguan: FungsiTanya = {
  kode: "gangguan",
  nama: "Gangguan penyulang",
  saringan: ["ulp", "periode", "penyulang"],
  kata: [["gangguan", 2], ["padam", 2], ["trip", 2], ["autoreclose", 2], ["auto reclose", 2], ["ar", 1], ["mati lampu", 2], ["kedip", 1]],
  contoh: ["@smart gangguan penyulang bulan ini", "@smart gangguan ampenan minggu ini", "@smart padam penyulang cemara bulan lalu"],
  async jalankan({ saringan: s }) {
    const p = s.periode!;
    const mau = s.penyulang ? normalizeFeeder(s.penyulang) : null;
    const rows: Kejadian[] = (await fetchSheetData("gangguanPenyulang", "A:S"))
      .map((r) => ({
        tgl: parseTanggalToISO(r.TANGGAL) ?? "",
        ulp: (r.ULP ?? "").trim().toUpperCase(),
        penyulang: (r.PENYULANG ?? "").trim(),
        keypoint: (r.PENYULANG_GANGGUAN ?? "").trim(),
        jam: (r["JAM PADAM"] ?? "").trim(),
        indikator: (r.INDIKATOR ?? "").trim() || "Lainnya",
        detik: keDetik(r.DURASI ?? ""),
        penyebab: (r["PENYEBAB GANGGUAN"] ?? "").trim(),
      }))
      .filter((r) => r.tgl >= p.dari && r.tgl <= p.sampai && (!s.ulp || r.ulp === s.ulp) && (!mau || normalizeFeeder(r.penyulang) === mau));
    if (!rows.length) return "✅ Tidak ada gangguan penyulang pada periode ini.";

    const L = [`⚡ *${rows.length}* gangguan: ${hitung(rows, (r) => r.indikator).map(([j, n]) => `${j} ${n}`).join(" · ")}`];
    const total = rows.reduce((a, r) => a + r.detik, 0);
    if (total) L.push(`⏱️ Total padam ${lama(total)}`);
    if (!s.ulp) L.push("", ...hitung(rows, (r) => r.ulp || "–").map(([u, n]) => `• ${u}: *${n}*`));
    if (!s.penyulang) {
      const sering = hitung(rows, (r) => r.penyulang || "–").filter(([, n]) => n > 1).slice(0, 5);
      if (sering.length) L.push("", "_Penyulang tersering:_", ...sering.map(([pn, n]) => `• ${pn}: ${n}×`));
    }

    L.push("", "_Terbaru:_");
    const urut = [...rows].sort((a, b) => `${b.tgl} ${b.jam}`.localeCompare(`${a.tgl} ${a.jam}`));
    urut.slice(0, BATAS).forEach((r) =>
      L.push(
        `• ${tgl(r.tgl)} ${r.jam.slice(0, 5)} · *${r.penyulang || "–"}*${r.keypoint ? ` (${r.keypoint})` : ""} · ${r.indikator} · ${lama(r.detik)}${s.ulp ? "" : ` · ${r.ulp}`}${r.penyebab ? `\n   ${r.penyebab}` : ""}`,
      ),
    );
    if (rows.length > BATAS) L.push(`_…dan ${rows.length - BATAS} lainnya_`);
    return L.join("\n");
  },
};
