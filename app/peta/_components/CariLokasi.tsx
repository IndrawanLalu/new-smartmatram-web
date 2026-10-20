"use client";

import { useState, type ReactNode } from "react";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { tulisKoordinat } from "@/lib/koordinat";
import { RADIUS_CARI_M, type CariLokasi as Cari, type GarduDekat, type JtmDekat, type JtrDekat } from "../_hooks/useCariLokasi";
import { GARIS, JUDUL_BAGIAN, PANEL, WARNA } from "../_ui";
import { meter } from "./JarakGardu";

/**
 * Kotak "Cari lokasi/koordinat" di kiri atas peta + daftar hasilnya:
 * penyulang (JTM), gardu, dan JTR terdekat. Klik baris = buka objeknya.
 */

interface Props {
  c: Cari;
  onJtm: (x: JtmDekat) => void;
  onGardu: (x: GarduDekat) => void;
  onJtr: (x: JtrDekat) => void;
}

const KOSONG = `Tidak ada dalam ${RADIUS_CARI_M / 1000} km`;

export default function CariLokasi({ c, onJtm, onGardu, onJtr }: Props) {
  const [teks, setTeks] = useState("");
  const { titik, hasil, sibuk, galat } = c;

  return (
    <div
      className="absolute z-[1050] top-14 left-3 w-[320px] max-w-[calc(100%-1.5rem)] max-h-[calc(100%-6rem)] flex flex-col rounded-xl border shadow-2xl text-[#e2e8f0]"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <form
        className="flex items-center gap-1.5 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          c.cari(teks);
        }}
      >
        <Search size={15} className="shrink-0 text-gray-400 ml-1" />
        <input
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          placeholder="Cari lokasi/koordinat…"
          title="Contoh: -8.5833, 116.1167 · tautan Google Maps · 8°35'00&quot;S 116°07'00&quot;E"
          className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-gray-500 focus:outline-none"
        />
        {sibuk && <Loader2 size={15} className="shrink-0 animate-spin text-gray-400" />}
        <button
          type="button"
          onClick={c.titikSaya}
          disabled={sibuk}
          className="shrink-0 h-7 px-2 rounded-lg text-[11px] flex items-center gap-1 border hover:bg-white/5"
          style={{ borderColor: GARIS }}
          title="Pakai lokasi perangkat ini"
        >
          <Crosshair size={13} /> Titik saya
        </button>
        {(titik || galat || teks) && (
          <button
            type="button"
            onClick={() => {
              setTeks("");
              c.tutup();
            }}
            className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
            title="Tutup pencarian"
          >
            <X size={15} />
          </button>
        )}
      </form>

      {galat && <p className="px-3 pb-2.5 text-xs text-[#FCA5A5]">{galat}</p>}

      {titik && hasil && (
        <div className="overflow-y-auto border-t px-3 py-2.5 space-y-3" style={{ borderColor: GARIS }}>
          <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <MapPin size={12} className="text-[#F43F5E]" /> {tulisKoordinat(titik)} · radius {RADIUS_CARI_M / 1000} km
          </p>

          <Bagian judul="Penyulang (JTM)" warna={WARNA.jtm} jumlah={hasil.jtm.length}>
            {hasil.jtm.map((x) => (
              <Baris key={x.penyulang} jarak={x.jarak} onClick={() => onJtm(x)}
                utama={x.penyulang} rinci={`Tiang ${x.kode}${x.segmen ? ` · ${x.segmen}` : ""}`} />
            ))}
          </Bagian>

          <Bagian judul="Gardu" warna={WARNA.gardu} jumlah={hasil.gardu.length}>
            {hasil.gardu.map((x) => (
              <Baris key={x.kode} jarak={x.jarak} onClick={() => onGardu(x)}
                utama={`${x.kode}${x.nama ? ` — ${x.nama}` : ""}`}
                rinci={[x.penyulang, x.daya ? `${x.daya} kVA` : null].filter(Boolean).join(" · ")} />
            ))}
          </Bagian>

          <Bagian judul="JTR" warna={WARNA.jtr} jumlah={hasil.jtr.length}>
            {hasil.jtr.map((x) => (
              <Baris key={x.tiang_id} jarak={x.jarak} onClick={() => onJtr(x)}
                utama={`Tiang ${x.kode}`} rinci={`Gardu ${x.gardu_kode}${x.jurusan ? ` · jurusan ${x.jurusan}` : ""}`} />
            ))}
          </Bagian>
        </div>
      )}
    </div>
  );
}

function Bagian({ judul, warna, jumlah, children }: { judul: string; warna: string; jumlah: number; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className={`${JUDUL_BAGIAN} flex items-center gap-1.5`}>
        <span className="w-2 h-2 rounded-full" style={{ background: warna }} /> {judul}
      </h3>
      {jumlah === 0 ? <p className="text-xs text-gray-500 pl-3.5">{KOSONG}</p> : children}
    </section>
  );
}

function Baris({ utama, rinci, jarak, onClick }: { utama: string; rinci: string; jarak: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold truncate">{utama}</span>
        {rinci && <span className="block text-[11px] text-gray-400 truncate">{rinci}</span>}
      </span>
      <span className="shrink-0 text-xs font-semibold text-[#5eead4] tabular-nums">{meter(jarak)}</span>
    </button>
  );
}
