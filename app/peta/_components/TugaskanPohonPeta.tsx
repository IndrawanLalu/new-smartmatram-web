"use client";

import { supabaseBrowser } from "@/lib/supabase-browser";
import TugaskanTemuanModal from "@/app/admin/_components/TugaskanTemuanModal";
import type { TemuanPohon } from "../_hooks/usePohonPeta";

/**
 * Menugaskan temuan pohon langsung dari peta (8 Okt 2026) — merencanakan regu
 * sambil melihat sebarannya. Pintu server SAMA dengan tab Temuan JTM
 * (`tugaskan_temuan_jtm`): penjaga "satu temuan satu tugas", regu wajib & harus
 * terdaftar di ULP-nya, semuanya berlaku di sini juga.
 */

interface Props {
  daftar: TemuanPohon[];
  oleh: string;
  onTutup: () => void;
  /** Sesudah ada yang ditugaskan — lapisan pohon dimuat ulang. */
  onSelesai: () => void;
}

export default function TugaskanPohonPeta({ daftar, oleh, onTutup, onSelesai }: Props) {
  const bisa = daftar.filter((t) => t.kunciTugas);
  const ulp = new Set(bisa.map((t) => t.ulp));

  return (
    <TugaskanTemuanModal
      daftar={bisa.map((t) => ({
        kunci: t.tiangId,
        judul: t.tiangKode,
        keterangan: `${t.vegetasi === "menyentuh" ? "Menyentuh" : "Berpotensi"}${t.jenisPohon ? ` · ${t.jenisPohon}` : ""} · ${t.penyulang}`,
      }))}
      eksekutorAwal="PERABASAN"
      prioritasAwal={bisa.some((t) => t.vegetasi === "menyentuh") ? "Urgent" : "Normal"}
      regu={{ ulp: ulp.size === 1 ? [...ulp][0] : null }}
      keterangan={
        <p className="text-xs text-ink-soft">
          Tiap pohon menjadi satu tugas di <b>Inspeksi Pohon</b> dan langsung muncul di HP regu yang dipilih, lengkap
          dengan foto temuan dan titik tiangnya.
        </p>
      }
      tugaskan={async (p) => {
        let berhasil = 0;
        const gagal: string[] = [];
        for (const t of bisa) {
          const k = t.kunciTugas!;
          const { error } = await supabaseBrowser.rpc("tugaskan_temuan_jtm", {
            p_tiang_id: k.tiang_id,
            p_item: k.item_kode,
            p_bagian: k.bagian,
            p_sirkit: k.sirkit_segmen_id,
            p_eksekutor: p.eksekutor,
            p_prioritas: p.prioritas,
            p_catatan: p.catatan || null,
            p_nama: oleh || null,
            p_regu: p.regu,
          });
          if (error) gagal.push(`${t.tiangKode}: ${error.message}`);
          else berhasil += 1;
        }
        if (berhasil > 0 || gagal.length > 0) onSelesai();
        return { berhasil, gagal };
      }}
      onTutup={onTutup}
      onSelesai={() => {}}
    />
  );
}
