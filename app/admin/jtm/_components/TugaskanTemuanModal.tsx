"use client";

import { useMemo, useState } from "react";
import { Loader2, Send, TreePine } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { Penugasan, TemuanJtm } from "../_hooks/useTemuanJtm";

/**
 * Menugaskan temuan ke satu eksekutor — pilihannya BEBAS (keputusan user
 * 24 Sep 2026), termasuk temuan ROW. Tiap temuan jadi satu baris `inspeksi`
 * Ditugaskan: muncul di Monitoring Inspeksi dan tugas HP eksekutornya.
 */

const PRIORITAS = ["Normal", "Scheduled", "Urgent", "Emergency"];

interface Props {
  pilih: TemuanJtm[];
  onTutup: () => void;
  tugaskan: (pilih: TemuanJtm[], p: Penugasan) => Promise<{ berhasil: number; gagal: string[] }>;
  onSelesai: () => void;
}

export default function TugaskanTemuanModal({ pilih, onTutup, tugaskan, onSelesai }: Props) {
  const toast = useToast();
  const { roles } = useRoles();
  const eksekutorRoles = useMemo(() => roles.filter((r) => r.is_eksekutor), [roles]);
  const [eksekutor, setEksekutor] = useState("");
  const [prioritas, setPrioritas] = useState("Normal");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const adaWoRabas = pilih.filter((t) => t.wo_perabasan_aktif);

  const kirim = async () => {
    if (!eksekutor) return;
    setSibuk(true);
    try {
      const h = await tugaskan(pilih, { eksekutor, prioritas, catatan: catatan.trim() });
      if (h.berhasil > 0) toast.success(`${h.berhasil} temuan ditugaskan ke ${eksekutor}.`);
      if (h.gagal.length > 0) {
        toast.error(`${h.gagal.length} gagal — ${h.gagal[0]}${h.gagal.length > 1 ? " …" : ""}. Daftar dimuat ulang.`);
      }
      onSelesai();
      onTutup();
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title="Tugaskan temuan"
      subtitle={`${pilih.length} temuan terpilih`}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={() => void kirim()} className={BTN_PRIMARY} disabled={!eksekutor || sibuk}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Tugaskan{eksekutor ? ` ke ${eksekutor}` : ""}
          </button>
        </>
      }
    >
      <p className="text-xs text-ink-soft">
        Tiap temuan menjadi satu tugas di <b>Monitoring Inspeksi</b> dan muncul di HP eksekutor yang dipilih, lengkap
        dengan foto temuan dan titik tiangnya.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={EYEBROW}>Ditugaskan ke</label>
          <select value={eksekutor} onChange={(e) => setEksekutor(e.target.value)} className={`${FIELD} mt-1 block w-full`}>
            <option value="">Pilih eksekutor…</option>
            {eksekutorRoles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className={EYEBROW}>Prioritas</label>
          <select value={prioritas} onChange={(e) => setPrioritas(e.target.value)} className={`${FIELD} mt-1 block w-full`}>
            {PRIORITAS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={EYEBROW}>Catatan penugasan (opsional)</label>
        <input
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="mis. bawa isolator tumpu cadangan"
          className={`${FIELD} mt-1 block w-full`}
        />
      </div>

      {adaWoRabas.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <TreePine size={15} className="shrink-0 mt-0.5" />
          <p>
            {adaWoRabas.length} temuan ROW berada di segmen yang sedang masuk WO Perabasan
            (<b>{[...new Set(adaWoRabas.map((t) => t.wo_perabasan_aktif))].join(", ")}</b>). Pastikan pohonnya tidak
            dirabas dua regu.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-line overflow-hidden">
        <ul className="max-h-52 overflow-y-auto divide-y divide-line">
          {pilih.map((t) => (
            <li key={`${t.tiang_id}|${t.item_kode}|${t.bagian}|${t.sirkit_segmen_id}`} className="px-4 py-2 text-sm flex flex-wrap gap-x-2">
              <span className="font-semibold text-ink">{t.tiang_kode}</span>
              <span className="text-ink-soft">
                {t.item_nama}: {t.nilai_label ?? t.nilai ?? "—"}
                {t.bagian && t.bagian !== "-" ? ` (${t.bagian})` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}
