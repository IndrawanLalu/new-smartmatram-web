"use client";

import { useState } from "react";
import { Cable, Loader2, Pencil, TriangleAlert, Waypoints } from "lucide-react";
import type { KabelJtr, PilihanAtribut, RincianJtr } from "../_hooks/useObjekPeta";
import { INPUT, JUDUL_BAGIAN } from "../_ui";
import { Baris, TOMBOL_PANEL } from "./InfoTiang";

/**
 * Tiang ini DI GARDU JTR yang dipilih — nama, jurusan, induk, kabel — dan
 * koreksinya oleh admin (`scripts/peta-koreksi-jtr.sql`). Tiang pinjaman
 * (menumpang di batang gardu lain) punya nama & induknya sendiri di gardu ini.
 *
 * Nomor kabel = urutan kabel JTR gardu ini di tiang; JTM TIDAK dihitung.
 */

const JURUSAN = ["A", "B", "C", "D", "K"];
const namaKabel = (n: number) => (n === 1 ? "Kabel utama" : `Underbuild ${n}`);

interface Props {
  j: RincianJtr;
  pilihan: PilihanAtribut;
  boleh: boolean;
  onGantiInduk: () => void;
  onNama: (kode: string) => Promise<boolean>;
  onKabel: (lama: number, baru: number, jenis: string, ukuran: string, hilir: boolean) => Promise<boolean>;
  onJurusan: (jurusan: string, hilir: boolean) => Promise<boolean>;
}

