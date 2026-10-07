/**
 * Realisasi harian: pengelompokan baris `realisasi_harian` (SQL) per jenis
 * pekerjaan Rekap Kinerja, dan teks WhatsApp-nya.
 *
 * Teks WA ditulis untuk layar HP (±32 huruf per baris): tanpa tabel, satu
 * jenis = satu blok pendek, paling banyak 5 objek per jenis lalu "+n lainnya".
 * Jenis yang kosong digabung jadi satu baris "Nihil".
 */

export interface ItemHarian {
  kunci: string;
  /** null = pekerjaan utama; "luar" = perabasan di luar WO; "ujung" = tegangan ujung. */
  bagian: string | null;
  ulp: string;
  objek: string;
  rincian: string | null;
  petugas: string | null;
  waktu: string | null;
  km: number | null;
  disetujui: boolean;
}

export interface MetaJenis {
  kunci: string;
  jenis: string;
  satuan: string;
  desimal: boolean;
}

export interface KelompokHarian {
  meta: MetaJenis;
  /** Semua item jenis ini (utama dulu, lalu tambahan). */
  item: ItemHarian[];
  /** Nilai pekerjaan utama: KMS (desimal) atau cacah. */
  total: number;
  setuju: number;
  belum: number;
  /** Cacah pekerjaan utama — untuk "(3 segmen)" pada baris KMS. */
  cacah: number;
  luar: number;
  ujung: number;
}

const MAKS_RINCI = 5;

export const angkaId = (n: number, desimal: boolean) =>
  desimal
    ? n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString("id-ID");

/** Tanggal hari ini dalam WITA, "YYYY-MM-DD". */
export const hariIniWita = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

export const tanggalPanjang = (tgl: string) =>
  new Date(`${tgl}T00:00:00+08:00`).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar",
  });

export function kelompokkan(item: ItemHarian[], meta: MetaJenis[]): KelompokHarian[] {
  return meta.map((m) => {
    const milik = item.filter((x) => x.kunci === m.kunci);
    const utama = milik.filter((x) => x.bagian === null);
    const nilai = (xs: ItemHarian[]) => (m.desimal ? xs.reduce((s, x) => s + (x.km ?? 0), 0) : xs.length);
    return {
      meta: m,
      item: [...utama, ...milik.filter((x) => x.bagian !== null)],
      total: nilai(utama),
      setuju: nilai(utama.filter((x) => x.disetujui)),
      belum: nilai(utama.filter((x) => !x.disetujui)),
      cacah: utama.length,
      luar: milik.filter((x) => x.bagian === "luar").length,
      ujung: milik.filter((x) => x.bagian === "ujung").length,
    };
  });
}

/** Satuan untuk teks: "KMS", "gardu", "pekerjaan". */
const satuan = (k: KelompokHarian) => k.meta.satuan;

/** Baris ringkas: "3 pekerjaan · ✅ 2 · ⏳ 1". Bagian yang nol tidak ditulis. */
export function ringkasan(k: KelompokHarian) {
  const d = k.meta.desimal;
  const bagian = [
    `${angkaId(k.total, d)} ${satuan(k)}${d && k.cacah ? ` (${k.cacah} ${k.meta.kunci === "jtr" ? "gardu" : "segmen"})` : ""}`,
  ];
  if (k.setuju > 0) bagian.push(`✅ ${angkaId(k.setuju, d)}`);
  if (k.belum > 0) bagian.push(`⏳ ${angkaId(k.belum, d)}`);
  const tambahan: string[] = [];
  if (k.luar) tambahan.push(`+ ${k.luar} di luar WO`);
  if (k.ujung) tambahan.push(`+ ${k.ujung} tegangan ujung`);
  return { utama: bagian.join(" · "), tambahan };
}

const tanda = (x: ItemHarian) => (x.disetujui ? "✅" : "⏳");

/** Satu baris rincian objek untuk WA. */
function rinciWa(x: ItemHarian) {
  const isi =
    x.km !== null ? `${angkaId(x.km, true)} KMS`
    : x.kunci === "harjtm" ? (x.rincian ?? "")
    : x.bagian === "luar" ? "di luar WO"
    : x.bagian === "ujung" ? `tegangan ujung ${(x.rincian ?? "").toLowerCase()}`
    : "";
  return `• ${x.objek}${isi ? ` – ${isi}` : ""} ${tanda(x)}`;
}

export function teksWa(ulp: string, tgl: string, kelompok: KelompokHarian[]) {
  const ada = kelompok.filter((k) => k.item.length > 0);
  const nihil = kelompok.filter((k) => k.item.length === 0).map((k) => k.meta.jenis);
  const baris: string[] = ["*REALISASI HARIAN YANTEK*", `*ULP ${ulp}*`, tanggalPanjang(tgl), ""];

  if (ada.length === 0) baris.push("_Belum ada pekerjaan yang dikirim regu pada tanggal ini._", "");

  ada.forEach((k, i) => {
    const r = ringkasan(k);
    baris.push(`*${i + 1}. ${k.meta.jenis}*`, r.utama, ...r.tambahan);
    if (k.item.length <= MAKS_RINCI) {
      baris.push(...k.item.map(rinciWa));
    } else {
      // Banyak objek: cukup kodenya, berjajar — status sudah di baris ringkasan.
      const sisa = k.item.length - MAKS_RINCI;
      baris.push(`• ${k.item.slice(0, MAKS_RINCI).map((x) => x.objek).join(", ")} +${sisa} lainnya`);
    }
    baris.push("");
  });

  if (nihil.length && ada.length) baris.push(`_Nihil:_ ${nihil.join(", ")}`, "");
  baris.push("✅ disetujui · ⏳ belum disetujui", "_SMART MATARAM — PLN UP3 Mataram_");
  return baris.join("\n");
}
