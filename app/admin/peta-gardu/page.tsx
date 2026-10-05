"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Tags } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { FIELD } from "@/app/admin/_ui";
import { lepas } from "@/lib/sld";
import { usePenandaJtm } from "@/app/peta/_hooks/usePenandaJtm";
import { usePetaSld } from "./_hooks/usePetaSld";
import DaftarPenyulang, { angka } from "./_components/DaftarPenyulang";
import RingkasSldPanel from "./_components/RingkasSldPanel";
import HasilLepasPanel from "./_components/HasilLepasPanel";

/**
 * Peta SLD — diagram garis tunggal di atas peta, diringkas dari master tiang
 * (`lib/sld.ts`). Rencana: `rencana-peta-sld.md`. Menggantikan Peta Aset
 * (alat gambar lama tabel `jalur`), route tetap supaya hak menu tidak berubah.
 */

const PetaSldInner = dynamic(() => import("./_components/PetaSldInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full grid place-items-center text-sm text-ink-muted gap-2">
      <Loader2 size={18} className="animate-spin" /> Menyiapkan peta…
    </div>
  ),
});

const PALET = ["#2563EB", "#9333EA", "#0891B2", "#CA8A04", "#DB2777", "#059669", "#EA580C", "#4F46E5"];

export default function PetaSldPage() {
  const user = useCurrentUser();
  const semuaUnit = canSeeAllUnits(user.role);
  const [ulp, setUlp] = useState(semuaUnit ? "" : (user.unit ?? ""));
  const sld = usePetaSld(semuaUnit ? ulp || null : (user.unit ?? null));
  const penanda = usePenandaJtm();
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [sim, setSim] = useState<{ penyulang: string; id: string } | null>(null);
  const [label, setLabel] = useState(false);

  const warna = useMemo(
    () => new Map(sld.ringkas.map((r, i) => [r.penyulang, PALET[i % PALET.length]])),
    [sld.ringkas],
  );
  const grafTampil = useMemo(
    () => [...dipilih].map((p) => sld.graf.get(p)).filter((g) => g !== undefined),
    [dipilih, sld.graf],
  );
  const grafSim = sim ? sld.graf.get(sim.penyulang) : undefined;
  const hasil = useMemo(() => (grafSim && sim ? lepas(grafSim, sim.id) : null), [grafSim, sim]);
  const simpulSim = sim ? grafSim?.simpul.get(sim.id) : undefined;

  const alih = (p: string) => {
    const b = new Set(dipilih);
    if (b.has(p)) {
      b.delete(p);
      if (sim?.penyulang === p) setSim(null);
    } else {
      b.add(p);
      void sld.muat(p);
    }
    setDipilih(b);
  };

  const unduh = async () => {
    if (!hasil || !simpulSim || !sim) return;
    const { unduhGarduPadam } = await import("@/lib/sldExcel");
    const nama = simpulSim.jenis === "pangkal" ? `Penyulang ${sim.penyulang}` : `${simpulSim.kode} (${sim.penyulang})`;
    await unduhGarduPadam(
      `GARDU PADAM — SIMULASI LEPAS ${nama.toUpperCase()}`,
      `${angka(hasil.km, 2)} kms · ${hasil.gardu.length} gardu · beban dari pengukuran terakhir`,
      hasil.gardu.map((k) => sld.gardu.get(k) ?? { kode: k, nama: null, daya: null, bebanKva: null, persen: null, tglUkur: null }),
      `simulasi-lepas-${(simpulSim.jenis === "pangkal" ? sim.penyulang : simpulSim.kode).replace(/[^A-Za-z0-9-]+/g, "_")}.xlsx`,
    );
  };

  return (
    <div className="flex h-[calc(100vh-var(--topbar-h))] -m-6 text-ink">
      <aside className="w-[300px] shrink-0 bg-white border-r border-line flex flex-col min-h-0">
        {semuaUnit && (
          <div className="p-3 border-b border-line">
            <select value={ulp} onChange={(e) => { setUlp(e.target.value); setDipilih(new Set()); setSim(null); }} className={`${FIELD} w-full`}>
              <option value="">Semua ULP</option>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        )}
        <DaftarPenyulang ringkas={sld.ringkas} memuatDaftar={sld.memuatDaftar} dipilih={dipilih}
          memuat={sld.memuat} warna={warna} onAlih={alih} />
      </aside>

      <div className="flex-1 min-w-0 relative">
        <PetaSldInner graf={grafTampil} warna={warna} gardu={sld.gardu} penanda={penanda}
          padam={hasil?.padam ?? null} terpilih={sim?.id ?? null} label={label}
          onPilih={(penyulang, id) => setSim({ penyulang, id })} />
        <button onClick={() => setLabel((v) => !v)}
          className={`absolute top-3 right-3 z-[1000] h-8 px-3 rounded-lg border text-xs font-semibold shadow-sm inline-flex items-center gap-1.5 ${
            label ? "bg-navy-600 border-navy-600 text-white" : "bg-white border-line text-ink"}`}>
          <Tags size={13} /> Label
        </button>
        {dipilih.size === 0 && (
          <div className="absolute inset-0 z-[999] grid place-items-center pointer-events-none">
            <p className="bg-white/95 rounded-xl border border-line shadow-sm px-4 py-3 text-sm text-ink-soft max-w-sm text-center">
              Pilih penyulang di kiri. Klik <b>pangkal</b> atau <b>keypoint</b> di peta untuk simulasi lepas.
            </p>
          </div>
        )}
      </div>

      {dipilih.size > 0 && (
        <aside className="w-[340px] shrink-0 bg-white border-l border-line overflow-y-auto p-3 space-y-3">
          {hasil && simpulSim && sim && (
            <HasilLepasPanel penyulang={sim.penyulang} simpul={simpulSim}
              labelPenanda={simpulSim.penanda ? penanda.get(simpulSim.penanda)?.label ?? simpulSim.penanda : "keypoint"}
              hasil={hasil} gardu={sld.gardu}
              onPilihKeypoint={(id) => setSim({ penyulang: sim.penyulang, id })}
              onUnduh={() => void unduh()} onTutup={() => setSim(null)} />
          )}
          {grafTampil.map((g) => (
            <RingkasSldPanel key={g.penyulang} graf={g} ringkas={sld.ringkas.find((r) => r.penyulang === g.penyulang)}
              warna={warna.get(g.penyulang) ?? "#64748B"} gardu={sld.gardu} penanda={penanda}
              onLepasPangkal={() => setSim({ penyulang: g.penyulang, id: g.akar[0] })} />
          ))}
        </aside>
      )}
    </div>
  );
}
