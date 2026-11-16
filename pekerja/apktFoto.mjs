/**
 * Foto & petugas laporan gangguan APKT (scripts/apkt-foto.sql, rencana-foto-apkt.md).
 *
 * Satu antrean, satu laporan sekali jalan — tombol "Ambil foto" di web dan
 * jalan otomatis malam tidak pernah memproses laporan yang sama bersamaan.
 *   • permintaan manual: kapan saja, dicek tiap 10 detik, berjeda 10 detik antarlaporan;
 *   • otomatis: hanya pukul JAM_FOTO_APKT (bawaan 0-6 WITA), satu laporan
 *     tiap ±20 detik supaya server PLN tidak terbebani;
 *   • APKT memutus koneksi → otomatis berhenti sampai malam berikutnya;
 *   • pukul 06.00 WITA: berkas foto lebih dari 2 bulan dihapus.
 *
 * APKT hanya terjangkau dari jaringan kantor (homelab) dan terbuka tanpa login.
 */
const APKT_GQL = "https://new-apktservice.pln.co.id:32269/graphql";
const BUCKET = "apkt-foto";
const [JAM_MULAI, JAM_SELESAI] = (process.env.JAM_FOTO_APKT || "0-6").split("-").map(Number);
const JEDA_LAPORAN = 20_000;
// Antara laporan manual (tombol per halaman Realisasi PS4 bisa mengantrekan 20
// sekaligus): 10 detik, seperti orang yang membuka laporan satu per satu.
const JEDA_MANUAL = 10_000;
const JEDA_PERMINTAAN = 2_000;
const JEDA_KOSONG = 10_000;   // antrean kosong: cek lagi (hanya ke Supabase, bukan PLN)

const Q_FOTO = "query($n:String){getGangguanFotoByNoLaporan(noLaporan:$n){status message data{id foto status}}}";
const Q_PETUGAS = "query($n:String!){getGangguanByNoLaporan(noLaporan:$n){status message data{no_laporan status_akhir gangguan_transaksi{id jenis appuser{username}}}}}";
const TAHAP = { "Dalam Pengerjaan": "pengerjaan", Selesai: "selesai" };

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch untuk klien Supabase pekerja ini: sambungan homelab → Supabase sesekali
 * putus sesaat ("fetch failed", 16 Nov 2026 ±14× dalam 25 menit). Coba ulang
 * 3× berjeda 1–3 detik, bukan menunggu satu putaran penuh.
 */
export async function fetchUlang(input, init) {
  for (let ke = 1; ; ke++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      if (ke > 3 || init?.signal?.aborted) throw e;
      await tidur(ke * 1000);
    }
  }
}
const wita = () => new Date(Date.now() + 8 * 3600 * 1000);
const tglWita = () => wita().toISOString().slice(0, 10);

/** Galat yang bisa dibaca di form koreksi. */
function pesanGalat(e) {
  const kode = e?.cause?.code ?? e?.code ?? "";
  if (e?.name === "TimeoutError") return "APKT tidak menjawab dalam 30 detik.";
  if (kode === "ECONNRESET") return "APKT memutus koneksi (ECONNRESET).";
  if (kode === "ENOTFOUND" || kode === "EAI_AGAIN") return "Alamat APKT tidak ditemukan dari homelab (jaringan kantor putus?).";
  if (kode === "ECONNREFUSED" || kode === "ETIMEDOUT" || kode === "EHOSTUNREACH") return `APKT tidak terjangkau (${kode}).`;
  return (e?.message || String(e)).slice(0, 300);
}
const putus = (e) => ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN"]
  .includes(e?.cause?.code ?? e?.code) || e?.name === "TimeoutError";

async function gql(query, n) {
  const res = await fetch(APKT_GQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { n } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`APKT menjawab HTTP ${res.status}.`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`APKT menolak query: ${j.errors[0].message}`);
  return j.data;
}

