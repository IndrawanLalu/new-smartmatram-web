"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, Crosshair, House, Layers, Loader2,
  PanelLeftClose, Search, Waypoints, X, Zap,
} from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import type { Jaringan, Lapisan } from "../_hooks/usePetaDaftar";

/**
 * Panel lapisan — pohon folder, saringan, dan pencarian.
 *
 * YANG MENENTUKAN BENTUKNYA: ada 82 penyulang dan dua ribuan gardu. Pohon
 * folder saja berarti menggulir ratusan baris untuk menemukan satu gardu, dan
 * itu pekerjaan yang diulang puluhan kali sehari. Jadi kotak cari berdiri di
 * PALING ATAS, bukan di dalam folder: mengetik "AM005" langsung memunculkan
 * gardu itu beserta jaringan JTR-nya, tanpa seorang pun perlu tahu dia ada di
 * folder yang mana.
 *
 * Mengetuk hasil pencarian menyalakan lapisannya DAN melompat ke tempatnya —
 * dua hal yang selalu diinginkan bersamaan, jadi tidak dipisah jadi dua ketukan.
 */

interface Props {
  user: CurrentUser;
  perFolder: { jtm: Lapisan[]; jtr: Lapisan[]; gardu: Lapisan[] };
  loading: boolean;
  error: string | null;
  ulp: string;
  onUlp: (v: string) => void;
  nyala: Set<string>;
  onAlih: (jaringan: Jaringan, kode: string) => void;
  onHanya: (jaringan: Jaringan, kode: string) => void;
  tampilGardu: boolean;
  onTampilGardu: (v: boolean) => void;
  onLompat: (l: Lapisan) => void;
  onTutup: () => void;
}

const FOLDER: { key: Jaringan; judul: string; ikon: typeof Zap; bantu: string }[] = [
  { key: "jtm", judul: "JTM — per penyulang", ikon: Zap, bantu: "Jaringan tegangan menengah" },
  { key: "jtr", judul: "JTR — per gardu", ikon: Waypoints, bantu: "Jaringan tegangan rendah" },
  { key: "gardu", judul: "Gardu", ikon: House, bantu: "Titik gardu distribusi" },
];

