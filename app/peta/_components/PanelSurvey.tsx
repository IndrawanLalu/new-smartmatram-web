"use client";

import { Crosshair, ExternalLink, Loader2, MousePointerClick, PencilRuler, Save, X } from "lucide-react";
import { jumlahBatang, LABEL_ALASAN, type AlasanSurvey } from "@/lib/surveyJaringan";
import type { Penanda } from "../_hooks/usePenandaJtm";
import type { SurveyPetaState } from "../_hooks/useSurveyPeta";
import { BIDANG, GARIS, PANEL } from "../_ui";
import SuntingTitikSurvey from "./SuntingTitikSurvey";
import { WARNA_SURVEY } from "./LapisanSurvey";

/** Kartu Survey Jaringan Baru di kanan peta: judul, mode gambar, isian tiang terpilih, simpan. */

const TOMBOL = "flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-semibold";
const km = (m: number) => `${(m / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kms`;

export default function PanelSurvey({ s, oleh, penanda }: { s: SurveyPetaState; oleh: string; penanda: Map<string, Penanda> }) {
  const terpilih = s.terpilih ? s.perId.get(s.terpilih) : undefined;
  const gardu = s.titik.filter((t) => t.penanda === "gardu").length;
  const langkah =
    s.mode === "sambung"
      ? s.sambung.size === 0
        ? "Nyalakan penyulang JTM di panel kiri, lalu klik tiang tempat jaringan baru menyambung."
        : "Klik tiang JTM yang ada untuk menyambung cabang baru."
      : s.mode === "tambah"
        ? "Klik peta untuk menaruh tiang baru berikutnya. Klik tiang baru mana pun untuk bercabang dari situ."
        : "Klik tiang baru untuk menyunting isiannya; seret untuk menggeser.";

  return (
    <section
      className="w-[340px] max-w-[calc(100vw-1.5rem)] max-h-[78vh] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-2.5 text-[#e2e8f0] text-xs"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <header className="flex items-start gap-2">
        <PencilRuler size={15} className="mt-0.5 shrink-0" style={{ color: WARNA_SURVEY }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Survey Jaringan Baru · JTM</p>
          <p className="text-sm font-semibold truncate">{s.kepala.judul || "Survey baru"}</p>
          <p className="text-gray-400">
            {s.kepala.status}
            {s.kepala.penyulang ? ` · ${s.kepala.penyulang}` : ""}
            {s.berubah ? " · belum disimpan" : ""}
          </p>
        </div>
        <button onClick={s.tutup} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" title="Tutup">
          <X size={15} />
        </button>
      </header>

      {s.memuat ? (
        <p className="flex items-center gap-2 text-gray-400"><Loader2 size={13} className="animate-spin" /> Memuat survey…</p>
      ) : (
        <>
          <input
            value={s.kepala.judul} disabled={!s.draf} onChange={(e) => s.ubahKepala({ judul: e.target.value })}
            placeholder="Judul, mis. Perluasan JTM Dusun Lendang Bila"
            className="w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:border-[#F97316]"
            style={{ background: BIDANG, borderColor: GARIS }}
          />
          <select
            value={s.kepala.alasan} disabled={!s.draf} onChange={(e) => s.ubahKepala({ alasan: e.target.value as AlasanSurvey })}
            className="w-full rounded-lg border px-2 py-1.5 text-xs" style={{ background: BIDANG, borderColor: GARIS }}
          >
            {(Object.keys(LABEL_ALASAN) as AlasanSurvey[]).map((a) => <option key={a} value={a}>{LABEL_ALASAN[a]}</option>)}
          </select>

          <p className="rounded-lg px-2 py-1.5 bg-white/5">
            <b className="text-white">{jumlahBatang(s.titik)}</b> tiang baru · <b className="text-white">{km(s.totalM)}</b>
            {gardu > 0 && <> · <b className="text-white">{gardu}</b> gardu baru</>}
          </p>

          {s.draf && (
            <div className="flex gap-1.5">
              <button
                onClick={() => s.setMode(s.mode === "sambung" ? "lihat" : "sambung")}
                className={`${TOMBOL} ${s.mode === "sambung" ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "border-white/15 hover:bg-white/5"}`}
              >
                <MousePointerClick size={13} /> Sambung ke tiang
              </button>
              <button
                disabled={!s.aktif}
                onClick={() => s.setMode(s.mode === "tambah" ? "lihat" : "tambah")}
                className={`${TOMBOL} disabled:opacity-40 ${s.mode === "tambah" ? "bg-[#F97316] border-[#F97316] text-white" : "border-white/15 hover:bg-white/5"}`}
              >
                <Crosshair size={13} /> Tambah tiang
              </button>
            </div>
          )}
          <p className="text-gray-400">{s.draf ? langkah : `Survey ${s.kepala.status} — gambar terkunci. Buka kembali ke Draf dari daftar survey untuk mengubah.`}</p>

          {terpilih && (
            <SuntingTitikSurvey s={s} t={terpilih} nomor={s.titik.indexOf(terpilih) + 1} penanda={penanda} />
          )}

          {s.galat && <p className="text-[#FCA5A5]">{s.galat}</p>}

          <div className="flex gap-1.5">
            {s.draf && (
              <button
                onClick={() => void s.simpan(oleh)}
                disabled={s.sibuk || !s.berubah}
                className={`${TOMBOL} border-transparent text-white disabled:opacity-40`}
                style={{ background: WARNA_SURVEY }}
              >
                {s.sibuk ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Simpan
              </button>
            )}
            <a href="/admin/survey-jaringan" target="_blank" rel="noopener" className={`${TOMBOL} border-white/15 hover:bg-white/5`}>
              <ExternalLink size={13} /> Daftar survey
            </a>
          </div>
          <p className="text-[10px] text-gray-500">
            Jaringan survey belum menjadi aset — tidak ikut KMS, rekap, maupun inspeksi sampai dioperasikan.
          </p>
        </>
      )}
    </section>
  );
}
