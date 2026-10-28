"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import Tombol from "@/app/admin/_kit/Tombol";
import { EYEBROW, FIELD } from "@/app/admin/_ui";
import { rapikan } from "@/lib/wa/tanya/rapikan";
import type { TanyaWa } from "../_hooks/useTanyaWa";
import type { BarisRiwayat } from "../_hooks/useRiwayatWa";

/**
 * Ajarkan bot dari pertanyaan yang tidak dipahami: pilih fungsi yang
 * seharusnya menjawab, klik kata dari pertanyaan itu → jadi kata kunci fungsi
 * tersebut. Barisnya lalu ditandai sudah ditangani.
 */

interface Props {
  baris: BarisRiwayat;
  data: TanyaWa;
  onSelesai: () => Promise<string | null>;
  onTutup: () => void;
}

export default function AjarkanModal({ baris, data, onSelesai, onTutup }: Props) {
  const [fungsi, setFungsi] = useState(baris.fungsi_kode ?? data.fungsi.find((f) => f.aktif && f.kode !== "bantuan")?.kode ?? "");
  const [pilih, setPilih] = useState<string[]>([]);
  const [frasa, setFrasa] = useState("");
  const [bobot, setBobot] = useState(2);
  const [contoh, setContoh] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Kata sesudah ULP/waktu/kode gardu dibuang — itu yang dinilai bot.
  const kata = [...new Set((baris.saringan?.sisa ?? baris.teks_rapi ?? rapikan(baris.teks)).split(" ").filter((k) => k.length >= 2))];
  const sudah = new Set(data.kata.filter((k) => k.fungsi_kode === fungsi).map((k) => k.kata));
  const daftar = [...pilih, ...(rapikan(frasa) ? [rapikan(frasa)] : [])];

  async function simpan() {
    setSibuk(true);
    const gagal: string[] = [];
    for (const k of daftar) {
      const g = await data.tambahKata(fungsi, k, bobot);
      if (g && g !== "Sudah ada.") gagal.push(`${k}: ${g}`);
    }
    if (!gagal.length && contoh) {
      const g = await data.tambahContoh(fungsi, `@smart ${baris.teks.replace(/^@?smart\b[\s,:.\-!]*/i, "")}`);
      if (g) gagal.push(`contoh: ${g}`);
    }
    if (!gagal.length) {
      const g = await onSelesai();
      if (g) gagal.push(g);
    }
    setSibuk(false);
    if (gagal.length) setGalat(gagal.join(" · "));
    else onTutup();
  }

  return (
    <ModalShell
      title="Ajarkan bot"
      subtitle={`"${baris.teks}"`}
      maxWidth="max-w-lg"
      onClose={onTutup}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Tombol onClick={onTutup}>Batal</Tombol>
          <Tombol ragam="utama" ikon={<GraduationCap size={15} />} disabled={sibuk || !fungsi || !daftar.length} onClick={simpan}>
            Simpan {daftar.length ? `${daftar.length} kata` : ""}
          </Tombol>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-[13px]">
        <label className="flex flex-col gap-1.5">
          <span className={EYEBROW}>Seharusnya dijawab oleh</span>
          <select value={fungsi} onChange={(e) => setFungsi(e.target.value)} className={FIELD}>
            {data.fungsi.map((f) => (
              <option key={f.kode} value={f.kode}>
                {f.nama}
                {f.aktif ? "" : " (nonaktif)"}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={EYEBROW}>Kata dari pertanyaan ini — klik untuk dijadikan kata kunci</span>
          <div className="flex flex-wrap gap-1.5">
            {kata.length === 0 && <span className="text-ink-muted">Tidak ada kata tersisa — ketik frasa di bawah.</span>}
            {kata.map((k) => {
              const on = pilih.includes(k);
              const ada = sudah.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={ada}
                  title={ada ? "Sudah jadi kata kunci fungsi ini" : undefined}
                  onClick={() => setPilih((p) => (on ? p.filter((x) => x !== k) : [...p, k]))}
                  className={`h-7 px-3 rounded-full border text-[12.5px] font-medium transition-colors disabled:opacity-40 ${
                    on ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-ink-soft hover:border-brand-400"
                  }`}
                >
                  {k}
                </button>
              );
            })}
          </div>
          <input value={frasa} onChange={(e) => setFrasa(e.target.value)} placeholder="atau ketik frasa, mis. trafo panas" className={FIELD} />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className={EYEBROW}>Bobot</span>
            <select value={bobot} onChange={(e) => setBobot(Number(e.target.value))} className={`${FIELD} w-[150px]`}>
              <option value={1}>1 · biasa</option>
              <option value={2}>2 · kuat</option>
              <option value={3}>3 · sangat kuat</option>
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={contoh} onChange={(e) => setContoh(e.target.checked)} className="accent-brand-600" />
            Jadikan contoh pertanyaan juga
          </label>
        </div>
        {galat && <p className="text-xs text-red-600">{galat}</p>}
      </div>
    </ModalShell>
  );
}
