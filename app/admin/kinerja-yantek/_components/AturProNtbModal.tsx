"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { META } from "../_lib/kinerjaMeta";
import { ISIAN_JENIS, type KolomIsian, type KolomJenis } from "../_lib/proNtb";

/**
 * Kolom tetap per jenis untuk Copy to PRO NTB (`pro_ntb_jenis`). Ditulis
 * persis seperti di spreadsheet UIW — huruf besar mengikuti yang diketik.
 * UP3 dan admin boleh mengubah (dijaga RLS).
 */

interface Props {
  jenis: Map<string, KolomJenis>;
  oleh: string;
  onTutup: () => void;
  onTersimpan: () => void;
}

const kosong = (kunci: string): KolomJenis => ({
  kunci, jenis_pekerjaan: null, tim_pelaksana: null, jenis_kontrak: null, kelompok: null, satuan: null,
});

export default function AturProNtbModal({ jenis, oleh, onTutup, onTersimpan }: Props) {
  const toast = useToast();
  const [isi, setIsi] = useState(() => META.map((m) => ({ ...(jenis.get(m.kunci) ?? kosong(m.kunci)) })));
  const [sibuk, setSibuk] = useState(false);

  const berubah = isi.filter((x) => {
    const lama = jenis.get(x.kunci) ?? kosong(x.kunci);
    return ISIAN_JENIS.some(({ kolom }) => (x[kolom] ?? "") !== (lama[kolom] ?? ""));
  });

  const ubah = (i: number, kolom: KolomIsian, v: string) =>
    setIsi((xs) => xs.map((x, j) => (j === i ? { ...x, [kolom]: v } : x)));

  const simpan = async () => {
    setSibuk(true);
    const rapikan = (v: string | null) => (v ?? "").trim() || null;
    const { error } = await supabaseBrowser.from("pro_ntb_jenis").upsert(
      berubah.map((x) => ({
        kunci: x.kunci,
        ...Object.fromEntries(ISIAN_JENIS.map(({ kolom }) => [kolom, rapikan(x[kolom])])),
        updated_at: new Date().toISOString(),
        updated_by: oleh,
      })),
    );
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Kolom ${berubah.length} jenis tersimpan.`);
    onTersimpan();
    onTutup();
  };

  const footer = (
    <>
      <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
      <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk || berubah.length === 0}>
        {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Simpan{berubah.length > 0 ? ` (${berubah.length})` : ""}
      </button>
    </>
  );

  return (
    <ModalShell
      title="Kolom per jenis pekerjaan"
      subtitle="Isian tetap laporan PRO NTB — ditulis persis seperti di spreadsheet UIW"
      maxWidth="max-w-6xl"
      onClose={onTutup}
      footer={footer}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line">Rekap Kinerja</th>
              {ISIAN_JENIS.map(({ kolom, label }) => (
                <th key={kolom} className="px-2 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isi.map((x, i) => (
              <tr key={x.kunci}>
                <td className="px-2 py-1.5 border-b border-line text-xs font-medium text-ink min-w-40">{META[i].jenis}</td>
                {ISIAN_JENIS.map(({ kolom }) => (
                  <td key={kolom} className="px-1 py-1.5 border-b border-line">
                    <input
                      value={x[kolom] ?? ""}
                      onChange={(e) => ubah(i, kolom, e.target.value)}
                      className={`${FIELD} w-full min-w-28 text-xs`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-soft leading-relaxed">
        Jenis yang belum diisi tetap tampil di laporan, ditandai <b>belum diatur</b>, dan kolomnya tersalin kosong.
      </p>
    </ModalShell>
  );
}
