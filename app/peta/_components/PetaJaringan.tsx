"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Loader2, PanelLeftOpen, TriangleAlert } from "lucide-react";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { usePetaDaftar, type Jaringan } from "../_hooks/usePetaDaftar";
import { usePetaIsi, ZOOM_GARDU, ZOOM_TIANG, type Kotak } from "../_hooks/usePetaIsi";
import { GARIS, PANEL } from "../_ui";
import PanelLapisan from "./PanelLapisan";

const PetaInner = dynamic(() => import("./PetaInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-[#0b1220] text-gray-500 text-sm gap-2">
      <Loader2 size={20} className="animate-spin" />
      Menyiapkan peta…
    </div>
  ),
});

/** Kotak batas apa pun yang bisa dilompati — penyulang, gardu, atau satu grup. */
interface Batas {
  latMin: number | null;
  latMaks: number | null;
  lngMin: number | null;
  lngMaks: number | null;
}

export default function PetaJaringan({ user }: { user: CurrentUser }) {
  const [ulp, setUlp] = useState(canSeeAllUnits(user.role) ? "" : (user.unit ?? ""));
  const [nyala, setNyala] = useState<Set<string>>(new Set());
  // Padam saat halaman dibuka, sama seperti lapisan lain. Peta ini berangkat
  // kosong dengan sengaja — yang muncul di layar adalah yang DIMINTA, bukan
  // yang kebetulan tersedia. Saklar yang menyala sendiri membuat 2.092 gardu
  // jadi latar tetap yang harus dimatikan lebih dulu tiap kali orang ingin
  // melihat satu penyulang dengan tenang.
  const [tampilGardu, setTampilGardu] = useState(false);
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const [fokus, setFokus] = useState<[[number, number], [number, number]] | null>(null);
  const [panel, setPanel] = useState(true);

  const { perFolder, semuaLapisan, loading, error } = usePetaDaftar(ulp || null);

  const pilihan = useMemo(
    () =>
      [...nyala].map((k) => {
        const [jaringan, ...sisa] = k.split(":");
        return { jaringan: jaringan as Jaringan, kode: sisa.join(":") };
      }),
    [nyala],
  );

  const { rute, tiang, gardu, sibuk, terpotong } = usePetaIsi(kotak, pilihan, tampilGardu);

  const alih = useCallback((jaringan: Jaringan, kode: string) => {
    setNyala((s) => {
      const b = new Set(s);
      const k = `${jaringan}:${kode}`;
      if (b.has(k)) b.delete(k); else b.add(k);
      return b;
    });
  }, []);

  /** Menyalakan atau memadamkan satu penyulang penuh sekaligus. */
  const alihBanyak = useCallback((jaringan: Jaringan, kode: string[], nyalakan: boolean) => {
    setNyala((s) => {
      const b = new Set(s);
      for (const k of kode) {
        if (nyalakan) b.add(`${jaringan}:${k}`);
        else b.delete(`${jaringan}:${k}`);
      }
      return b;
    });
  }, []);

  const hanya = useCallback((jaringan: Jaringan, kode: string | string[]) => {
    const daftar = Array.isArray(kode) ? kode : [kode];
    setNyala(new Set(daftar.map((k) => `${jaringan}:${k}`)));
  }, []);

  const lompat = useCallback((b: Batas) => {
    if (b.latMin === null || b.latMaks === null || b.lngMin === null || b.lngMaks === null) return;
    setFokus([
      [b.latMin, b.lngMin],
      [b.latMaks, b.lngMaks],
    ]);
  }, []);

  const zoom = kotak?.zoom ?? 0;
  const objek = rute.reduce((n, r) => n + r.bentang.length, 0) + tiang.length * 2 + gardu.length;
  const adaGarduPilihan = pilihan.some((p) => p.jaringan === "gardu");
  const adaJaringan = pilihan.some((p) => p.jaringan !== "gardu");

  return (
    <div className="h-full flex">
      {panel ? (
        <PanelLapisan
          user={user}
          perFolder={perFolder}
          semuaLapisan={semuaLapisan}
          loading={loading}
          error={error}
          ulp={ulp}
          onUlp={(v) => { setUlp(v); setNyala(new Set()); }}
          nyala={nyala}
          onAlih={alih}
          onAlihBanyak={alihBanyak}
          onHanya={hanya}
          tampilGardu={tampilGardu}
          onTampilGardu={setTampilGardu}
          onLompat={lompat}
          onTutup={() => setPanel(false)}
        />
      ) : (
        <button
          onClick={() => setPanel(true)}
          className="absolute z-[1100] top-3 left-3 h-9 px-3 rounded-xl text-[#e2e8f0] text-sm font-medium shadow-lg flex items-center gap-2 border"
          style={{ background: PANEL, borderColor: GARIS }}
        >
          <PanelLeftOpen size={16} /> Lapisan
        </button>
      )}

      <div className="flex-1 min-w-0 relative">
        <PetaInner rute={rute} tiang={tiang} gardu={gardu} fokus={fokus} onKotak={setKotak} />

        {/* ── Bilah keadaan ──────────────────────────────────────────────────
            Penghitung objek berdiri di sini SEJAK AWAL, bukan ditambahkan
            kalau nanti terasa berat. Waktu peta melambat, yang pertama
            dibutuhkan adalah angka — bukan tebakan tentang lapisan mana yang
            bocor. */}
        <div className="absolute z-[1000] bottom-3 left-3 flex flex-wrap items-center gap-2 text-[11px] max-w-[calc(100%-1.5rem)]">
          <div
            className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm flex items-center gap-2 tabular-nums font-mono text-gray-300 border"
            style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
          >
            {sibuk && <Loader2 size={11} className="animate-spin text-[#5eead4]" />}
            <span>zoom {zoom}</span>
            <span className="text-gray-600">|</span>
            <span>{objek.toLocaleString("id-ID")} objek</span>
            {tiang.length > 0 && <span className="text-gray-500">{tiang.length} tiang</span>}
            {gardu.length > 0 && <span className="text-gray-500">{gardu.length} gardu</span>}
          </div>

          {adaJaringan && zoom < ZOOM_TIANG && (
            <div
              className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm text-gray-400 border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Perbesar ke zoom {ZOOM_TIANG} untuk melihat tiang satu per satu
            </div>
          )}

          {!adaGarduPilihan && tampilGardu && zoom < ZOOM_GARDU && (
            <div
              className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm text-gray-400 border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Perbesar untuk melihat gardu — atau centang penyulangnya di folder Gardu
            </div>
          )}

          {terpotong && (
            <div className="rounded-lg bg-amber-500/90 text-white px-2.5 py-1.5 flex items-center gap-1.5">
              <TriangleAlert size={12} />
              Terlalu banyak tiang di layar — sebagian tidak digambar
            </div>
          )}
        </div>

        <Link
          href="/admin/dashboard"
          className="absolute z-[1000] top-3 right-3 h-9 px-3 rounded-xl text-[#e2e8f0] text-sm font-medium backdrop-blur-sm flex items-center gap-2 border hover:bg-white/5"
          style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
        >
          <ArrowLeft size={15} /> Kembali
        </Link>

        {nyala.size === 0 && !loading && (
          <div className="absolute z-[1000] inset-x-0 top-1/2 -translate-y-1/2 grid place-items-center pointer-events-none px-4">
            <p
              className="rounded-xl text-gray-300 text-sm px-4 py-3 max-w-sm text-center leading-relaxed backdrop-blur-sm border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Pilih penyulang atau gardu di panel kiri — atau ketik namanya di kotak cari.
              <span className="block text-gray-500 text-xs mt-1">
                Peta sengaja dibuka kosong supaya tidak menarik puluhan ribu titik yang belum
                tentu Anda butuhkan.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
