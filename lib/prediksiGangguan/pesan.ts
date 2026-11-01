import type { HasilPrediksi } from "./hitung";

/**
 * Pesan WA prediksi lokasi — untuk regu yang segera menelusuri. Isinya
 * patokan yang dikenal di lapangan ("cek sekitar LBSM BUNGKARNO", "seputaran
 * MM135 — JL. BUNG HATTA"), baru nomor tiang. Masa uji: japri saja.
 */

const MAKS_KELOMPOK = 4;
const MAKS_SEKSI = 5;
const MAKS_ALAT = 8;

const km = (n: number) => n.toFixed(1).replace(".", ",");
const ribu = (n: number) => Math.round(n).toLocaleString("id-ID");
const peta = (lat: number | null, lng: number | null) =>
  lat != null && lng != null ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}` : null;

function sumberTeks(h: HasilPrediksi): string | null {
  const s = h.sumber;
  if (!s) return null;
  if (!s.trafo) return "Trafo GI belum diketahui — perkiraan kasar.";
  return s.asal === "kalibrasi"
    ? `Sumber ${s.trafo} terkalibrasi dari ${s.n} lokasi temuan.`
    : `Sumber ${s.trafo} belum terkalibrasi — rentang masih lebar.`;
}

export function teksPrediksi(h: HasilPrediksi): string {
  const L = ["🔎 *PREDIKSI LOKASI GANGGUAN*", `*${h.penyulangJtm ?? h.penyulang}* · ${h.alat.nama} trip`];
  const b = h.bacaan;

  if (b.jenis === "OC2" || b.jenis === "OC3") {
    const r = b.rentang!;
    L.push(`OC ${b.jenis === "OC3" ? "3" : "2"} fasa ${b.fasa} · arus gangguan ±${ribu((r[0] + r[1]) / 2)} A${b.beban ? ` (beban ${b.beban} A dikeluarkan)` : ""}`);
  } else if (b.jenis === "EF") {
    L.push(`Gangguan tanah (EF) fasa ${b.fasa} — jarak tidak bisa diperkirakan dari arus.`);
  } else {
    L.push(`Jenis gangguan tidak terbaca dari arus (${b.alasan}).`);
  }

  if (h.kelompok.length) {
    const c = h.calon.map((x) => x.km);
    const dariAlat = h.alat.km != null ? ` (±${km(Math.min(...c) - h.alat.km)}–${km(Math.max(...c) - h.alat.km)} km hilir ${h.alat.nama})` : "";
    L.push(`Perkiraan ${km(Math.min(...c))}–${km(Math.max(...c))} km dari GI${dariAlat}`, "", "*Rekomendasi cek* (urut paling cocok):");
    h.kelompok.slice(0, MAKS_KELOMPOK).forEach((k, i) => {
      const alat = k.patokan.find((p) => p.jenis === "alat");
      const gardu = k.patokan.find((p) => p.jenis === "gardu");
      const arah = [alat && `sekitar *${alat.nama}*`, gardu && `seputaran *${gardu.nama}*`].filter(Boolean).join(" / ");
      L.push(`${i + 1}. ${arah ? `Cek ${arah}` : k.cabang[0].label}`);
      for (const c of k.cabang) L.push(`   ${c.label}: ${c.dari === c.sampai ? c.dari : `${c.dari} … ${c.sampai}`} (${c.jumlah} tiang)`);
      if (k.temuanRow) L.push(`   ⚠️ ${k.temuanRow} temuan ROW terbuka di area ini`);
      const link = peta(k.lat, k.lng);
      if (link) L.push(`   📍 ${link}`);
    });
    if (h.kelompok.length > MAKS_KELOMPOK) L.push(`   …dan ${h.kelompok.length - MAKS_KELOMPOK} area lain (lihat web SMART Learning).`);
  } else if (h.seksi.length && h.zona) {
    L.push(`Zona: hilir ${h.alat.nama} · ${ribu(h.zona.tiang)} tiang · ${km(h.zona.km)} km jaringan`);
    if (h.peralatan.length) {
      const nama = h.peralatan.slice(0, MAKS_ALAT).map((p) => p.nama).join(", ");
      const lain = h.peralatan.length > MAKS_ALAT ? `, …dan ${h.peralatan.length - MAKS_ALAT} lain` : "";
      L.push("", "*Cek dulu peralatan di zona* (jumperan, isolator, FCO — cepat dilihat dari jalan):", `   ${nama}${lain}`);
    }
    L.push("", "*Lalu sisir per seksi* (jaringan terpanjang dulu):");
    h.seksi.slice(0, MAKS_SEKSI).forEach((s, i) => {
      const gardu = s.patokan[0];
      const temuan = s.temuanRow ? ` · ⚠️ ${s.temuanRow} temuan ROW` : s.temuan ? ` · ${s.temuan} temuan` : "";
      L.push(`${i + 1}. Seksi ${s.pangkal} · ${s.jumlah} tiang · ${km(s.km)} km${temuan}`);
      if (gardu) L.push(`   dekat ${gardu.nama}`);
      const link = peta(s.lat, s.lng);
      if (link) L.push(`   📍 ${link}`);
    });
    if (h.seksi.length > MAKS_SEKSI) L.push(`   …dan ${h.seksi.length - MAKS_SEKSI} seksi lain.`);
  }

  const catatan = [sumberTeks(h), ...h.catatan.filter((c) => !c.includes("belum terkalibrasi"))].filter(Boolean);
  if (catatan.length) L.push("", ...catatan.map((c) => `ℹ️ ${c}`));
  L.push("", "_Perkiraan dari arus gangguan — tetap pastikan dengan penyisiran._");
  return L.join("\n");
}