async function prosesLaporan(supabase, log, { no_laporan: no, tgl_lapor: tgl, manual }) {
  const simpan = async (status, petugas, pesan, foto = []) => {
    const { data: lama, error } = await supabase.rpc("apkt_foto_simpan", {
      p_no_laporan: no, p_tgl_lapor: tgl, p_status: status, p_petugas: petugas, p_pesan: pesan, p_foto: foto,
    });
    if (error) throw new Error(`Supabase menolak simpan ${no}: ${error.message}`);
    if (lama?.length) await supabase.storage.from(BUCKET).remove(lama);
  };

  try {
    const f = (await gql(Q_FOTO, no))?.getGangguanFotoByNoLaporan;
    // Satu foto per tahap: id terkecil (foto pertama yang diunggah petugas).
    const pilih = {};
    for (const x of f?.data ?? []) {
      const tahap = TAHAP[x.status];
      if (tahap && x.foto && (!pilih[tahap] || x.id < pilih[tahap].id)) pilih[tahap] = x;
    }

    await tidur(JEDA_PERMINTAAN);
    const p = (await gql(Q_PETUGAS, no))?.getGangguanByNoLaporan?.data;
    const selesai = (p?.gangguan_transaksi ?? []).filter((t) => t.jenis === "Selesai").sort((a, b) => b.id - a.id)[0];
    const petugas = selesai?.appuser?.username ?? null;

    const foto = [];
    for (const [tahap, x] of Object.entries(pilih)) {
      await tidur(JEDA_PERMINTAAN);
      const r = await fetch(x.foto, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`Foto ${tahap} tidak bisa diunduh dari APKT (HTTP ${r.status}).`);
      const isi = Buffer.from(await r.arrayBuffer());
      // Nama memuat no laporan + id foto APKT → tidak bisa tertukar antarlaporan.
      const path = `${no}/${tahap}-${x.id}.jpg`;
      const { error } = await supabase.storage.from(BUCKET)
        .upload(path, isi, { contentType: r.headers.get("content-type") || "image/jpeg", upsert: true });
      if (error) throw new Error(`Foto ${tahap} gagal disimpan ke Supabase: ${error.message}`);
      foto.push({ tahap, apkt_foto_id: x.id, path, ukuran: isi.length });
    }

    if (foto.length) {
      await simpan("ada_foto", petugas, null, foto);
      log(`foto APKT ${no}${manual ? " (manual)" : ""}: ${foto.map((x) => x.tahap).join(" + ")}, petugas ${petugas ?? "-"}`);
    } else {
      await simpan("tidak_ada_foto", petugas, f?.message && !f.status ? `APKT: ${f.message}` : null);
      log(`foto APKT ${no}${manual ? " (manual)" : ""}: tidak ada foto, petugas ${petugas ?? "-"}`);
    }
    return { putus: false };
  } catch (e) {
    const pesan = pesanGalat(e);
    log(`foto APKT ${no}: gagal — ${pesan}`);
    try { await simpan("gagal", null, pesan); } catch (e2) {
      // Catatan gagal pun tidak tersimpan → permintaan manual tetap di antrean; tahan dulu.
      log(`foto APKT ${no}: ${e2.message}`);
      return { putus: putus(e), macet: true };
    }
    return { putus: putus(e) };
  }
}

async function bersihkan(supabase, log) {
  let total = 0;
  for (;;) {
    const { data, error } = await supabase.rpc("apkt_foto_kedaluwarsa", { p_jumlah: 100 });
    if (error) return log(`hapus foto APKT lama: ${error.message}`);
    const path = (data ?? []).map((x) => x.path);
    if (!path.length) break;
    const { error: e2 } = await supabase.storage.from(BUCKET).remove(path);
    if (e2) return log(`hapus foto APKT lama: ${e2.message}`);
    await supabase.rpc("apkt_foto_lepas", { p_path: path });
    total += path.length;
  }
  if (total) log(`hapus foto APKT lebih dari 2 bulan: ${total} berkas`);
}

export function jalankanFotoApkt(supabase, log) {
  let berhentiSampai = "";   // tanggal WITA: otomatis berhenti malam itu sesudah APKT putus
  let terakhirBersih = "";

  const jamOtomatis = () => {
    const j = wita().getUTCHours();
    return j >= JAM_MULAI && j < JAM_SELESAI && berhentiSampai !== tglWita();
  };

  (async function putar() {
    for (;;) {
      try {
        if (wita().getUTCHours() === JAM_SELESAI && terakhirBersih !== tglWita()) {
          terakhirBersih = tglWita();
          await bersihkan(supabase, log);
        }
        const otomatis = jamOtomatis();
        const { data, error } = await supabase.rpc("apkt_foto_antrean", { p_jumlah: 1, p_otomatis: otomatis });
        if (error) { log(`antrean foto APKT: ${error.message}`); await tidur(15_000); continue; }
        const lap = data?.[0];
        if (!lap) { await tidur(JEDA_KOSONG); continue; }
        const hasil = await prosesLaporan(supabase, log, lap);
        if (hasil.putus && !lap.manual && otomatis) {
          berhentiSampai = tglWita();
          log("foto APKT: APKT tidak terjangkau — jalan otomatis berhenti sampai malam berikutnya");
        }
        await tidur(hasil.macet ? 60_000 : lap.manual ? JEDA_MANUAL : JEDA_LAPORAN);
      } catch (e) {
        log(`foto APKT: ${e.message}`);
        await tidur(60_000);
      }
    }
  })();

  log(`foto APKT: otomatis ${JAM_MULAI}.00–${JAM_SELESAI}.00 WITA, manual kapan saja (cek tiap ${JEDA_KOSONG / 1000} detik)`);
}
