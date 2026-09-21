"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, Crosshair, House, Layers, Loader2,
  PanelLeftClose, Search, Waypoints, X, Zap,
} from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import type { Grup, Jaringan, Lapisan } from "../_hooks/usePetaDaftar";
import { GARIS, INPUT, JUDUL_BAGIAN, WARNA } from "../_ui";
import Centang from "./Centang";

/**
 * Panel lapisan — pohon folder, saringan, dan pencarian.
 *
 * DUA HAL YANG MENENTUKAN BENTUKNYA:
 *
 * 1. Ada 2.092 gardu bertitik di 48 penyulang. Daftar rata sepanjang itu bukan
 *    daftar, itu tumpukan — jadi gardu BERSARANG di bawah penyulangnya, dan
 *    folder Gardu berangkat dari 48 baris alih-alih 2.092. Barisnya baru
 *    digambar saat penyulangnya dibuka, jadi pohon ini murah berapa pun isinya.
 *
 * 2. Menggulir tetap kalah cepat dari mengetik. Kotak cari berdiri di PALING
 *    ATAS dan menyapu semua folder sekaligus: "AM005" langsung memunculkan
 *    gardu itu beserta jaringan JTR-nya, tanpa seorang pun perlu tahu dia ada
 *    di penyulang yang mana.
 *
 * Warnanya menyusul `/admin/peta-gardu` (lihat `../_ui`). Kotak centang mewarisi
 * warna lapisannya, jadi panel ini sekaligus jadi legenda peta.
 */

interface Kotak {
  latMin: number | null;
  latMaks: number | null;
  lngMin: number | null;
  lngMaks: number | null;
}

interface Props {
  user: CurrentUser;
  perFolder: {
    jtm: Lapisan[];
    jtr: Grup[];
    gardu: Grup[];
    jumlahJtr: number;
    jumlahGardu: number;
  };
  semuaLapisan: Lapisan[];
  loading: boolean;
  error: string | null;
  ulp: string;
  onUlp: (v: string) => void;
  nyala: Set<string>;
  onAlih: (jaringan: Jaringan, kode: string) => void;
  onAlihBanyak: (jaringan: Jaringan, kode: string[], nyalakan: boolean) => void;
  onHanya: (jaringan: Jaringan, kode: string | string[]) => void;
  tampilGardu: boolean;
  onTampilGardu: (v: boolean) => void;
  onLompat: (k: Kotak) => void;
  onTutup: () => void;
}

const BATAS_HASIL = 40;

