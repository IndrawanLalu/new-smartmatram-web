"use client";

import { useState } from "react";
import { ChevronRight, Crosshair, Loader2, X } from "lucide-react";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import type { GarduJanggal, KelompokBeda, useGarduJanggal } from "../_hooks/useGarduJanggal";
import { GARIS, JUDUL_BAGIAN, PANEL } from "../_ui";
import { TOMBOL_PANEL } from "./InfoTiang";

/**
 * Panel "Gardu janggal" (kelompok Gardu di /peta, 10 Okt 2026).
 *   Penyulang beda — master gardu menyebut penyulang lain dari yang lewat
 *                    tiangnya; "Samakan" mengubah MASTER ikut tiang, per
 *                    kelompok atau satu-satu.
 *   Kode ganda     — satu kode di beberapa tiang; dibetulkan di panel tiang.
 */

interface Props {
  g: ReturnType<typeof useGarduJanggal>;
  boleh: boolean;
  onLompat: (lat: number, lng: number) => void;
  onBuka: (r: GarduJanggal) => void;
}

interface Tanya { kode: string[]; ulpMaster: string; penyulang: string; judul: string }

interface BarisProps {
  r: GarduJanggal;
  tombol?: React.ReactNode;
  onLompat: (lat: number, lng: number) => void;
  onBuka: (r: GarduJanggal) => void;
}

function BarisJanggal({ r, tombol, onLompat, onBuka }: BarisProps) {
  return (
    <li className="px-3 py-2 space-y-1">
      <div className="flex items-center gap-2">
        <button onClick={() => onLompat(r.lat, r.lng)} className="text-gray-400 hover:text-white" aria-label={`Lihat ${r.tiang_kode} di peta`}>
          <Crosshair size={13} />
        </button>
        <span className="font-semibold text-[#e2e8f0]">{r.gardu_kode}</span>
        <button onClick={() => onBuka(r)} className="flex-1 min-w-0 truncate text-left text-gray-400 hover:text-white" title={`Buka tiang ${r.tiang_kode}`}>
          {r.tiang_kode}
        </button>
        {tombol}
      </div>
      {r.lain && <p className="pl-5 text-[11px] text-gray-500">juga di {r.lain}</p>}
    </li>
  );
}

interface KelompokProps {
  k: KelompokBeda;
  terbuka: boolean;
  onAlih: () => void;
  boleh: boolean;
  sibuk: boolean;
  onTanya: (t: Tanya) => void;
  onLompat: (lat: number, lng: number) => void;
  onBuka: (r: GarduJanggal) => void;
}

