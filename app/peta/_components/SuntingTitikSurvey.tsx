"use client";

import { Trash2 } from "lucide-react";
import { bawaJtm, bawaJtr, LABEL_KABEL, type JaringanTiang, type KabelSurvey, type TitikSurvey } from "@/lib/surveyJaringan";
import type { Penanda } from "../_hooks/usePenandaJtm";
import type { SurveyPetaState } from "../_hooks/useSurveyPeta";
import { BIDANG, GARIS } from "../_ui";
import IsianGarduSurvey from "./IsianGarduSurvey";
import { WARNA_JTR, WARNA_SURVEY } from "./LapisanSurvey";

/** Isian satu tiang survey (dark panel): Tiang JTM / JTR, kabel dari induk
 *  (JTM, JTR, JTM + JTR), konduktor & jurusan. Isian tiang/kabel jadi bawaan
 *  tiang berikutnya yang sejenis. */

export const SEL = "w-full rounded-lg border px-2 py-1 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#F97316]";

export function Pilih({ label, nilai, opsi, onUbah, kosong = "—", mati }: {
  label: string; nilai: string | null; opsi: { kode: string; label: string }[]; onUbah: (v: string | null) => void; kosong?: string; mati: boolean;
}) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</span>
      <select
        value={nilai ?? ""} disabled={mati} onChange={(e) => onUbah(e.target.value || null)}
        className={SEL} style={{ background: BIDANG, borderColor: GARIS }}
      >
        <option value="">{kosong}</option>
        {nilai && !opsi.some((o) => o.kode === nilai) && <option value={nilai}>{nilai}</option>}
        {opsi.map((o) => <option key={o.kode} value={o.kode}>{o.label}</option>)}
      </select>
    </label>
  );
}

const keOpsi = (xs: string[] | undefined) => (xs ?? []).map((x) => ({ kode: x, label: x }));
const WARNA_JARINGAN: Record<JaringanTiang, string> = { JTM: WARNA_SURVEY, JTR: WARNA_JTR };

export default function SuntingTitikSurvey({ s, t, nomor, penanda }: {
  s: SurveyPetaState; t: TitikSurvey; nomor: number; penanda: Map<string, Penanda>;
}) {
  const mati = !s.draf;
  const u = (patch: Partial<TitikSurvey>) => s.ubah(t.id, patch);
  const jtr = t.jaringan === "JTR";
  const induk = t.induk_titik_id
    ? `tiang baru ${s.titik.findIndex((x) => x.id === t.induk_titik_id) + 1}`
    : (s.sambung.get(t.induk_tiang_id ?? "")?.kode ?? "tiang JTM");
  return (
    <div className="rounded-lg p-2 space-y-1.5" style={{ background: "rgba(249,115,22,.08)" }}>
      <div className="flex items-center gap-2">
        <p className="flex-1 font-semibold">Tiang baru {nomor}</p>
        {s.draf && (
          <button onClick={() => s.hapus(t.id)} className="p-1 rounded text-gray-400 hover:text-[#FCA5A5]" title="Hapus tiang ini">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <p className="text-gray-400">
        Dari {induk} · {Math.round(s.panjang.get(t.id) ?? 0)} m ·{" "}
        <span className="font-mono select-all text-gray-300" title="Koordinat — klik dua kali untuk memilih">{t.lat.toFixed(6)}, {t.lng.toFixed(6)}</span>
      </p>

      <div className="flex gap-1">
        {(["JTM", "JTR"] as JaringanTiang[]).map((j) => (
          <button
            key={j} disabled={mati} onClick={() => u({ jaringan: j })}
            className={`flex-1 rounded-lg border px-2 py-1 font-semibold disabled:opacity-60 ${t.jaringan === j ? "text-white" : "border-white/15 text-gray-300 hover:bg-white/5"}`}
            style={t.jaringan === j ? { background: WARNA_JARINGAN[j], borderColor: WARNA_JARINGAN[j] } : undefined}
          >
            Tiang {j}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Pilih
          label="Jenis tiang" nilai={t.jenis_tiang} mati={mati} onUbah={(v) => u({ jenis_tiang: v })}
          opsi={keOpsi(jtr ? s.opsi?.jtr_jenis_tiang : s.opsi?.jenis_tiang)}
        />
        {!jtr && <Pilih label="Konstruksi" nilai={t.konstruksi} opsi={keOpsi(s.opsi?.konstruksi)} onUbah={(v) => u({ konstruksi: v })} mati={mati} />}
        {!jtr && t.induk_titik_id && (
          <div className="col-span-2">
            <Pilih
              label="Kabel dari tiang sebelumnya" nilai={t.kabel} kosong="—" mati={mati}
              opsi={(Object.keys(LABEL_KABEL) as KabelSurvey[]).map((k) => ({ kode: k, label: LABEL_KABEL[k] }))}
              onUbah={(v) => v && u({ kabel: v as KabelSurvey })}
            />
          </div>
        )}
        {bawaJtm(t.kabel) && (
          <>
            <Pilih label="Konduktor JTM" nilai={t.konduktor_jenis} opsi={keOpsi(s.opsi?.konduktor_jenis)} onUbah={(v) => u({ konduktor_jenis: v })} mati={mati} />
            <Pilih label="Ukuran" nilai={t.konduktor_ukuran} opsi={keOpsi(s.opsi?.konduktor_ukuran)} onUbah={(v) => u({ konduktor_ukuran: v })} mati={mati} />
          </>
        )}
        {bawaJtr(t.kabel) && (
          <>
            <Pilih label="Kabel JTR" nilai={t.jtr_kabel_jenis} opsi={keOpsi(s.opsi?.jtr_kabel_jenis)} onUbah={(v) => u({ jtr_kabel_jenis: v })} mati={mati} />
            <Pilih label="Ukuran" nilai={t.jtr_kabel_ukuran} opsi={keOpsi(s.opsi?.jtr_kabel_ukuran)} onUbah={(v) => u({ jtr_kabel_ukuran: v })} mati={mati} />
            <label className="block space-y-0.5 col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Jurusan</span>
              <input
                value={t.jurusan ?? ""} disabled={mati} maxLength={4} placeholder="A"
                onChange={(e) => u({ jurusan: e.target.value.toUpperCase() || null })}
                className={SEL} style={{ background: BIDANG, borderColor: GARIS }}
              />
            </label>
          </>
        )}
      </div>

      {!jtr && (
        <Pilih
          label="Gardu / peralatan di tiang ini" nilai={t.penanda} kosong="Tidak ada (tiang biasa)" mati={mati}
          opsi={[...penanda.values()].map((p) => ({ kode: p.kode, label: p.label }))}
          onUbah={(v) => u({ penanda: v, ...(v === "gardu" ? {} : { gardu_kva: null, gardu_nama: null, gardu_jenis: null }) })}
        />
      )}
      {t.penanda === "gardu" && <IsianGarduSurvey t={t} mati={mati} u={u} />}
      <input
        placeholder="Catatan tiang (opsional)" value={t.catatan ?? ""} disabled={mati}
        onChange={(e) => u({ catatan: e.target.value || null })}
        className={SEL} style={{ background: BIDANG, borderColor: GARIS }}
      />
    </div>
  );
}
