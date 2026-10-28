"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Send } from "lucide-react";
import { CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import Tombol from "@/app/admin/_kit/Tombol";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";
import type { FungsiWa } from "../_hooks/useTanyaWa";
import BalasanWa, { type BalasanUji } from "./BalasanWa";
import { muatGrupWa } from "../_lib/grupWa";

/**
 * Uji coba: kirim pertanyaan ke pengurai yang sama dengan WA, lihat cara bot
 * membacanya dan balasannya. Tidak masuk riwayat, tidak mengirim WA.
 */

interface HasilUji {
  balasan: BalasanUji;
  hasil: "dijawab" | "tidak_dipahami" | "pilihan" | "tanya_balik" | "galat";
  fungsi: string | null;
  urai: {
    rapi: string;
    sisa: string;
    saringan: { ulp: string | null; periode: { label: string } | null; gardu: string | null; penyulang: string | null };
    skor: { kode: string; skor: number; cocok: string[] }[];
  } | null;
}

interface Asal {
  grup: string;
  label: string;
}

const LABEL_HASIL: Record<HasilUji["hasil"], { teks: string; nada: string }> = {
  dijawab: { teks: "Dijawab", nada: "bg-emerald-50 text-emerald-700" },
  tidak_dipahami: { teks: "Tidak dipahami", nada: "bg-amber-50 text-amber-700" },
  pilihan: { teks: "Ragu (seri)", nada: "bg-sky-50 text-sky-700" },
  tanya_balik: { teks: "Bertanya balik", nada: "bg-sky-50 text-sky-700" },
  galat: { teks: "Galat", nada: "bg-red-50 text-red-700" },
};

export default function TabUjiCoba({ fungsi }: { fungsi: FungsiWa[] }) {
  const [teks, setTeks] = useState("");
  const [grup, setGrup] = useState("");
  const [daftarAsal, setDaftarAsal] = useState<Asal[]>([]);
  const [hasil, setHasil] = useState<HasilUji | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const nama = (kode: string | null) => fungsi.find((f) => f.kode === kode)?.nama ?? kode ?? "—";

  // Grup dari Setting WA Group: grup milik satu ULP membuat ULP itu jadi bawaan.
  useEffect(() => {
    void muatGrupWa().then((m) => {
      // Label sama = perilaku sama; cukup satu wakil per label.
      const asal = [...m].map(([g, label]) => ({ grup: g, label })).sort((a, b) => a.label.localeCompare(b.label));
      setDaftarAsal(asal.filter((a, i, sm) => sm.findIndex((x) => x.label === a.label) === i));
    });
  }, []);

  async function uji() {
    setSibuk(true);
    setGalat(null);
    const res = await fetch("/api/wa-tanya/uji", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teks, grup }) });
    const d = await res.json().catch(() => ({ error: "Respons tidak terbaca" }));
    setSibuk(false);
    if (!res.ok) return setGalat(d.error ?? "Gagal");
    setHasil(d as HasilUji);
  }

  const u = hasil?.urai;
  const s = u?.saringan;

  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <div className="flex flex-col gap-4">
        <form
          className={`${CARD} p-4 flex flex-col gap-3`}
          onSubmit={(e) => {
            e.preventDefault();
            void uji();
          }}
        >
          <div className={EYEBROW}>Pertanyaan</div>
          <input autoFocus value={teks} onChange={(e) => setTeks(e.target.value)} placeholder="mis. gardu overload ampenan bulan ini" className={FIELD} />
          <div className="flex flex-wrap gap-2">
            <select value={grup} onChange={(e) => setGrup(e.target.value)} className={`${FIELD} flex-1 min-w-[200px]`} aria-label="Seolah dari">
              <option value="">Seolah dari chat pribadi</option>
              {daftarAsal.map((a) => (
                <option key={a.grup} value={a.grup}>
                  Seolah dari {a.label}
                </option>
              ))}
            </select>
            <Tombol type="submit" ragam="utama" ikon={sibuk ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} disabled={sibuk || !teks.trim()}>
              Coba
            </Tombol>
          </div>
          {galat && <p className="text-xs text-red-600">{galat}</p>}
          <CatatanInfo>Tanpa &quot;@smart&quot; — ketik isi pertanyaannya saja. Uji coba tidak tercatat dan tidak mengirim WA.</CatatanInfo>
        </form>

        {hasil && u && s && (
          <div className={`${CARD} p-4 flex flex-col gap-3 text-[13px]`}>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${LABEL_HASIL[hasil.hasil].nada}`}>{LABEL_HASIL[hasil.hasil].teks}</span>
              {hasil.fungsi && <span className="font-semibold">{nama(hasil.fungsi)}</span>}
            </div>
            <Baris label="Dirapikan">{u.rapi || "—"}</Baris>
            <Baris label="Sisa dinilai">{u.sisa || "—"}</Baris>
            <Baris label="Terbaca">
              {[s.ulp ? `ULP ${s.ulp}` : "semua ULP", s.periode?.label, s.gardu && `gardu ${s.gardu}`, s.penyulang && `penyulang ${s.penyulang}`].filter(Boolean).join(" · ")}
            </Baris>
            <div>
              <div className={EYEBROW}>Nilai fungsi</div>
              {u.skor.length === 0 ? (
                <p className="text-ink-muted mt-1">Tidak ada kata kunci yang cocok.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {u.skor.map((x) => (
                    <li key={x.kode} className="flex items-baseline gap-2">
                      <span className="w-10 text-right font-bold tabular-nums">{x.skor}</span>
                      <span className="font-medium">{nama(x.kode)}</span>
                      <span className="text-ink-muted text-xs">{x.cocok.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {hasil && (
        <div className="rounded-2xl border border-line shadow-card p-4 flex flex-col gap-2 bg-[#efeae2]">
          <div className={EYEBROW}>Balasan di WA</div>
          <BalasanWa balasan={hasil.balasan} />
        </div>
      )}
    </div>
  );
}

function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-ink-muted">{label}</span>
      <span className="flex-1 break-words">{children}</span>
    </div>
  );
}