export default function PanelLapisan({
  user, perFolder, semuaLapisan, loading, error, ulp, onUlp,
  nyala, onAlih, onAlihBanyak, onHanya, tampilGardu, onTampilGardu, onLompat, onTutup,
}: Props) {
  const [cari, setCari] = useState("");
  const [folderBuka, setFolderBuka] = useState<Set<Jaringan>>(new Set(["jtm"]));
  const [grupBuka, setGrupBuka] = useState<Set<string>>(new Set());
  const semuaUnit = canSeeAllUnits(user.role);

  const q = cari.trim().toUpperCase();

  const hasil = useMemo(() => {
    if (!q) return [];
    return semuaLapisan
      .filter((l) => l.kode.toUpperCase().includes(q) || l.nama.toUpperCase().includes(q))
      .slice(0, BATAS_HASIL);
  }, [q, semuaLapisan]);

  const alihFolder = (k: Jaringan) =>
    setFolderBuka((s) => {
      const b = new Set(s);
      if (b.has(k)) b.delete(k); else b.add(k);
      return b;
    });

  const alihGrup = (k: string) =>
    setGrupBuka((s) => {
      const b = new Set(s);
      if (b.has(k)) b.delete(k); else b.add(k);
      return b;
    });

  return (
    <aside
      className="w-[248px] shrink-0 h-full flex flex-col text-[#e2e8f0] border-r"
      style={{ background: "#0a1628", borderColor: GARIS }}
    >
      <div
        className="h-[52px] shrink-0 flex items-center gap-2 px-3 border-b"
        style={{ borderColor: GARIS }}
      >
        <Layers size={16} className="text-[#5eead4]" />
        <span className="text-[13px] font-semibold flex-1">Lapisan</span>
        <button
          onClick={onTutup}
          className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-gray-200"
          title="Sembunyikan panel"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* Kotak cari di paling atas — bukan di dalam folder. Inilah jalan pintas
          yang membuat panel ini tidak perlu digulir. */}
      <div className="p-3 border-b space-y-2" style={{ borderColor: GARIS }}>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari penyulang atau gardu…"
            className={`${INPUT} pl-7 pr-7`}
          />
          {cari && (
            <button
              onClick={() => setCari("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {semuaUnit && (
          <select value={ulp} onChange={(e) => onUlp(e.target.value)} className={INPUT}>
            <option value="">Semua ULP</option>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 p-4 text-xs text-gray-400">
            <Loader2 size={13} className="animate-spin" /> Memuat daftar…
          </div>
        )}

        {error && (
          <p className="m-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300 leading-relaxed">
            {error}
          </p>
        )}

        {q ? (
          <div className="p-2">
            <p className={`px-1.5 pb-1.5 ${JUDUL_BAGIAN}`}>
              {hasil.length === 0
                ? "Tidak ada yang cocok"
                : `${hasil.length}${hasil.length === BATAS_HASIL ? "+" : ""} hasil`}
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
          <>
            <Folder
              judul="JTM — per penyulang"
              ikon={Zap}
              warna={WARNA.jtm}
              jumlah={perFolder.jtm.length}
              terbuka={folderBuka.has("jtm")}
              onAlih={() => alihFolder("jtm")}
            >
              {perFolder.jtm.length === 0 ? (
                <Kosong>
                  Belum ada penyulang yang tiangnya disurvei. Barisnya muncul
                  sendiri setelah inspeksi JTM pertama pada sebuah penyulang.
                </Kosong>
              ) : (
                perFolder.jtm.map((l) => (
                  <BarisLapisan
                    key={l.kode}
                    l={l}
                    nyala={nyala.has(`jtm:${l.kode}`)}
                    onAlih={() => onAlih("jtm", l.kode)}
                    onHanya={() => { onHanya("jtm", l.kode); onLompat(l); }}
                    onLompat={() => onLompat(l)}
                  />
                ))
              )}
            </Folder>

            <Folder
              judul="JTR — per gardu"
              ikon={Waypoints}
              warna={WARNA.jtr}
              jumlah={perFolder.jumlahJtr}
              terbuka={folderBuka.has("jtr")}
              onAlih={() => alihFolder("jtr")}
            >
              {perFolder.jtr.length === 0 ? (
                <Kosong>Belum ada gardu yang punya tiang JTR di basis ini.</Kosong>
              ) : (
                perFolder.jtr.map((g) => (
                  <GrupPenyulang
                    key={g.feeder}
                    g={g}
                    jaringan="jtr"
                    warna={WARNA.jtr}
                    terbuka={grupBuka.has(`jtr:${g.feeder}`)}
                    onAlihBuka={() => alihGrup(`jtr:${g.feeder}`)}
                    nyala={nyala}
                    onAlih={onAlih}
                    onAlihBanyak={onAlihBanyak}
                    onHanya={onHanya}
                    onLompat={onLompat}
                  />
                ))
              )}
            </Folder>

            <Folder
              judul="Gardu"
              ikon={House}
              warna={WARNA.gardu}
              jumlah={perFolder.jumlahGardu}
              terbuka={folderBuka.has("gardu")}
              onAlih={() => alihFolder("gardu")}
            >
              {/* Saklar ini hanya berlaku selama tidak ada gardu yang dipilih
                  sendiri — alasannya ada di usePetaIsi. */}
              <label
                className="flex items-center gap-2 px-3 py-1.5 mx-2 mb-1.5 rounded-lg cursor-pointer"
                style={{ background: "#0d1b2a" }}
              >
                <Centang
                  nyala={tampilGardu}
                  onAlih={() => onTampilGardu(!tampilGardu)}
                  warna={WARNA.gardu}
                  label="Tampilkan semua gardu di layar"
                />
                <span className="text-[11px] text-gray-300 leading-snug">
                  Tampilkan semua gardu di layar
                </span>
              </label>

              {perFolder.gardu.map((g) => (
                <GrupPenyulang
                  key={g.feeder}
                  g={g}
                  jaringan="gardu"
                  warna={WARNA.gardu}
                  terbuka={grupBuka.has(`gardu:${g.feeder}`)}
                  onAlihBuka={() => alihGrup(`gardu:${g.feeder}`)}
                  nyala={nyala}
                  onAlih={onAlih}
                  onAlihBanyak={onAlihBanyak}
                  onHanya={onHanya}
                  onLompat={onLompat}
                />
              ))}
            </Folder>
          </>
        )}
      </div>
    </aside>
  );
}

/* ── Bagian-bagian ────────────────────────────────────────────────────────── */

function Kosong({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2 text-[11px] text-gray-500 leading-relaxed">{children}</p>;
}

function Folder({
  judul, ikon: Ikon, warna, jumlah, terbuka, onAlih, children,
}: {
  judul: string;
  ikon: typeof Zap;
  warna: string;
  jumlah: number;
  terbuka: boolean;
  onAlih: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b" style={{ borderColor: `${GARIS}80` }}>
      <button
        onClick={onAlih}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 text-left"
      >
        {terbuka
          ? <ChevronDown size={13} className="text-gray-500 shrink-0" />
          : <ChevronRight size={13} className="text-gray-500 shrink-0" />}
        <Ikon size={13} style={{ color: warna }} className="shrink-0" />
        <span className="text-[12px] font-medium flex-1 truncate text-gray-200">{judul}</span>
        <span className="text-[10px] font-mono text-gray-500 tabular-nums">
          {jumlah.toLocaleString("id-ID")}
        </span>
      </button>
      {terbuka && <div className="pb-1.5">{children}</div>}
    </div>
  );
}

/**
 * Satu penyulang di dalam folder, dengan gardunya bersarang.
 *
 * Centang di baris penyulang menyalakan SELURUH isinya sekaligus. Itu yang
 * paling sering diinginkan — "lihat JTR penyulang Pagutan" — dan tanpa itu
 * orang harus mencentang 163 baris satu per satu.
 */
function GrupPenyulang({
  g, jaringan, warna, terbuka, onAlihBuka, nyala, onAlih, onAlihBanyak, onHanya, onLompat,
}: {
  g: Grup;
  jaringan: Jaringan;
  warna: string;
  terbuka: boolean;
  onAlihBuka: () => void;
  nyala: Set<string>;
  onAlih: (j: Jaringan, k: string) => void;
  onAlihBanyak: (j: Jaringan, k: string[], nyalakan: boolean) => void;
  onHanya: (j: Jaringan, k: string | string[]) => void;
  onLompat: (k: Kotak) => void;
}) {
  const kode = g.isi.map((l) => l.kode);
  const terpilih = kode.filter((k) => nyala.has(`${jaringan}:${k}`)).length;
  const semua = terpilih === kode.length && kode.length > 0;

  return (
    <div>
      <div className="group flex items-center gap-2 pl-2.5 pr-2 py-1.5 mx-1.5 rounded-lg hover:bg-white/5">
        <button
          onClick={onAlihBuka}
          className="shrink-0 text-gray-500 hover:text-gray-300"
          title={terbuka ? "Tutup" : "Buka"}
        >
          {terbuka ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <Centang
          nyala={semua}
          onAlih={() => onAlihBanyak(jaringan, kode, !semua)}
          warna={warna}
          ukuran={13}
          label={`Tampilkan semua ${g.feeder}`}
        />

        <button
          onClick={() => { onHanya(jaringan, kode); onLompat(g); }}
          className="flex-1 min-w-0 text-left"
          title="Tampilkan penyulang ini saja"
        >
          <span className="block text-[11.5px] truncate text-gray-200">{g.feeder}</span>
        </button>

        <span className="text-[10px] font-mono text-gray-500 tabular-nums shrink-0">
          {terpilih > 0 && terpilih < kode.length ? `${terpilih}/` : ""}
          {kode.length}
        </span>
      </div>

      {terbuka && (
        <div className="ml-4 border-l" style={{ borderColor: GARIS }}>
          {g.isi.map((l) => (
            <BarisLapisan
              key={l.kode}
              l={l}
              nyala={nyala.has(`${jaringan}:${l.kode}`)}
              onAlih={() => onAlih(jaringan, l.kode)}
              onHanya={() => { onHanya(jaringan, l.kode); onLompat(l); }}
              onLompat={() => onLompat(l)}
              rapat
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BarisLapisan({
  l, nyala, onAlih, onHanya, onLompat, tampilJenis, rapat,
}: {
  l: Lapisan;
  nyala: boolean;
  onAlih: () => void;
  onHanya: () => void;
  onLompat: () => void;
  tampilJenis?: boolean;
  rapat?: boolean;
}) {
  const adaTitik = l.latMin !== null;

  return (
    <div
      className={`group flex items-center gap-2 pr-2 rounded-lg ${
        rapat ? "pl-2 ml-1 mr-1.5 py-1" : "pl-3 mx-1.5 py-1.5"
      } ${nyala ? "bg-white/[0.07]" : "hover:bg-white/5"}`}
    >
      <Centang
        nyala={nyala}
        onAlih={onAlih}
        warna={WARNA[l.jaringan]}
        ukuran={13}
        label={`Tampilkan ${l.kode}`}
      />

      {/* Ketukan pada namanya = "cuma ini saja". Itu yang paling sering
          diinginkan: melihat satu benda tanpa gangguan yang lain. */}
      <button onClick={onHanya} className="flex-1 min-w-0 text-left" title="Tampilkan ini saja">
        <span className="block text-[11.5px] truncate text-gray-200">{l.kode}</span>
        <span className="block text-[10px] text-gray-500 truncate">
          {tampilJenis ? `${l.jaringan.toUpperCase()} · ` : ""}
          {l.nama !== l.kode ? `${l.nama} · ` : ""}
          {l.jumlahTiang > 0 ? `${l.jumlahTiang} tiang` : l.ulp}
        </span>
      </button>

      {adaTitik && (
        <button
          onClick={onLompat}
          className="p-1 rounded text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gray-200 shrink-0"
          title="Lompat ke sini"
        >
          <Crosshair size={12} />
        </button>
      )}
    </div>
  );
}
