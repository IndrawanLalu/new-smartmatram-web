"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { META } from "../_lib/kinerjaMeta";
import type { KolomJenis } from "../_lib/proNtb";
import IkonKolom from "@/app/admin/_kit/IkonKolom";

/**
 * JENIS PEKERJAAN per jenis Rekap Kinerja untuk Copy to PRO NTB
 * (`pro_ntb_jenis`). Ditulis persis seperti di spreadsheet UIW — ARRAYFORMULA
 * di sana mencari TIM PELAKSANA, KONTRAK, KELOMPOK dan SATUAN dari teks ini.
 * UP3 dan admin boleh mengubah (dijaga RLS).
 */

interface Props {
  jenis: Map<string, KolomJenis>;
  oleh: string;
  onTutup: () => void;
  onTersimpan: () => void;
}

const TH = "px-2 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line";

export default function AturProNtbModal({ jenis, oleh, onTutup, onTersimpan }: Props) {
  const toast = useToast();
  const [isi, setIsi] = useState(() => META.map((m) => jenis.get(m.kunci)?.jenis_pekerjaan ?? ""));
  const [sibuk, setSibuk] = useState(false);

  const berubah = META.map((m, i) => ({ kunci: m.kunci, nilai: isi[i].trim() }))
    .filter((x) => x.nilai !== (jenis.get(x.kunci)?.jenis_pekerjaan ?? ""));

  const simpan = async () => {
    setSibuk(true);
    const { error } = await supabaseBrowser.from("pro_ntb_jenis").upsert(
      berubah.map((x) => ({
        kunci: x.kunci,
        jenis_pekerjaan: x.nilai || null,
        updated_at: new Date().toISOString(),
        updated_by: oleh,
      })),
    );
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Jenis pekerjaan ${berubah.length} baris tersimpan.`);
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
      title="Jenis pekerjaan PRO NTB"
      subtitle="Ditulis persis seperti di spreadsheet UIW — formula di sana mengisi kolom lainnya dari teks ini"
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={footer}
    >
      <table className="w-full border-collapse text-sm">
        <thead className="kepala-kit">
          <tr>
            <th className={TH}>Rekap Kinerja</th>
            <th className={TH}><IkonKolom teks="JENIS PEKERJAAN di spreadsheet" />JENIS PEKERJAAN di spreadsheet</th>
          </tr>
        </thead>
        <tbody>
          {META.map((m, i) => (
            <tr key={m.kunci}>
              <td className="px-2 py-1.5 border-b border-line text-xs font-medium text-ink">{m.jenis}</td>
              <td className="px-1 py-1.5 border-b border-line">
                <input
                  value={isi[i]}
                  onChange={(e) => setIsi((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                  className={`${FIELD} w-full text-xs`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-ink-soft leading-relaxed">
        Jenis yang belum diisi tetap tampil di laporan, ditandai <b>belum diatur</b>, dan JENIS PEKERJAAN-nya tersalin kosong.
      </p>
    </ModalShell>
  );
}
