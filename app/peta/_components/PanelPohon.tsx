"use client";

import { Loader2, Send, X } from "lucide-react";
import { LABEL_SUMBER, WARNA_POHON, type SaringPohon, type TemuanPohon } from "../_hooks/usePohonPeta";
import { GARIS, INPUT, JUDUL_BAGIAN, PANEL } from "../_ui";

/**
 * Rincian saringan lapisan pohon, per SUMBER. Sumber & penyulang dipilih di
 * folder Pohon panel kiri; bagian di sini hanya muncul untuk sumber yang
 * dicentang di sana.
 *
 *   Dari inspeksi JTM  menyentuh / berpotensi, sembunyikan yang sudah dirabas.
 *                      Tidak per bulan — temuan menunggu sampai dirabas.
 *   Dari perabasan     bulan tanggal kerja (WO dan di luar WO).
 */

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const VEGETASI: { k: TemuanPohon["vegetasi"]; label: string }[] = [
  { k: "menyentuh", label: "Menyentuh" },
  { k: "berpotensi", label: "Berpotensi" },
];

const CHIP = "px-2 py-1 rounded-lg text-[11px] border transition-colors";
const chip = (on: boolean) => `${CHIP} ${on ? "border-[#00897B] bg-[#00897B]/20 text-[#e2e8f0]" : "border-[#1e3552] text-gray-500"}`;

interface Props {
  tahun: number;
  bulan: number;
  onBulan: (tahun: number, bulan: number) => void;
  saring: SaringPohon;
  onSaring: (s: SaringPohon) => void;
  jumlah: number;
  total: number;
  tertangani: number;
  sibuk: boolean;
  galat: string | null;
  onTutup: () => void;
  /** Temuan tampil yang bisa ditugaskan; tombolnya hanya untuk yang berhak. */
  bisaDitugaskan: number;
  onTugaskanSemua?: () => void;
}

export default function PanelPohon({
  tahun, bulan, onBulan, saring, onSaring, jumlah, total, tertangani, sibuk, galat, onTutup, bisaDitugaskan, onTugaskanSemua,
}: Props) {
  const alihTugas = (k: "belum" | "sudah") => {
    const b = new Set(saring.tugas);
    if (b.has(k)) b.delete(k);
    else b.add(k);
    onSaring({ ...saring, tugas: b });
  };
  const alihVegetasi = (k: TemuanPohon["vegetasi"]) => {
    const b = new Set(saring.vegetasi);
    if (b.has(k)) b.delete(k);
    else b.add(k);
    onSaring({ ...saring, vegetasi: b });
  };

  return (
    <div className="w-[300px] rounded-xl border shadow-2xl p-3 space-y-3" style={{ background: PANEL, borderColor: GARIS }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#e2e8f0]">Pohon</p>
        <button onClick={onTutup} className="p-1 rounded text-gray-400 hover:text-white" aria-label="Padamkan semua pohon">
          <X size={15} />
        </button>
      </div>

      {saring.sumber.has("inspeksi") && (
        <div className="space-y-2">
          <p className={JUDUL_BAGIAN}>{LABEL_SUMBER.inspeksi}</p>
          <div className="flex flex-wrap gap-1.5">
            {VEGETASI.map((v) => (
              <button key={v.k} onClick={() => alihVegetasi(v.k)} className={chip(saring.vegetasi.has(v.k))}>
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: WARNA_POHON[v.k] }} />
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => alihTugas("belum")} className={chip(saring.tugas.has("belum"))}>Belum ditugaskan</button>
            <button onClick={() => alihTugas("sudah")} className={chip(saring.tugas.has("sudah"))}>Sudah ditugaskan</button>
          </div>
          <label className="flex items-start gap-2 text-[11.5px] text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={saring.sembunyikanTertangani}
              onChange={(e) => onSaring({ ...saring, sembunyikanTertangani: e.target.checked })}
              className="mt-0.5 accent-[#00897B]"
            />
            <span>
              Sembunyikan yang segmennya sudah dirabas
              {tertangani > 0 && <span className="text-gray-500"> ({tertangani})</span>}
            </span>
          </label>
          <p className="text-[10.5px] text-gray-500">
            Berdiri di samping tiangnya; ikon pudar bergaris = inspeksi belum disetujui.
          </p>
          {onTugaskanSemua && bisaDitugaskan > 0 && (
            <button
              onClick={onTugaskanSemua}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#00897B] px-2 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#00796B]"
              title="Tugaskan ke satu regu semua temuan yang tampil di peta dan belum ditugaskan"
            >
              <Send size={12} /> Tugaskan {bisaDitugaskan} yang belum ke regu…
            </button>
          )}
        </div>
      )}

      {saring.sumber.has("perabasan") && (
        <div className="space-y-2">
          <p className={JUDUL_BAGIAN}>
            {LABEL_SUMBER.perabasan}
            <span className="inline-block w-2 h-2 rounded-full ml-1.5" style={{ background: WARNA_POHON.dirabas }} />
          </p>
          <div className="flex gap-2">
            <select value={bulan} onChange={(e) => onBulan(tahun, Number(e.target.value))} className={INPUT} aria-label="Bulan dirabas">
              {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
            </select>
            <select value={tahun} onChange={(e) => onBulan(Number(e.target.value), bulan)} className={INPUT} aria-label="Tahun dirabas">
              {[tahun - 1, tahun, tahun + 1].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <p className="text-[10.5px] text-gray-500">WO dan di luar WO, menurut tanggal dirabas.</p>
        </div>
      )}

      {saring.sumber.size === 0 && (
        <p className="text-[11px] text-gray-400">Pilih sumbernya di folder Pohon panel kiri.</p>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
        {sibuk && <Loader2 size={11} className="animate-spin" />}
        {galat ? <span className="text-red-300">Gagal memuat: {galat}</span> : `${jumlah} dari ${total} pohon ditampilkan`}
      </p>
    </div>
  );
}
