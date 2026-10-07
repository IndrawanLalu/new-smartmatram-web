"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { PRIORITAS_TUGAS, type IsianTugas } from "../_hooks/useTugasHarjar";
import type { JenisJaringan } from "../_hooks/usePemeliharaanJaringan";

/**
 * "Buat Tugas" — perintah kerja Pemeliharaan Jaringan dari web untuk regu
 * HARJAR, di luar temuan inspeksi. Muncul di tab WO HP regu ULP penyulang itu.
 * Bukti pekerjaannya (foto sebelum-sesudah + titik) tetap diisi regu dari HP.
 */

const ID_FORM = "form-buat-tugas-harjar";
const JENIS: JenisJaringan[] = ["JTM", "JTR"];

interface Props {
  /** ULP terpilih di halaman; "SEMUA" = penyulang semua ULP (UP3). */
  ulp: string;
  onTutup: () => void;
  onBuat: (v: IsianTugas) => Promise<void>;
}

function Isian({ label, wajib, children }: { label: string; wajib?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={EYEBROW}>
        {label} {wajib && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export default function BuatTugasModal({ ulp, onTutup, onBuat }: Props) {
  const toast = useToast();
  const [penyulang, setPenyulang] = useState<{ penyulang: string; ulp: string }[]>([]);
  const [v, setV] = useState<Omit<IsianTugas, "jenis"> & { jenis: JenisJaringan | "" }>({
    jenis: "", penyulang: "", uraian: "", lokasi: "", koordinat: "", prioritas: "Normal", catatan: "",
  });
  const [sibuk, setSibuk] = useState(false);
  const ubah = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));

  useEffect(() => {
    let hidup = true;
    fetchAllRows<{ penyulang: string; ulp: string }>(() => {
      const q = supabaseBrowser.from("penyulang_ref").select("penyulang,ulp").order("penyulang").order("ulp");
      return ulp === "SEMUA" ? q : q.ilike("ulp", ulp);
    }).then((d) => { if (hidup) setPenyulang(d); }, () => {});
    return () => { hidup = false; };
  }, [ulp]);

  const siap = v.jenis !== "" && v.penyulang !== "" && v.uraian.trim() !== "" && v.lokasi.trim() !== "";

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siap || v.jenis === "") return;
    setSibuk(true);
    try {
      await onBuat({ ...v, jenis: v.jenis, uraian: v.uraian.trim(), lokasi: v.lokasi.trim(), catatan: v.catatan.trim(), koordinat: v.koordinat.trim() });
      toast.success(`Tugas ${v.jenis} ${v.penyulang} dibuat — muncul di HP regu HARJAR.`);
      onTutup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat tugas.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title="Buat Tugas Pemeliharaan Jaringan"
      subtitle="Untuk regu HARJAR · foto sebelum-sesudah tetap diisi regu dari HP"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button type="submit" form={ID_FORM} className={BTN_PRIMARY} disabled={!siap || sibuk}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Buat Tugas
          </button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={(e) => void kirim(e)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className={EYEBROW}>Jenis jaringan <span className="text-red-500">*</span></span>
            <div className="flex gap-2">
              {JENIS.map((j) => (
                <button key={j} type="button" onClick={() => ubah({ jenis: j })} className={`${CHIP} ${v.jenis === j ? CHIP_ON : CHIP_OFF}`}>
                  {j}
                </button>
              ))}
            </div>
          </div>
          <Isian label="Penyulang" wajib>
            <select value={v.penyulang} onChange={(e) => ubah({ penyulang: e.target.value })} className={FIELD}>
              <option value="">{penyulang.length ? "Pilih penyulang" : "Memuat…"}</option>
              {penyulang.map((p) => (
                <option key={`${p.penyulang}|${p.ulp}`} value={p.penyulang}>
                  {p.penyulang}{ulp === "SEMUA" ? ` · ${p.ulp}` : ""}
                </option>
              ))}
            </select>
          </Isian>
        </div>

        <Isian label="Uraian pekerjaan" wajib>
          <input value={v.uraian} onChange={(e) => ubah({ uraian: e.target.value })} className={FIELD}
            placeholder="mis. Ganti konektor bocor, perbaiki jumper, pasang ulang isolator" />
        </Isian>

        <Isian label="Lokasi" wajib>
          <input value={v.lokasi} onChange={(e) => ubah({ lokasi: e.target.value })} className={FIELD}
            placeholder="Segmen, gardu, tiang, atau alamat yang bisa dicari regu" />
        </Isian>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Isian label="Titik (tidak wajib)">
            <input value={v.koordinat} onChange={(e) => ubah({ koordinat: e.target.value })} className={FIELD}
              placeholder="Tempel dari Google Maps, mis. -8.5833, 116.1167" />
          </Isian>
          <Isian label="Prioritas">
            <select value={v.prioritas} onChange={(e) => ubah({ prioritas: e.target.value })} className={FIELD}>
              {PRIORITAS_TUGAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Isian>
        </div>

        <Isian label="Catatan untuk regu">
          <textarea value={v.catatan} onChange={(e) => ubah({ catatan: e.target.value })} rows={3}
            className={`${FIELD} h-auto py-2`} placeholder="Keterangan tambahan, kontak warga, material yang perlu dibawa" />
        </Isian>
      </form>
    </ModalShell>
  );
}