export default function KoreksiJtr({ j, pilihan, boleh, onGantiInduk, onNama, onKabel, onJurusan }: Props) {
  const [mode, setMode] = useState<"nama" | "jurusan" | number | null>(null);
  const [nama, setNama] = useState(j.kode);
  const [jurusan, setJurusan] = useState(j.jurusan ?? "A");
  const [hilir, setHilir] = useState(true);
  const [kabel, setKabel] = useState<{ nomor: number; jenis: string; ukuran: string }>({ nomor: 1, jenis: "", ukuran: "" });
  const [sibuk, setSibuk] = useState(false);

  const jalankan = async (fn: () => Promise<boolean>) => {
    setSibuk(true);
    const ok = await fn();
    setSibuk(false);
    if (ok) setMode(null);
  };

  const bukaKabel = (k: KabelJtr) => {
    setKabel({ nomor: k.nomor, jenis: k.jenis ?? "", ukuran: k.ukuran ?? "" });
    setHilir(false);
    setMode(k.nomor);
  };

  const pilih = (nilai: string, daftar: string[], ubah: (v: string) => void, label: string) => (
    <label className="block text-xs">
      <span className="text-gray-500">{label}</span>
      <select value={nilai} onChange={(e) => ubah(e.target.value)} className={`${INPUT} mt-1`}>
        <option value="">— tetap —</option>
        {[...new Set([...(nilai ? [nilai] : []), ...daftar])].map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </label>
  );

  const tombolSimpan = (fn: () => Promise<boolean>, mati = false) => (
    <div className="flex gap-2 pt-1">
      <button onClick={() => void jalankan(fn)} disabled={sibuk || mati} className={`${TOMBOL_PANEL} border-[#00897B] text-[#5eead4]`}>
        {sibuk && <Loader2 size={13} className="animate-spin" />} Simpan
      </button>
      <button onClick={() => setMode(null)} disabled={sibuk} className={TOMBOL_PANEL}>Batal</button>
    </div>
  );

  return (
    <div className="space-y-3 rounded-lg border border-[#14B8A6]/50 p-3">
      <p className={JUDUL_BAGIAN}>JTR gardu {j.gardu}{j.menumpang ? " · menumpang" : ""}</p>
      <div>
        <Baris label="Nama di gardu ini" nilai={j.kode} />
        <Baris label="Jurusan" nilai={j.jurusan} />
        <Baris label="Induk JTR" nilai={j.indukKode ?? "pangkal — dari gardu"} />
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Kabel (JTM tidak dihitung)</p>
        {j.kabel.length === 0 ? (
          <p className="text-xs text-amber-300 mt-1">Belum ada kabel tercatat di tiang ini.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {j.kabel.map((k) => (
              <li key={k.nomor} className="flex items-center gap-2 text-xs">
                <span className={k.nomor > 1 ? "text-[#c084fc] font-semibold" : "text-[#e2e8f0]"}>{namaKabel(k.nomor)}</span>
                <span className="text-gray-400 flex-1 min-w-0 truncate">{[k.jenis, k.ukuran, k.kondisi].filter(Boolean).join(" · ") || "—"}</span>
                {k.putus && (
                  <span title="Tiang induk tidak punya kabel bernomor sama — bentang ini belum terhitung" className="text-[#FB7185]">
                    <TriangleAlert size={13} />
                  </span>
                )}
                {boleh && mode === null && (
                  <button onClick={() => bukaKabel(k)} className="text-gray-400 hover:text-white" aria-label={`Ubah ${namaKabel(k.nomor)}`}>
                    <Pencil size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {j.kabel.some((k) => k.putus) && (
          <p className="text-[11px] text-[#FB7185] mt-1.5 leading-relaxed">
            Nomor kabel tidak sama dengan tiang induknya, jadi bentangnya belum terhitung. Samakan nomornya — mis.
            ubah di tiang paling hulu lalu centang &ldquo;terapkan ke tiang sesudahnya&rdquo;.
          </p>
        )}
      </div>

      {boleh && typeof mode === "number" && (
        <div className="space-y-2.5 rounded-lg border border-[#1e3552] p-3">
          <p className={JUDUL_BAGIAN}>Ubah {namaKabel(mode)}</p>
          <label className="block text-xs">
            <span className="text-gray-500">Nomor (urutan kabel JTR — JTM tidak dihitung)</span>
            <select value={kabel.nomor} onChange={(e) => setKabel({ ...kabel, nomor: Number(e.target.value) })} className={`${INPUT} mt-1`}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n} — {namaKabel(n)}</option>)}
            </select>
          </label>
          {pilih(kabel.jenis, pilihan.kabelJenis, (v) => setKabel({ ...kabel, jenis: v }), "Jenis")}
          {pilih(kabel.ukuran, pilihan.kabelUkuran, (v) => setKabel({ ...kabel, ukuran: v }), "Ukuran")}
          <label className="flex items-start gap-2 text-xs text-[#e2e8f0]">
            <input type="checkbox" checked={hilir} onChange={(e) => setHilir(e.target.checked)} className="mt-0.5" />
            <span>
              Terapkan NOMOR ke tiang sesudahnya yang kabelnya masih ke-{mode}
              <span className="block text-gray-500">Jenis & ukuran hanya di tiang ini — ukuran kabel memang mengecil ke ujung.</span>
            </span>
          </label>
          {tombolSimpan(() => onKabel(mode, kabel.nomor, kabel.jenis, kabel.ukuran, hilir))}
        </div>
      )}

      {boleh && mode === "nama" && (
        <div className="space-y-2 rounded-lg border border-[#1e3552] p-3">
          <p className={JUDUL_BAGIAN}>Ganti nama</p>
          <input value={nama} onChange={(e) => setNama(e.target.value.toUpperCase())} className={INPUT} />
          {tombolSimpan(() => onNama(nama), !nama.trim() || nama.trim() === j.kode)}
        </div>
      )}

      {boleh && mode === "jurusan" && (
        <div className="space-y-2 rounded-lg border border-[#1e3552] p-3">
          <p className={JUDUL_BAGIAN}>Pindah jurusan</p>
          <select value={jurusan} onChange={(e) => setJurusan(e.target.value)} className={INPUT}>
            {JURUSAN.map((x) => <option key={x} value={x}>Jurusan {x}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-[#e2e8f0]">
            <input type="checkbox" checked={hilir} onChange={(e) => setHilir(e.target.checked)} />
            Ikutkan tiang sesudahnya
          </label>
          <p className="text-[11px] text-gray-500">Huruf jurusan di nama tiang ikut diganti.</p>
          {tombolSimpan(() => onJurusan(jurusan, hilir), jurusan === j.jurusan)}
        </div>
      )}

      {boleh && mode === null && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setNama(j.kode); setMode("nama"); }} className={TOMBOL_PANEL}><Pencil size={13} /> Ganti nama</button>
          <button onClick={onGantiInduk} className={TOMBOL_PANEL}><Waypoints size={13} /> Ganti induk</button>
          <button onClick={() => { setJurusan(j.jurusan ?? "A"); setHilir(true); setMode("jurusan"); }} className={TOMBOL_PANEL}>
            <Cable size={13} /> Pindah jurusan
          </button>
        </div>
      )}
    </div>
  );
}
