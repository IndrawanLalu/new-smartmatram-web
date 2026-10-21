"use client";

import { Trash2 } from "lucide-react";
import { LABEL_JENIS_GARDU, type JenisGardu, type TitikSurvey } from "@/lib/surveyJaringan";
import type { Penanda } from "../_hooks/usePenandaJtm";
import type { SurveyPetaState } from "../_hooks/useSurveyPeta";
import { BIDANG, GARIS } from "../_ui";

/** Isian satu tiang survey (dark panel). Isian tiang/konstruksi/konduktor jadi
 *  bawaan tiang berikutnya. */

const SEL = "w-full rounded-lg border px-2 py-1 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#F97316]";

function Pilih({ label, nilai, opsi, onUbah, kosong = "—", mati }: {
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

export default function SuntingTitikSurvey({ s, t, nomor, penanda }: {
  s: SurveyPetaState; t: TitikSurvey; nomor: number; penanda: Map<string, Penanda>;
}) {
  const mati = !s.draf;
  const u = (patch: Partial<TitikSurvey>) => s.ubah(t.id, patch);
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
      <p className="text-gray-400">Dari {induk} · {Math.round(s.panjang.get(t.id) ?? 0)} m</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Pilih label="Jenis tiang" nilai={t.jenis_tiang} opsi={keOpsi(s.opsi?.jenis_tiang)} onUbah={(v) => u({ jenis_tiang: v })} mati={mati} />
        <Pilih label="Konstruksi" nilai={t.konstruksi} opsi={keOpsi(s.opsi?.konstruksi)} onUbah={(v) => u({ konstruksi: v })} mati={mati} />
        <Pilih label="Konduktor" nilai={t.konduktor_jenis} opsi={keOpsi(s.opsi?.konduktor_jenis)} onUbah={(v) => u({ konduktor_jenis: v })} mati={mati} />
        <Pilih label="Ukuran" nilai={t.konduktor_ukuran} opsi={keOpsi(s.opsi?.konduktor_ukuran)} onUbah={(v) => u({ konduktor_ukuran: v })} mati={mati} />
      </div>
      <Pilih
        label="Gardu / peralatan di tiang ini" nilai={t.penanda} kosong="Tidak ada (tiang biasa)" mati={mati}
        opsi={[...penanda.values()].map((p) => ({ kode: p.kode, label: p.label }))}
        onUbah={(v) => u({ penanda: v, ...(v === "gardu" ? {} : { gardu_kva: null, gardu_nama: null, gardu_jenis: null }) })}
      />
      {t.penanda === "gardu" && (
        <Pilih
          label="Jenis gardu" nilai={t.gardu_jenis} kosong="— pilih portal / cantol —" mati={mati}
          opsi={(Object.keys(LABEL_JENIS_GARDU) as JenisGardu[]).map((k) => ({ kode: k, label: LABEL_JENIS_GARDU[k] }))}
          onUbah={(v) => u({ gardu_jenis: v as JenisGardu | null })}
        />
      )}
      {t.penanda === "gardu" && (
        <div className="grid grid-cols-[5rem_1fr] gap-1.5">
          <input
            type="number" min={0} placeholder="kVA" value={t.gardu_kva ?? ""} disabled={mati}
            onChange={(e) => u({ gardu_kva: e.target.value ? Number(e.target.value) : null })}
            className={SEL} style={{ background: BIDANG, borderColor: GARIS }}
          />
          <input
            placeholder="Nama / lokasi gardu" value={t.gardu_nama ?? ""} disabled={mati}
            onChange={(e) => u({ gardu_nama: e.target.value || null })}
            className={SEL} style={{ background: BIDANG, borderColor: GARIS }}
          />
        </div>
      )}
      <input
        placeholder="Catatan tiang (opsional)" value={t.catatan ?? ""} disabled={mati}
        onChange={(e) => u({ catatan: e.target.value || null })}
        className={SEL} style={{ background: BIDANG, borderColor: GARIS }}
      />
    </div>
  );
}
