"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Loader2, Send } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import PilihRegu, { PERAN_PER_REGU } from "@/app/admin/_components/PilihRegu";
/**
 * Menugaskan temuan inspeksi (JTM / JTR) ke satu eksekutor — pilihannya BEBAS
 * (keputusan user 24 Sep 2026), termasuk temuan ROW. Tiap temuan jadi satu
 * tugas Ditugaskan: muncul di Monitoring Inspeksi dan tugas HP eksekutornya.
 *
 * Dengan `regu` (JTM, 8 Okt 2026): peran yang diterima HP per regu (PERABASAN,
 * K3) memilih regunya di sini, supaya tidak perlu bolak-balik ke Monitoring
 * Inspeksi untuk mengisi timnya.
 */

export interface Penugasan { eksekutor: string; prioritas: string; catatan: string; regu: string | null }

const PRIORITAS = ["Normal", "Scheduled", "Urgent", "Emergency"];

interface Props {
  /** Temuan terpilih, sudah dalam bentuk tampilan. */
  daftar: { kunci: string; judul: string; keterangan: string }[];
  /** Peringatan khusus jenis temuan (mis. segmen sedang WO Perabasan). */
  peringatan?: ReactNode;
  /** Prioritas terpilih saat dibuka (mis. dari kategori pilihan regu). */
  prioritasAwal?: string;
  /** Eksekutor terpilih saat dibuka (mis. PERABASAN untuk temuan pohon). */
  eksekutorAwal?: string;
  /** Pilihan regu untuk peran per regu; ulp null = temuan dari beberapa ULP. */
  regu?: { ulp: string | null };
  /** Keterangan tujuan tugas di atas formulir (mis. pohon → Inspeksi Pohon). */
  keterangan?: ReactNode;
  onTutup: () => void;
  tugaskan: (p: Penugasan) => Promise<{ berhasil: number; gagal: string[] }>;
  onSelesai: () => void;
}

export default function TugaskanTemuanModal({
  daftar, peringatan, prioritasAwal, eksekutorAwal, regu, keterangan, onTutup, tugaskan, onSelesai,
}: Props) {
  const toast = useToast();
  const { roles } = useRoles();
  const eksekutorRoles = useMemo(() => roles.filter((r) => r.is_eksekutor), [roles]);
  const [eksekutor, setEksekutor] = useState(eksekutorAwal ?? "");
  const [namaRegu, setNamaRegu] = useState("");
  const perRegu = !!regu && PERAN_PER_REGU.includes(eksekutor);
  const siap = !!eksekutor && (!perRegu || (!!regu?.ulp && !!namaRegu));
  const [prioritas, setPrioritas] = useState(prioritasAwal && PRIORITAS.includes(prioritasAwal) ? prioritasAwal : "Normal");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const kirim = async () => {
    if (!siap) return;
    setSibuk(true);
    try {
      const h = await tugaskan({ eksekutor, prioritas, catatan: catatan.trim(), regu: perRegu ? namaRegu : null });
      if (h.berhasil > 0) toast.success(`${h.berhasil} temuan ditugaskan ke ${perRegu ? namaRegu : eksekutor} — sudah masuk HP-nya.`);
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
      subtitle={`${daftar.length} temuan terpilih`}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={() => void kirim()} className={BTN_PRIMARY} disabled={!siap || sibuk}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Tugaskan{eksekutor ? ` ke ${perRegu && namaRegu ? namaRegu : eksekutor}` : ""}
          </button>
        </>
      }
    >
      {keterangan ?? (
        <p className="text-xs text-ink-soft">
          Tiap temuan menjadi satu tugas di <b>Monitoring Inspeksi</b> dan muncul di HP eksekutor yang dipilih, lengkap
          dengan foto temuan dan titik tiangnya.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={EYEBROW}>Ditugaskan ke</label>
          <select
            value={eksekutor}
            onChange={(e) => { setEksekutor(e.target.value); setNamaRegu(""); }}
            className={`${FIELD} mt-1 block w-full`}
          >
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

      {perRegu && regu && <PilihRegu peran={eksekutor} ulp={regu.ulp} nilai={namaRegu} onPilih={setNamaRegu} />}

      <div>
        <label className={EYEBROW}>Catatan penugasan (opsional)</label>
        <input
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="mis. bawa isolator tumpu cadangan"
          className={`${FIELD} mt-1 block w-full`}
        />
      </div>

      {peringatan}

      <div className="rounded-xl border border-line overflow-hidden">
        <ul className="max-h-52 overflow-y-auto divide-y divide-line">
          {daftar.map((t) => (
            <li key={t.kunci} className="px-4 py-2 text-sm flex flex-wrap gap-x-2">
              <span className="font-semibold text-ink">{t.judul}</span>
              <span className="text-ink-soft">{t.keterangan}</span>
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}
