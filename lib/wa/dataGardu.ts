import { supabaseAdmin } from "@/lib/supabase-admin";
import { ambilDataGardu, cariGardu, type DataGardu } from "@/lib/gambar/dataGardu";
import { buatGambarDataGardu } from "@/lib/gambar/buatDataGardu";

/**
 * `#DATA <kode> [ULP]` — kartu gambar satu gardu (beban puncak, per jurusan,
 * tegangan ujung, pemeliharaan terakhir). Gambar disimpan di bucket karena
 * gateway hanya menerima `mediaUrl`; satu folder per gardu, berkas lama
 * dibuang tiap kirim (nama baru = WA tidak menyajikan gambar lama).
 */

export interface BalasanMedia {
  mediaUrl: string;
  caption: string;
}

const ULP = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];
const KAKI = "_SMART MATARAM — PLN UP3 Mataram_";

const pct = (p: number | null) => (p === null ? "–" : `${p.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);
const emo = (p: number | null) => (p === null ? "⚪" : p >= 80 ? "🔴" : p >= 60 ? "🟡" : "🟢");
const tglPendek = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d}/${m}/${y}`;
};
const maps = (d: DataGardu) =>
  d.gardu.lat !== null && d.gardu.lng !== null ? `📍 https://maps.google.com/?q=${d.gardu.lat},${d.gardu.lng}` : null;

function caption(d: DataGardu) {
  const b = d.beban;
  return [
    `*${d.gardu.kode}* · ULP ${d.gardu.ulp}`,
    b ? `${emo(b.persen)} Beban puncak ${pct(b.persen)} (${tglPendek(b.tanggal)}${b.jam ? ` ${b.jam}` : ""})` : "⚪ Belum ada pengukuran beban puncak",
    maps(d),
  ].filter(Boolean).join("\n");
}

/** Cadangan bila gambar gagal dibuat/dikirim — tetap ada jawaban. */
function teksCadangan(d: DataGardu) {
  const b = d.beban;
  const baris = [
    `⚡ *${d.gardu.kode}* — ${d.gardu.nama ?? d.gardu.alamat ?? ""}`,
    `ULP ${d.gardu.ulp} · ${d.gardu.penyulang ?? "–"} · ${d.gardu.kva_master ?? "–"} kVA`,
    b
      ? `${emo(b.persen)} Beban puncak ${pct(b.persen)} · R/S/T/N ${[b.arus.R, b.arus.S, b.arus.T, b.arus.N].map((v) => v ?? "–").join("/")} A · ${tglPendek(b.tanggal)}`
      : "⚪ Belum ada pengukuran beban puncak",
    ...d.ujung.map((u) => `🔌 Ujung ${u.jurusan}: ${[u.rn, u.sn, u.tn].map((v) => v ?? "–").join("/")} V${u.bawahStandar ? " ⚠️ DROP" : ""}`),
    d.har ? `🔧 Pemeliharaan terakhir ${d.har.tgl ? tglPendek(d.har.tgl) : "–"} (${d.har.status})` : "🔧 Belum ada pemeliharaan",
    maps(d),
    "",
    "_Gambar gagal dibuat — ini ringkasannya._",
    KAKI,
  ];
  return baris.filter((x) => x !== null).join("\n");
}

async function simpanGambar(d: DataGardu, png: Buffer) {
  const nama = `${d.gardu.ulp}-${d.gardu.kode}`.toUpperCase().replace(/[^A-Z0-9-]/g, "_");
  const folder = `gambar-laporan/data-gardu/${nama}`;
  const bucket = supabaseAdmin.storage.from("inspections");
  const { data: lama } = await bucket.list(folder);
  if (lama?.length) await bucket.remove(lama.map((x) => `${folder}/${x.name}`));
  const jalur = `${folder}/${Date.now()}.png`;
  const { error } = await bucket.upload(jalur, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`simpan gambar gagal: ${error.message}`);
  return bucket.getPublicUrl(jalur).data.publicUrl;
}

export async function cmdData(args: string): Promise<string | BalasanMedia> {
  const kata = args.replace(/\b(gardu|trafo|no|nomor|kode)\b/gi, "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  const ulp = kata.length > 1 && ULP.includes(kata[kata.length - 1]) ? kata.pop()! : null;
  const q = kata.join(" ");
  if (!q) return "Format: *#DATA <kode gardu>*\nContoh: #DATA AM001";

  const ketemu = await cariGardu(q, ulp);
  if (ketemu.length === 0) return `❌ Gardu *${q}* tidak ditemukan.\nCoba kode lengkapnya, mis. *#DATA AM001*.\n\n${KAKI}`;
  if (ketemu.length > 1) {
    const persis = ketemu.every((g) => g.kode.toUpperCase() === q);
    const daftar = ketemu.slice(0, 8).map((g, i) => `${i + 1}. *${g.kode}* · ${g.ulp} · ${g.nama ?? g.alamat ?? "–"}`).join("\n");
    return persis
      ? `⚡ Kode *${q}* ada di ${ketemu.length} ULP:\n\n${daftar}\n\nKetik dengan ULP-nya, mis. *#DATA ${q} ${ketemu[0].ulp}*`
      : `⚡ Ditemukan ${ketemu.length} gardu untuk "${q}":\n\n${daftar}\n\nKetik kode lengkapnya, mis. *#DATA ${ketemu[0].kode}*`;
  }

  const d = await ambilDataGardu(ketemu[0]);
  try {
    const url = await simpanGambar(d, await buatGambarDataGardu(d));
    return { mediaUrl: url, caption: caption(d) };
  } catch (e) {
    console.error("[#DATA] gambar gagal:", (e as Error).message);
    return teksCadangan(d);
  }
}
