"use client";

import { useState } from "react";
import { Cable, Loader2, Merge, Pencil, TriangleAlert, Unlink, Waypoints } from "lucide-react";
import type { KabelJtr, PilihanAtribut, RincianJtr } from "../_hooks/useObjekPeta";
import { INPUT, JUDUL_BAGIAN } from "../_ui";
import { sebutUsulan } from "@/lib/jtrAsalKabel";
import { Baris, TOMBOL_PANEL } from "./InfoTiang";

/**
 * Tiang ini DI GARDU JTR yang dipilih — nama, jurusan, induk, kabel — dan
 * koreksinya oleh admin (`scripts/peta-koreksi-jtr.sql`). Tiang pinjaman
 * (menumpang di batang gardu lain) punya nama & induknya sendiri di gardu ini.
 *
 * Nomor kabel = urutan kabel JTR gardu ini di tiang; JTM TIDAK dihitung.
 */

/** Jurusan = huruf di panel gardu (keputusan user 8 Okt 2026); K tidak dipakai lagi. */
const JURUSAN = ["A", "B", "C", "D"];
const namaKabel = (n: number) => (n === 1 ? "Kabel utama" : `Underbuild ${n}`);

interface Props {
  j: RincianJtr;
  pilihan: PilihanAtribut;
  boleh: boolean;
  onGantiInduk: () => void;
  onNama: (kode: string) => Promise<boolean>;
  onKabel: (lama: number, baru: number, jenis: string, ukuran: string, hilir: boolean) => Promise<boolean>;
  /** Asal kabel: tiang lain, atau langsung dari gardu. */
  onAsal: (nomor: number, huluId: string | null, dariGardu: boolean) => Promise<boolean>;
  /** Jurusan satu kabel — hanya jurusan yang tercatat lewat tiang ini. */
  onJurusanKabel: (nomor: number, jurusan: string) => Promise<boolean>;
  onJurusan: (jurusan: string, hilir: boolean) => Promise<boolean>;
  /** Tiang milik sendiri: jadikan pinjaman batang lain (tiang kembar). */
  onGabung: () => void;
  /** Tiang pinjaman: lepas dari batang. */
  onLepas: () => void;
}

