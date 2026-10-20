"use client";

import { Crosshair, Loader2, Wrench, X } from "lucide-react";
import { LABEL_RENCANA, namaOpsi, type NadaOpsi } from "@/app/admin/pengukuran-gardu/_lib/rencanaJtr";
import type { OpsiPeta, RencanaPetaState } from "../_hooks/useRencanaPeta";
import { GARIS, PANEL } from "../_ui";
import { WARNA_PINDAH } from "./LapisanRencana";

/** Kartu rencana perbaikan JTR di kanan peta (dari Analisis JTR). */

const NADA: Record<NadaOpsi, string> = { aman: "text-[#6EE7B7]", mendekati: "text-[#FCD34D]", lewat: "text-[#FCA5A5]" };
const m = (v: number) => `${Math.round(v).toLocaleString("id-ID")} m`;
const a = (v: number) => `${Math.round(v)} A`;

function RincianOpsi({ o }: { o: OpsiPeta }) {
  return (
    <div className="rounded-lg bg-white/5 p-2 space-y-1">
      <p className="font-semibold">{namaOpsi(o)}</p>
      <p className="text-gray-300">
        Kabel baru <b className="text-white">{m(o.kabelBaru)}</b> · jurusan baru <b className="text-white">{a(o.iBaru)}</b> · lama{" "}
        <b className="text-white">{a(o.iLama)}</b>
      </p>
      <p className="text-gray-400">
        Pindah {o.srPindah} SR · {o.tiangPindah} tiang · terjauh {m(o.jauhBaru)} / {m(o.jauhLama)} · tegangan turun ±{o.turunPct}%
      </p>
      {o.pemerataan && <p className="text-[#FCD34D]">Berlaku bila fasa diratakan sekalian.</p>}
      {o.peringatan.map((p) => <p key={p} className={NADA[o.nada]}>{p}</p>)}
    </div>
  );
}

export default function PanelRencana({ s }: { s: RencanaPetaState }) {
  if (!s.buka) return null;
  const { data, galat } = s;
  const r = data?.rencana;
  const aktif = data?.opsi.find((o) => o.kunci === s.terpilih);
  return (
    <section
      className="w-[330px] max-w-[calc(100vw-1.5rem)] max-h-[70vh] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-2.5 text-[#e2e8f0] text-xs"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <header className="flex items-start gap-2">
        <Wrench size={15} className="text-[#C4B5FD] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Rencana perbaikan</p>
          <p className="text-sm font-semibold">
            {s.buka.gardu.toUpperCase()} · jurusan {s.buka.jurusan}
          </p>
        </div>
        <button onClick={s.tutup} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" title="Tutup">
          <X size={15} />
        </button>
      </header>

      {galat ? (
        <p className="text-[#FCA5A5]">{galat}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-gray-400"><Loader2 size={13} className="animate-spin" /> Menghitung…</p>
      ) : !r ? (
        <p className="text-gray-300">Jurusan ini tidak perlu tindakan menurut batas yang berlaku.</p>
      ) : (
        <>
          <div>
            <p className="font-semibold text-[#C4B5FD]">{LABEL_RENCANA[r.jenis]}</p>
            <p className="text-gray-300">{r.ringkas}</p>
          </div>
          {!data.opsi.length && r.rinci.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-gray-300">
              {r.rinci.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}

          {data.opsi.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                {r.jenis === "sisip" ? "Bila tetap tambah jurusan" : "Pilihan titik pecah"}
              </p>
              {data.opsi.map((o) => (
                <button
                  key={o.kunci}
                  onClick={() => s.pilih(o.kunci)}
                  className={`w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 ${o.kunci === s.terpilih ? "bg-[#7C3AED]/30" : "hover:bg-white/5"}`}
                >
                  <span className="w-5 h-5 shrink-0 grid place-items-center rounded-full bg-white/10 font-bold">{o.nomor}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">{o.label.join(" · ")}</span>
                    <span className="block text-gray-400">
                      {m(o.kabelBaru)} · {a(o.iBaru)} + {a(o.iLama)} <span className={NADA[o.nada]}>●</span>
                    </span>
                  </span>
                </button>
              ))}
              {aktif && <RincianOpsi o={aktif} />}
            </div>
          )}

          {(r.jenis === "tambah-jurusan" || r.jenis === "sisip") && data.tiang.length > 0 ? (
            <button
              onClick={() => s.setModePilih(!s.modePilih)}
              className={`w-full flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-semibold ${s.modePilih ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "border-white/15 hover:bg-white/5"}`}
            >
              <Crosshair size={13} /> {s.modePilih ? "Klik tiang di peta… (batal)" : "Pilih titik pecah di peta"}
            </button>
          ) : null}
          {s.pesan && <p className="text-[#FCD34D]">{s.pesan}</p>}

          {data.pindah.length > 0 && (
            <p className="flex items-center gap-2 text-gray-400">
              <span className="inline-block w-6 h-1.5 rounded-full" style={{ background: WARNA_PINDAH }} />
              {r.jenis === "sisip" && !aktif ? "beban yang pindah ke gardu sisip" : "beban yang pindah ke jurusan baru"}
            </p>
          )}
          {r.catatan.map((x) => <p key={x} className="text-[#FCD34D]">{x}</p>)}
          <p className="text-[10px] text-gray-500">Perkiraan dari tarikan SR — pastikan di lapangan.</p>
        </>
      )}
    </section>
  );
}
