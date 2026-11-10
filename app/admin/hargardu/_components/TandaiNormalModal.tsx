"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { perkecilFoto } from "@/lib/gambarSurvey/latar";
import type { BarisPerbaikan } from "../_hooks/usePerluPerbaikan";

/**
 * "Tandai normal" (hargardu-tandai-normal.sql, 11 Nov 2026): admin menyatakan
 * temuan sebenarnya normal — mis. FCO memang dilepas karena tidak terpakai —
 * supaya tidak jadi pekerjaan tertunda. Alasan wajib, foto perbaikan tidak.
 */

interface Props {
  b: BarisPerbaikan;
  oleh: string;
  onTutup: () => void;
  onSelesai: (h: { id: string; oleh: string; alasan: string; foto: string | null }) => void;
}

export default function TandaiNormalModal({ b, oleh, onTutup, onSelesai }: Props) {
  const toast = useToast();
  const [alasan, setAlasan] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const simpan = async () => {
    setSibuk(true);
    try {
      let url: string | null = null;
      if (foto) {
        // Foto bukti: 1024 px / mutu 0,60 — teknisaplikasi.md butir 4, sama dengan HP.
        const jalur = `hargardu/normal/${b.gardu_kode}/${Date.now()}.jpg`;
        const { error } = await supabaseBrowser.storage
          .from("inspections")
          .upload(jalur, await perkecilFoto(foto, 1024, 0.6), { contentType: "image/jpeg" });
        if (error) throw new Error(`Foto gagal diunggah: ${error.message}`);
        url = supabaseBrowser.storage.from("inspections").getPublicUrl(jalur).data.publicUrl;
      }
      const { data, error } = await supabaseBrowser.rpc("tandai_temuan_normal", {
        p_temuan: {
          gardu_kode: b.gardu_kode,
          ulp: b.ulp,
          item_kode: b.item_kode,
          bagian: b.bagian,
          sumber: b.sumber,
          temuan_id: b.temuan_id,
          item_nama: b.item_nama,
          nilai_label: b.nilai_label ?? b.nilai,
          catatan: [b.catatan, b.pr_keterangan].filter((t) => t && t.trim()).join(" · ") || null,
          ditemukan_pada: b.ditemukan_pada,
          foto_url: b.foto_url,
          prioritas: b.prioritas,
        },
        p_alasan: alasan.trim(),
        p_foto: url,
        p_oleh: oleh,
      });
      if (error) throw new Error(error.message);
      toast.success(`${b.gardu_kode} · ${b.item_nama} ditandai normal`);
      onSelesai({ id: data as string, oleh, alasan: alasan.trim(), foto: url });
      onTutup();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menandai normal");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title="Tandai normal"
      subtitle={`${b.gardu_kode} · ${b.item_nama}: ${b.nilai_label ?? b.nilai ?? "—"}`}
      maxWidth="max-w-lg"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk || !alasan.trim()}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Tandai normal
          </button>
        </>
      }
    >
      <p className="text-xs text-ink-soft">
        Temuan ini keluar dari pekerjaan tertunda dan pindah ke &ldquo;Dinyatakan normal&rdquo;. Kunjungan berikutnya
        yang mencatat hal yang sama tetap menjadi temuan baru.
      </p>
      <label className="block text-xs">
        <span className={EYEBROW}>Alasan (wajib)</span>
        <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={3}
          placeholder="mis. FCO memang dilepas, jurusan tidak terpakai"
          className={`${FIELD} mt-1 block w-full`} />
      </label>
      <label className="block text-xs">
        <span className={EYEBROW}>Foto perbaikan (tidak wajib)</span>
        <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
      </label>
    </ModalShell>
  );
}