export default function KoreksiJtr({ j, pilihan, boleh, onGantiInduk, onNama, onKabel, onAsal, onJurusanKabel, onJurusan, onGabung, onLepas }: Props) {
  const banyakJurusan = j.jurusanLewat.length > 1;
  const [mode, setMode] = useState<"nama" | "jurusan" | number | null>(null);
  const [nama, setNama] = useState(j.kode);
  const [jurusan, setJurusan] = useState(j.jurusan ?? "A");
  const [hilir, setHilir] = useState(true);
  const [kabel, setKabel] = useState<{ nomor: number; jenis: string; ukuran: string }>({ nomor: 1, jenis: "", ukuran: "" });
  const [sibuk, setSibuk] = useState(false);
  /** Koreksi cepat nomor kabel: ikut tiang sesudahnya (bawaan) atau tiang ini saja. */
  const [hilirCepat, setHilirCepat] = useState(true);

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
        <Baris
          label="Jurusan"
          nilai={
            banyakJurusan
              ? j.jurusanLewat.map((x) => `${x.jurusan}${x.utama ? " (utama)" : ""} · ${x.kode}`).join("  ·  ")
              : j.jurusan
          }
        />
        <Baris label="Induk JTR" nilai={j.indukKode ?? "pangkal — dari gardu"} />
        {(j.garduLain.length > 0 || j.dinyatakanLain.ada) && (
          <Baris
            label="Batang bersama"
            nilai={[
              ...j.garduLain.map((g) => `JTR ${g}`),
              ...(j.dinyatakanLain.ada && !j.garduLain.includes(j.dinyatakanLain.kode ?? "")
                ? [`dinyatakan regu: ada JTR gardu lain${j.dinyatakanLain.kode ? ` (${j.dinyatakanLain.kode})` : ""}`]
                : []),
            ].join(" · ")}
          />
        )}
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Kabel (JTM tidak dihitung)</p>
        {j.kabel.length === 0 ? (
          <p className="text-xs text-amber-300 mt-1">Belum ada kabel tercatat di tiang ini.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {j.kabel.map((k) => (
              <li key={k.nomor} className="text-xs">
              <div className="flex items-center gap-2">
                <span className={k.nomor > 1 ? "text-[#c084fc] font-semibold" : "text-[#e2e8f0]"}>{namaKabel(k.nomor)}</span>
                {(banyakJurusan || k.belumPasti) && (
                  <span
                    className={`px-1 rounded text-[10px] font-bold ${k.belumPasti ? "bg-violet-500/30 text-violet-200" : "bg-[#00897B]/30 text-[#5eead4]"}`}
                    title={k.belumPasti ? "Jurusan kabel ini belum dipastikan — sementara ikut jurusan tiangnya" : `Jurusan ${k.jurusan}`}
                  >
                    {k.jurusan ?? "?"}{k.belumPasti ? "?" : ""}
                  </span>
                )}
                <span className="text-gray-400 flex-1 min-w-0 truncate">{[k.jenis, k.ukuran, k.kondisi].filter(Boolean).join(" · ") || "—"}</span>
                {k.putus && (
                  <span title="Kabel ini belum jelas lanjutan kabel mana di tiang induk — bentang ini belum terhitung" className="text-[#FB7185]">
                    <TriangleAlert size={13} />
                  </span>
                )}
                {boleh && mode === null && (
                  <>
                    {/* Sekali ketuk: ganti nomor. Jenis/ukuran lewat pensil. */}
                    <span className="flex gap-0.5" aria-label="Ganti nomor kabel">
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          onClick={() => n !== k.nomor && void jalankan(() => onKabel(k.nomor, n, "", "", hilirCepat))}
                          disabled={sibuk || n === k.nomor}
                          className={`w-5 h-5 rounded text-[10px] font-bold border ${
                            n === k.nomor
                              ? "border-[#00897B] bg-[#00897B]/30 text-[#5eead4]"
                              : "border-[#1e3552] text-gray-400 hover:text-white hover:border-gray-400"
                          }`}
                          title={n === k.nomor ? "Nomor sekarang" : `Jadikan kabel ke-${n}`}
                        >
                          {n}
                        </button>
                      ))}
                    </span>
                    <button onClick={() => bukaKabel(k)} className="text-gray-400 hover:text-white" aria-label={`Ubah ${namaKabel(k.nomor)}`}>
                      <Pencil size={12} />
                    </button>
                  </>
                )}
              </div>
              {/* Jurusan kabel: dipastikan bila belum, atau dipindah ke jurusan lain
                  yang tercatat lewat tiang ini. */}
              {boleh && mode === null && (k.belumPasti || banyakJurusan) && (
                <div className="mt-1 ml-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={k.belumPasti ? "text-violet-300" : "text-gray-500"}>
                    {k.belumPasti ? "Jurusan belum dipastikan:" : "Jurusan kabel:"}
                  </span>
                  {j.jurusanLewat.map((x) => (
                    <button
                      key={x.jurusan}
                      onClick={() => void jalankan(() => onJurusanKabel(k.nomor, x.jurusan))}
                      disabled={sibuk || (!k.belumPasti && x.jurusan === k.jurusan)}
                      className={`px-1.5 py-0.5 rounded border ${
                        x.jurusan === k.jurusan
                          ? "border-[#00897B] text-[#5eead4] bg-[#00897B]/20"
                          : "border-[#1e3552] text-gray-300 hover:text-white"
                      }`}
                    >
                      {x.jurusan}
                    </button>
                  ))}
                </div>
              )}
              {/* Asal kabel: ikut induk (bawaan), ditunjuk, atau belum jelas + usulan. */}
              {k.putus ? (
                <div className="mt-1 ml-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-[#FB7185]">
                    Asal belum dipilih{k.usulan && sebutUsulan(k.usulan) ? <> — usulan <b>{sebutUsulan(k.usulan)}</b></> : ""}
                  </span>
                  {boleh && mode === null && (
                    <>
                      {k.usulan?.usulTiangId && !k.usulan.usulDariGardu && (
                        <button
                          onClick={() => void jalankan(() => onAsal(k.nomor, k.usulan?.usulTiangId ?? null, false))}
                          disabled={sibuk}
                          className="px-1.5 py-0.5 rounded border border-[#00897B] text-[#5eead4] hover:bg-[#00897B]/20"
                        >
                          Dari {k.usulan.usulKode}
                        </button>
                      )}
                      <button
                        onClick={() => void jalankan(() => onAsal(k.nomor, null, true))}
                        disabled={sibuk}
                        className={`px-1.5 py-0.5 rounded border ${
                          k.usulan?.usulDariGardu
                            ? "border-[#00897B] text-[#5eead4] hover:bg-[#00897B]/20"
                            : "border-[#1e3552] text-gray-300 hover:text-white"
                        }`}
                      >
                        Dari gardu
                      </button>
                    </>
                  )}
                </div>
              ) : k.asal ? (
                <p className="mt-0.5 ml-1 text-[11px] text-gray-500">
                  asal: {k.asal === "gardu" ? "langsung dari gardu" : k.asal}
                  {boleh && mode === null && (
                    <button
                      onClick={() => void jalankan(() => onAsal(k.nomor, null, false))}
                      disabled={sibuk}
                      className="ml-2 underline hover:text-white"
                      title="Kembalikan: kabel ini ikut induk tiang"
                    >
                      ikut induk
                    </button>
                  )}
                </p>
              ) : null}
              </li>
            ))}
          </ul>
        )}
        {boleh && mode === null && j.kabel.length > 0 && (
          <label className="flex items-center gap-2 text-[11px] text-gray-400 mt-1.5">
            <input type="checkbox" checked={hilirCepat} onChange={(e) => setHilirCepat(e.target.checked)} />
            Ganti nomor juga di tiang sesudahnya
          </label>
        )}
        {j.kabel.some((k) => k.putus) && (
          <p className="text-[11px] text-[#FB7185] mt-1.5 leading-relaxed">
            Induk tiang ini membawa beberapa kabel gardu ini dan tidak satu pun cocok nomor maupun jurusannya, jadi
            bentangnya belum terhitung. Biasanya dua jalur berdampingan yang berbagi tiang: pilih asalnya (usulan =
            tiang terdekat yang membawa kabel sejurusan, atau gardu). Kalau nomor atau jurusannya yang salah, betulkan itu.
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
          {j.menumpang ? (
            <button onClick={onLepas} className={`${TOMBOL_PANEL} text-red-300`}>
              <Unlink size={13} /> Lepas dari batang
            </button>
          ) : (
            <button onClick={onGabung} className={TOMBOL_PANEL} title="Gardu kedua terlanjur membuat batang baru di batang yang sama">
              <Merge size={13} /> Gabungkan ke batang lain (tiang kembar)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
