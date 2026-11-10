import ExcelJS from "exceljs";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { CLR_HEADER, CLR_WHITE, downloadBuffer, mergeSet, styleCell, type GayaSel } from "@/lib/xlsxGaya";
import type { BarisInspeksiGardu, KategoriIgardu } from "../_hooks/useInspeksiGardu";
import type { ItemIsian } from "../_hooks/useIsianIgardu";

/**
 * Unduhan Excel Inspeksi Gardu (11 Nov 2026) — isinya = baris yang tampil
 * (butir 10). Satu baris per kunjungan: kepala, daftar temuan, lalu kolom
 * isian Tier 1 per item × rincian (× jurusan). Tier 2 kolom isiannya kosong.
 */

const KEPALA: { judul: string; lebar: number }[] = [
  { judul: "No", lebar: 4 },
  { judul: "Gardu", lebar: 10 },
  { judul: "Nama gardu", lebar: 22 },
  { judul: "ULP", lebar: 13 },
  { judul: "Penyulang", lebar: 15 },
  { judul: "Tier", lebar: 5 },
  { judul: "Tanggal", lebar: 16 },
  { judul: "Petugas", lebar: 22 },
  { judul: "Status", lebar: 16 },
  { judul: "Jumlah\ntemuan", lebar: 8 },
  { judul: "Prioritas", lebar: 9 },
  { judul: "Temuan", lebar: 48 },
  { judul: "Catatan", lebar: 28 },
];

const JURUSAN = ["1", "2", "3", "4"];
const POTONG = 150;

interface KolomIsian {
  judul: string;
  kunci: string;
  item: ItemIsian;
}

interface RowIsian { inspeksi_id: string; item_kode: string; rincian: string; nilai: string | null; angka: number | string | null }
interface RowTemuan { inspeksi_id: string; kategori: string; isian_item: string | null; uraian: string; prioritas: string; urutan: number }

/** Urutan unik per tabel supaya paginasi tidak lompat (lib/supabasePaginate). */
async function tarik<R>(tabel: string, kolom: string, urut: string[], ids: string[]): Promise<R[]> {
  const hasil: R[] = [];
  for (let i = 0; i < ids.length; i += POTONG) {
    const potong = ids.slice(i, i + POTONG);
    hasil.push(...(await fetchAllRows<R>(() => {
      let q = supabaseBrowser.from(tabel).select(kolom).in("inspeksi_id", potong);
      for (const k of urut) q = q.order(k);
      return q.returns<R[]>();
    })));
  }
  return hasil;
}

const waktu = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export async function unduhExcelIgardu(
  baris: BarisInspeksiGardu[],
  katalog: ItemIsian[],
  kategori: KategoriIgardu[],
  namaBerkas: string,
) {
  const ids = baris.map((b) => b.id);
  const [isian, temuan] = await Promise.all([
    tarik<RowIsian>("inspeksi_gardu_isian", "inspeksi_id,item_kode,rincian,nilai,angka", ["inspeksi_id", "item_kode", "rincian"], ids),
    tarik<RowTemuan>("inspeksi_gardu_temuan", "inspeksi_id,kategori,isian_item,uraian,prioritas,urutan", ["id"], ids),
  ]);

  const petaIsian = new Map(isian.map((r) => [`${r.inspeksi_id}|${r.item_kode}|${r.rincian}`, r]));
  const namaItem = new Map(katalog.map((k) => [k.kode, k]));
  const namaKat = new Map(kategori.map((k) => [k.kode, k.label]));

  // Kolom isian: item aktif + item nonaktif yang masih punya jawaban di unduhan ini.
  const dipakai = new Set(isian.map((r) => r.item_kode));
  const maksJur = Math.max(0, ...isian.filter((r) => r.rincian.includes(":")).map((r) => Number(r.rincian.split(":")[0]) || 0));
  const kolomIsian: KolomIsian[] = katalog
    .filter((k) => k.aktif || dipakai.has(k.kode))
    .flatMap((k) => {
      if (k.rincian.length === 0) return [{ judul: `${k.bagian}\n${k.nama}`, kunci: "-", item: k }];
      const jur = k.perJurusan ? JURUSAN.slice(0, Math.max(maksJur, 1)) : [null];
      return jur.flatMap((j) =>
        k.rincian.map((r) => ({
          judul: `${k.nama}${j ? ` jurusan ${j}` : ""}\n${r}${k.satuan ? ` (${k.satuan})` : ""}`,
          kunci: j ? `${j}:${r}` : r,
          item: k,
        })),
      );
    });

  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("Inspeksi Gardu", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });

  [...KEPALA, ...kolomIsian.map((k) => ({ judul: k.judul, lebar: 14 }))].forEach((k, i) => {
    ws.getColumn(i + 1).width = k.lebar;
    mergeSet(ws, 1, i + 1, 1, i + 1, k.judul, { bold: true, size: 9, bgColor: CLR_HEADER });
  });
  ws.getRow(1).height = 40;

  baris.forEach((d, idx) => {
    const r = 2 + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    const set = (col: number, val: string | number, extra?: GayaSel) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };
    const daftarTemuan = temuan
      .filter((t) => t.inspeksi_id === d.id)
      .sort((a, b) => a.urutan - b.urutan)
      .map((t) => {
        const asal = t.isian_item ? (namaItem.get(t.isian_item)?.nama ?? t.isian_item) : (namaKat.get(t.kategori) ?? t.kategori);
        return `${asal}: ${t.uraian} (${t.prioritas})`;
      });

    set(1, idx + 1);
    set(2, d.garduKode);
    set(3, d.garduNama ?? "", { align: "left" });
    set(4, d.ulp);
    set(5, d.penyulang ?? "", { align: "left" });
    set(6, d.tier);
    set(7, waktu(d.tgl));
    set(8, d.petugas ?? "", { align: "left" });
    set(9, d.status);
    set(10, d.jumlahTemuan);
    set(11, d.prioritas ?? "-");
    set(12, daftarTemuan.join("\n"), { align: "left", wrap: true });
    set(13, d.catatan ?? "", { align: "left", wrap: true });

    kolomIsian.forEach((k, i) => {
      const j = petaIsian.get(`${d.id}|${k.item.kode}|${k.kunci}`);
      const opsi = j?.nilai ? k.item.opsi.find((o) => o.kode === j.nilai) : undefined;
      const teks = !j ? "" : j.nilai ? (opsi?.label ?? j.nilai) : j.angka === null ? "" : Number(j.angka);
      set(KEPALA.length + 1 + i, teks, opsi && !opsi.normal ? { fontColor: "C62828", bold: true } : undefined);
    });
  });

  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  await downloadBuffer(wb, namaBerkas);
}
