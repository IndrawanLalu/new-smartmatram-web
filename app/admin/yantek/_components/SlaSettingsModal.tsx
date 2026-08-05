"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { UNITS } from "@/lib/roles";
import type { SlaRow } from "../_hooks/useYantekSla";

interface SlaSettingsModalProps {
  rows: SlaRow[];
  saving: boolean;
  onSimpan: (ulp: string, response: number, recovery: number) => Promise<boolean>;
  onClose: () => void;
}

const TARGETS = [
  { value: "ALL", label: "Semua ULP (default)" },
  ...UNITS.map((u) => ({ value: u.value as string, label: u.label })),
];

export default function SlaSettingsModal({ rows, saving, onSimpan, onClose }: SlaSettingsModalProps) {
  const [target, setTarget] = useState("ALL");
  const existing = rows.find((r) => r.ulp === target);
  const [response, setResponse] = useState(String(existing?.target_response_menit ?? 45));
  const [recovery, setRecovery] = useState(String(existing?.target_recovery_menit ?? 90));
  const [pesan, setPesan] = useState<string | null>(null);

  /** Ganti target = muat nilai yang tersimpan untuk ULP itu, bukan
   *  mempertahankan angka ULP sebelumnya (itu sumber salah simpan). */
  function gantiTarget(v: string) {
    setTarget(v);
    const row = rows.find((r) => r.ulp === v);
    setResponse(String(row?.target_response_menit ?? 45));
    setRecovery(String(row?.target_recovery_menit ?? 90));
    setPesan(null);
  }

  const r = Number(response);
  const c = Number(recovery);
  const sah = Number.isFinite(r) && r > 0 && Number.isFinite(c) && c > 0;

  async function simpan() {
    if (!sah) { setPesan("Kedua ambang harus angka lebih besar dari nol."); return; }
    const ok = await onSimpan(target, r, c);
    setPesan(ok ? "Tersimpan." : "Gagal menyimpan — periksa apakah tabel yantek_sla sudah dibuat.");
  }

  return (
    <ModalShell
      onClose={onClose}
      title="Pengaturan SLA Yantek"
      subtitle="Ambang response & recovery time"
      maxWidth="max-w-md"
    >
      <div className="p-5 space-y-4">
        <p className="text-xs text-ink-soft leading-relaxed">
          Durasi <b>di atas</b> ambang dihitung melanggar. ULP yang tidak punya angka
          sendiri memakai baris <b>Semua ULP</b>.
        </p>

        <div>
          <p className={EYEBROW}>Berlaku untuk</p>
          <select value={target} onChange={(e) => gantiTarget(e.target.value)} className={`${FIELD} w-full mt-1`}>
            {TARGETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}{rows.some((r2) => r2.ulp === t.value) ? " · sudah diatur" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={EYEBROW}>Response (menit)</p>
            <input
              type="number" min={1} value={response}
              onChange={(e) => setResponse(e.target.value)}
              className={`${FIELD} w-full mt-1`}
            />
          </div>
          <div>
            <p className={EYEBROW}>Recovery (menit)</p>
            <input
              type="number" min={1} value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
              className={`${FIELD} w-full mt-1`}
            />
          </div>
        </div>

        {pesan && (
          <p className={`text-xs ${pesan === "Tersimpan." ? "text-green-700" : "text-red-600"}`}>{pesan}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className={BTN_GHOST}>Tutup</button>
          <button onClick={simpan} disabled={saving || !sah} className={BTN_PRIMARY}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Simpan
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