function KelompokBedaKartu({ k, terbuka, onAlih, boleh, sibuk, onTanya, onLompat, onBuka }: KelompokProps) {
  const ulpBeda = k.ulpMaster && k.baris[0] && k.ulpMaster !== k.baris[0].ulp;
  const bisa = boleh && !!k.tiang && !!k.ulpMaster;
  const tanya = (kode: string[], judul: string) => onTanya({ kode, ulpMaster: k.ulpMaster!, penyulang: k.tiang!, judul });
  return (
    <div className="rounded-lg border" style={{ borderColor: GARIS }}>
      <button onClick={onAlih} className="w-full px-3 py-2 flex items-center gap-2 text-left">
        <ChevronRight size={14} className={`text-gray-500 transition-transform ${terbuka ? "rotate-90" : ""}`} />
        <span className="flex-1 min-w-0 text-[#e2e8f0]">
          master <b className="text-[#FB7185]">{k.master ?? "(kosong)"}</b> → tiang <b className="text-[#5eead4]">{k.tiang ?? "?"}</b>
          {ulpBeda && <span className="block text-[10px] text-amber-300">gardu ULP {k.ulpMaster} di master</span>}
        </span>
        <span className="tabular-nums text-gray-400">{k.baris.length}</span>
      </button>
      {terbuka && (
        <>
          {bisa && (
            <div className="px-3 pb-2">
              <button
                onClick={() => tanya(k.baris.map((r) => r.gardu_kode), `Samakan ${k.baris.length} gardu: master ${k.master ?? "(kosong)"} → ${k.tiang}?`)}
                disabled={sibuk}
                className={`${TOMBOL_PANEL} w-full justify-center border-[#00897B] text-[#5eead4]`}
              >
                Samakan master ke {k.tiang} ({k.baris.length})
              </button>
            </div>
          )}
          <ul className="divide-y divide-[#1e3552] border-t" style={{ borderColor: GARIS }}>
            {k.baris.map((r) => (
              <BarisJanggal
                key={r.tiang_id}
                r={r}
                onLompat={onLompat}
                onBuka={onBuka}
                tombol={bisa && (
                  <button
                    onClick={() => tanya([r.gardu_kode], `Samakan ${r.gardu_kode}: master ${k.master ?? "(kosong)"} → ${k.tiang}?`)}
                    disabled={sibuk}
                    className="px-2 py-0.5 rounded border border-[#00897B] text-[#5eead4] hover:bg-[#00897B]/20"
                  >
                    Samakan
                  </button>
                )}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function PanelGarduJanggal({ g, boleh, onLompat, onBuka }: Props) {
  const [tab, setTab] = useState<"beda" | "ganda">("beda");
  const [buka, setBuka] = useState<string | null>(null);
  const [tanya, setTanya] = useState<Tanya | null>(null);
  const jumlahBeda = g.beda.reduce((a, k) => a + k.baris.length, 0);

  const tabKelas = (on: boolean) =>
    `flex-1 py-1.5 rounded-lg text-xs font-semibold border ${on ? "border-[#F59E0B] bg-[#F59E0B]/20 text-[#e2e8f0]" : "border-[#1e3552] text-gray-400"}`;

  return (
    <aside
      className="absolute z-[1100] top-14 right-3 bottom-3 w-[340px] max-w-[calc(100%-1.5rem)] rounded-xl border shadow-2xl flex flex-col"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b" style={{ borderColor: GARIS }}>
        <div className="flex-1 min-w-0">
          <p className={JUDUL_BAGIAN}>Gardu</p>
          <p className="text-[#e2e8f0] font-semibold text-base">Gardu janggal</p>
        </div>
        {g.sibuk && <Loader2 size={15} className="animate-spin text-gray-400 mt-1" />}
        <button onClick={() => g.setAktif(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" aria-label="Tutup">
          <X size={16} />
        </button>
      </div>

      <div className="px-4 pt-3 space-y-3 overflow-y-auto flex-1 pb-4 text-xs">
        <div className="flex gap-2">
          <button onClick={() => setTab("beda")} className={tabKelas(tab === "beda")}>Penyulang beda ({jumlahBeda})</button>
          <button onClick={() => setTab("ganda")} className={tabKelas(tab === "ganda")}>Kode ganda ({g.ganda.length})</button>
        </div>

        {tab === "beda" ? (
          <>
            <p className="text-[11px] text-gray-500">
              Penyulang di master gardu bukan penyulang yang lewat tiangnya. <b>Samakan</b> mengubah master gardu mengikuti tiang
              (tercatat di riwayat). Kalau justru kode gardu di tiangnya yang salah, buka tiangnya dan ganti kodenya.
            </p>
            {g.beda.length === 0 ? <p className="text-gray-400">Tidak ada.</p> : g.beda.map((k) => (
                <KelompokBedaKartu
                  key={k.kunci}
                  k={k}
                  terbuka={buka === k.kunci}
                  onAlih={() => setBuka(buka === k.kunci ? null : k.kunci)}
                  boleh={boleh}
                  sibuk={g.sibuk}
                  onTanya={setTanya}
                  onLompat={onLompat}
                  onBuka={onBuka}
                />
              ))}
          </>
        ) : (
          <>
            <p className="text-[11px] text-gray-500">
              Satu kode gardu tercatat di beberapa tiang. Buka tiang yang salah lalu ganti kode gardunya — atau, kalau jaraknya
              beberapa meter, mungkin gardu portal: jadikan pasangan portal.
            </p>
            {g.ganda.length === 0 ? (
              <p className="text-gray-400">Tidak ada.</p>
            ) : (
              g.ganda.map((x) => (
                <ul key={x.kode} className="rounded-lg border divide-y divide-[#1e3552]" style={{ borderColor: GARIS }}>
                  {x.baris.map((r) => (
                    <BarisJanggal key={r.tiang_id} r={r} onLompat={onLompat} onBuka={onBuka} tombol={<span className="text-gray-500 truncate max-w-[90px]">{r.penyulang_tiang}</span>} />
                  ))}
                </ul>
              ))
            )}
          </>
        )}
      </div>

      {tanya && (
        <ConfirmDialog
          title={tanya.judul}
          message="Penyulang gardu di master gardu diganti mengikuti penyulang tiangnya. Nilai lama tercatat di riwayat koreksi."
          confirmLabel="Samakan"
          tone="primary"
          onConfirm={async () => {
            const t = tanya;
            setTanya(null);
            await g.samakan(t.kode, t.ulpMaster, t.penyulang);
          }}
          onClose={() => setTanya(null)}
        />
      )}
    </aside>
  );
}