export default function PanelLapisan({
  user, perFolder, loading, error, ulp, onUlp,
  nyala, onAlih, onHanya, tampilGardu, onTampilGardu, onLompat, onTutup,
}: Props) {
  const [cari, setCari] = useState("");
  const [buka, setBuka] = useState<Set<Jaringan>>(new Set(["jtm"]));
  const semuaUnit = canSeeAllUnits(user.role);

  const q = cari.trim().toUpperCase();

  /** Pencarian menyapu SEMUA folder sekaligus. Orang yang mengetik "AM005"
   *  tidak sedang memilih kategori — dia sedang mencari sebuah benda. */
  const hasil = useMemo(() => {
    if (!q) return [];
    const semua = [...perFolder.jtm, ...perFolder.jtr, ...perFolder.gardu];
    return semua
      .filter((l) => l.kode.toUpperCase().includes(q) || l.nama.toUpperCase().includes(q))
      .slice(0, 40);
  }, [q, perFolder]);

  const alihFolder = (k: Jaringan) =>
    setBuka((s) => {
      const b = new Set(s);
      if (b.has(k)) b.delete(k); else b.add(k);
      return b;
    });

  return (
    <aside className="w-[280px] shrink-0 h-full flex flex-col bg-sidebar text-white/90 border-r border-sidebar-line">
      <div className="h-[52px] shrink-0 flex items-center gap-2 px-3 border-b border-sidebar-line">
        <Layers size={17} className="text-white/70" />
        <span className="text-sm font-semibold">Lapisan</span>
        <span className="flex-1" />
        <button
          onClick={onTutup}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/60"
          title="Sembunyikan panel"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* Kotak cari di paling atas — bukan di dalam folder. Inilah jalan pintas
          yang membuat panel ini tidak perlu digulir. */}
      <div className="p-3 border-b border-sidebar-line space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari penyulang atau gardu…"
            className="w-full h-8 pl-8 pr-7 rounded-lg bg-white/10 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30"
          />
          {cari && (
            <button
              onClick={() => setCari("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {semuaUnit && (
          <select
            value={ulp}
            onChange={(e) => onUlp(e.target.value)}
            className="w-full h-8 rounded-lg bg-white/10 border border-white/10 px-2 text-xs text-white focus:outline-none focus:border-white/30"
          >
            <option value="">Semua ULP</option>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value} className="text-ink">
                {u.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 p-4 text-xs text-white/50">
            <Loader2 size={14} className="animate-spin" /> Memuat daftar…
          </div>
        )}

        {error && (
          <p className="m-3 p-2.5 rounded-lg bg-red-500/15 border border-red-400/30 text-[11px] text-red-200 leading-relaxed">
            {error}
          </p>
        )}

        {/* ── Hasil pencarian menggantikan pohon selama ada yang diketik ── */}
        {q ? (
          <div className="p-2">
            <p className="px-1.5 pb-1.5 text-[10px] uppercase tracking-wide text-white/40">
              {hasil.length === 0 ? "Tidak ada yang cocok" : `${hasil.length} hasil`}
            </p>
            {hasil.map((l) => (
              <BarisLapisan
                key={`${l.jaringan}-${l.kode}`}
                l={l}
                nyala={nyala.has(`${l.jaringan}:${l.kode}`)}
                onAlih={() => onAlih(l.jaringan, l.kode)}
                onHanya={() => { onHanya(l.jaringan, l.kode); onLompat(l); }}
                onLompat={() => onLompat(l)}
                tampilJenis
              />
            ))}
          </div>
        ) : (
          FOLDER.map(({ key, judul, ikon: Ikon, bantu }) => {
            const isi = perFolder[key];
            const terbuka = buka.has(key);
            return (
              <div key={key} className="border-b border-sidebar-line/60">
                <button
                  onClick={() => alihFolder(key)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 text-left"
                >
                  {terbuka ? (
                    <ChevronDown size={14} className="text-white/40 shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-white/40 shrink-0" />
                  )}
                  <Ikon size={14} className="text-white/60 shrink-0" />
                  <span className="text-[13px] font-medium flex-1 truncate">{judul}</span>
                  <span className="text-[10px] text-white/35 tabular-nums">{isi.length}</span>
                </button>

                {terbuka && (
                  <div className="pb-1.5">
                    {key === "gardu" && (
                      <label className="flex items-center gap-2 px-3 py-1.5 mx-2 mb-1 rounded-lg bg-white/5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tampilGardu}
                          onChange={(e) => onTampilGardu(e.target.checked)}
                          className="accent-white/80"
                        />
                        <span className="text-[11px] text-white/70">
                          Tampilkan semua gardu di layar
                        </span>
                      </label>
                    )}

                    {isi.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-white/35 leading-relaxed">
                        {key === "jtr"
                          ? "Belum ada gardu yang punya tiang JTR di basis ini."
                          : `Belum ada ${bantu.toLowerCase()}.`}
                      </p>
                    ) : (
                      isi
                        .slice(0, 300)
                        .map((l) => (
                          <BarisLapisan
                            key={`${l.jaringan}-${l.kode}`}
                            l={l}
                            nyala={nyala.has(`${l.jaringan}:${l.kode}`)}
                            onAlih={() => onAlih(l.jaringan, l.kode)}
                            onHanya={() => { onHanya(l.jaringan, l.kode); onLompat(l); }}
                            onLompat={() => onLompat(l)}
                          />
                        ))
                    )}

                    {isi.length > 300 && (
                      <p className="px-3 py-2 text-[11px] text-white/40 leading-relaxed">
                        {isi.length - 300} lagi tidak ditampilkan — pakai kotak cari di atas.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function BarisLapisan({
  l, nyala, onAlih, onHanya, onLompat, tampilJenis,
}: {
  l: Lapisan;
  nyala: boolean;
  onAlih: () => void;
  onHanya: () => void;
  onLompat: () => void;
  tampilJenis?: boolean;
}) {
  const adaTitik = l.latMin !== null;

  return (
    <div
      className={`group flex items-center gap-2 pl-3 pr-2 py-1.5 mx-1.5 rounded-lg ${
        nyala ? "bg-white/10" : "hover:bg-white/5"
      }`}
    >
      <input
        type="checkbox"
        checked={nyala}
        onChange={onAlih}
        className="accent-white/80 shrink-0"
        aria-label={`Tampilkan ${l.kode}`}
      />

      {/* Ketukan pada namanya = "cuma ini saja". Itu yang paling sering
          diinginkan: melihat satu penyulang tanpa gangguan yang lain. */}
      <button onClick={onHanya} className="flex-1 min-w-0 text-left" title="Tampilkan ini saja">
        <span className="block text-[12.5px] truncate">{l.kode}</span>
        <span className="block text-[10px] text-white/40 truncate">
          {tampilJenis ? `${l.jaringan.toUpperCase()} · ` : ""}
          {l.nama !== l.kode ? `${l.nama} · ` : ""}
          {l.ulp}
          {l.jumlahTiang > 0 ? ` · ${l.jumlahTiang} tiang` : ""}
        </span>
      </button>

      {adaTitik && (
        <button
          onClick={onLompat}
          className="p-1 rounded text-white/30 opacity-0 group-hover:opacity-100 hover:text-white/80 shrink-0"
          title="Lompat ke sini"
        >
          <Crosshair size={13} />
        </button>
      )}
    </div>
  );
}
