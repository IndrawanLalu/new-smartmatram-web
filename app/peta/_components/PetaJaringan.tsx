"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Loader2, PanelLeftOpen, TriangleAlert } from "lucide-react";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { usePetaDaftar, type Jaringan, type Lapisan } from "../_hooks/usePetaDaftar";
import { usePetaIsi, ZOOM_GARDU, ZOOM_TIANG, type Kotak } from "../_hooks/usePetaIsi";
import PanelLapisan from "./PanelLapisan";

const PetaInner = dynamic(() => import("./PetaInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-[#0b1220] text-white/50 text-sm gap-2">
      <Loader2 size={20} className="animate-spin" />
      Menyiapkan peta…
    </div>
  ),
});

export default function PetaJaringan({ user }: { user: CurrentUser }) {
  const [ulp, setUlp] = useState(canSeeAllUnits(user.role) ? "" : (user.unit ?? ""));
  const [nyala, setNyala] = useState<Set<string>>(new Set());
  const [tampilGardu, setTampilGardu] = useState(true);
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const [fokus, setFokus] = useState<[[number, number], [number, number]] | null>(null);
  const [panel, setPanel] = useState(true);

  const { perFolder, loading, error } = usePetaDaftar(ulp || null);

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

  const hanya = useCallback((jaringan: Jaringan, kode: string) => {
    setNyala(new Set([`${jaringan}:${kode}`]));
  }, []);

  const lompat = useCallback((l: Lapisan) => {
    if (l.latMin === null || l.latMaks === null || l.lngMin === null || l.lngMaks === null) return;
    setFokus([
      [l.latMin, l.lngMin],
      [l.latMaks, l.lngMaks],
    ]);
  }, []);

  const zoom = kotak?.zoom ?? 0;
  const objek = rute.reduce((n, r) => n + r.bentang.length, 0) + tiang.length * 2 + gardu.length;

  return (
    <div className="h-full flex">
      {panel ? (
        <PanelLapisan
          user={user}
          perFolder={perFolder}
          loading={loading}
          error={error}
          ulp={ulp}
          onUlp={(v) => { setUlp(v); setNyala(new Set()); }}
          nyala={nyala}
          onAlih={alih}
          onHanya={hanya}
          tampilGardu={tampilGardu}
          onTampilGardu={setTampilGardu}
          onLompat={lompat}
          onTutup={() => setPanel(false)}
        />
      ) : (
        <button
          onClick={() => setPanel(true)}
          className="absolute z-[1100] top-3 left-3 h-9 px-3 rounded-xl bg-navy-900 text-white/90 text-sm font-medium shadow-lg ring-1 ring-white/15 flex items-center gap-2"
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
        <div className="absolute z-[1000] bottom-3 left-3 flex items-center gap-2 text-[11px]">
          <div className="rounded-lg bg-black/70 text-white/80 px-2.5 py-1.5 backdrop-blur-sm flex items-center gap-2 tabular-nums">
            {sibuk && <Loader2 size={11} className="animate-spin" />}
            <span>zoom {zoom}</span>
            <span className="text-white/30">|</span>
            <span>{objek.toLocaleString("id-ID")} objek</span>
            {tiang.length > 0 && <span className="text-white/50">{tiang.length} tiang</span>}
            {gardu.length > 0 && <span className="text-white/50">{gardu.length} gardu</span>}
          </div>

          {zoom < ZOOM_TIANG && nyala.size > 0 && (
            <div className="rounded-lg bg-black/70 text-white/70 px-2.5 py-1.5 backdrop-blur-sm">
              {zoom < ZOOM_GARDU
                ? "Perbesar untuk melihat gardu"
                : `Perbesar ke zoom ${ZOOM_TIANG} untuk melihat tiang`}
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
          className="absolute z-[1000] top-3 right-3 h-9 px-3 rounded-xl bg-black/70 text-white/85 text-sm font-medium backdrop-blur-sm flex items-center gap-2 hover:bg-black/80"
        >
          <ArrowLeft size={15} /> Kembali
        </Link>

        {nyala.size === 0 && !loading && (
          <div className="absolute z-[1000] inset-x-0 top-1/2 -translate-y-1/2 grid place-items-center pointer-events-none">
            <p className="rounded-xl bg-black/70 text-white/80 text-sm px-4 py-3 max-w-sm text-center leading-relaxed backdrop-blur-sm">
              Pilih penyulang atau gardu di panel kiri — atau ketik namanya di kotak cari.
              <span className="block text-white/50 text-xs mt-1">
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
