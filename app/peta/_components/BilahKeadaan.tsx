"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { ZOOM_GARDU, ZOOM_TIANG } from "../_hooks/usePetaIsi";
import { GARIS } from "../_ui";
import { BATAS_NAMA } from "./LapisanNama";
import { GAYA_PADAM } from "./TombolAtas";

/**
 * Bilah keadaan kiri bawah. Penghitung objek berdiri di sini SEJAK AWAL, bukan
 * ditambahkan kalau nanti terasa berat. Waktu peta melambat, yang pertama
 * dibutuhkan adalah angka — bukan tebakan tentang lapisan mana yang bocor.
 */

const PESAN = "rounded-lg px-2.5 py-1.5 backdrop-blur-sm text-gray-400 border";

interface Props {
  sibuk: boolean;
  zoom: number;
  jumlahObjek: number;
  jumlahTiang: number;
  /** Tiang yang dimuat dari layar (sebelum disaring pemilik peralatan). */
  tiangDiLayar: number;
  jumlahGardu: number;
  /** Ada jaringan (bukan hanya gardu) yang menyala & bukan "Segmen ini saja". */
  sebutZoomTiang: boolean;
  sebutZoomGardu: boolean;
  terpotong: boolean;
  /** Label tiang (nama/nomor kabel/isian) sedang diminta. */
  adaLabel: boolean;
}

export default function BilahKeadaan(p: Props) {
  return (
    <div className="absolute z-[1000] bottom-3 left-3 flex flex-wrap items-center gap-2 text-[11px] max-w-[calc(100%-1.5rem)]">
      <div
        className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm flex items-center gap-2 tabular-nums font-mono text-gray-300 border"
        style={GAYA_PADAM}
      >
        {p.sibuk && <Loader2 size={11} className="animate-spin text-[#5eead4]" />}
        <span>zoom {p.zoom}</span>
        <span className="text-gray-600">|</span>
        <span>{p.jumlahObjek.toLocaleString("id-ID")} objek</span>
        {p.jumlahTiang > 0 && <span className="text-gray-500">{p.jumlahTiang} tiang</span>}
        {p.jumlahGardu > 0 && <span className="text-gray-500">{p.jumlahGardu} gardu</span>}
      </div>

      {p.sebutZoomTiang && p.zoom < ZOOM_TIANG && (
        <div className={PESAN} style={GAYA_PADAM}>
          Perbesar ke zoom {ZOOM_TIANG} untuk melihat tiang satu per satu
        </div>
      )}

      {p.sebutZoomGardu && p.zoom < ZOOM_GARDU && (
        <div className={PESAN} style={GAYA_PADAM}>
          Perbesar untuk melihat gardu — atau centang penyulangnya di folder Gardu
        </div>
      )}

      {p.terpotong && (
        <div className="rounded-lg bg-amber-500/90 text-white px-2.5 py-1.5 flex items-center gap-1.5">
          <TriangleAlert size={12} />
          Terlalu banyak tiang di layar — sebagian tidak digambar
        </div>
      )}
      {p.adaLabel && p.tiangDiLayar > BATAS_NAMA && (
        <div className="rounded-lg bg-[#0b1220]/85 text-[#e2e8f0] px-2.5 py-1.5 border" style={{ borderColor: GARIS }}>
          Label tiang tampil setelah diperbesar ({p.tiangDiLayar} tiang di layar, maks {BATAS_NAMA})
        </div>
      )}
    </div>
  );
}
