"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { km } from "@/app/admin/jtm/_lib/tampilan";
import type { SectionPeta } from "../_hooks/useSectionPeta";
import { GARIS, JUDUL_BAGIAN, PANEL } from "../_ui";
import { Baris } from "./InfoTiang";
import BarisSegmenSection, { type SegmenDi } from "./BarisSegmenSection";
import NamaSection from "./NamaSection";

/**
 * Panel satu section JTM (X2): ringkasan, segmen di dalamnya, segmen yang
 * isinya melewati keypoint, dan tiang yang belum masuk segmen mana pun di
 * penyulang ini. X3: tiap segmen bisa dipecah / digabung / diubah namanya.
 */

const LABEL_HULU: Record<string, string> = { pangkal: "Pangkal penyulang", recloser: "Recloser", lbs: "LBS", lbsm: "LBSM" };

interface Props {
  s: SectionPeta;
  /** Id tiang anggota section ini. */
  tiangIds: string[];
  onTutup: () => void;
  boleh: boolean;
  oleh: string;
  /** Pecah segmen: panel diganti panel Pecah, titik potong diklik di peta. */
  onPecah: (s: { id: string; nama: string }) => void;
  /** Sesudah gabung / ubah nama: segarkan lapisan lain (daftar segmen, section). */
  onBerubah: () => void;
}

export default function PanelSection({ s, tiangIds, onTutup, boleh, oleh, onPecah, onBerubah }: Props) {
  const [segmen, setSegmen] = useState<SegmenDi[] | null>(null);
  const [lintas, setLintas] = useState<Set<string>>(new Set());
  const [tanpaSegmen, setTanpaSegmen] = useState<number | null>(null);
  const kunciTiang = tiangIds.length;
  const [ke, setKe] = useState(0);

  useEffect(() => {
    let hidup = true;
    setSegmen(null);
    setTanpaSegmen(null);
    void (async () => {
      const { data } = await supabaseBrowser
        .from("segmen_section")
        .select("segmen_id,segmen_nama,jumlah_isi")
        .eq("section_id", s.id)
        .order("segmen_nama");
      const baris = ((data ?? []) as SegmenDi[]).filter((x) => x.jumlah_isi > 0);
      const { data: l } = baris.length
        ? await supabaseBrowser.from("segmen_lintas_section").select("segmen_id").in("segmen_id", baris.map((x) => x.segmen_id))
        : { data: [] };
      // Tiang yang masuk segmen aktif penyulang ini — per 150 id.
      const masuk = new Set<string>();
      for (let i = 0; i < tiangIds.length; i += 150) {
        const { data: st } = await supabaseBrowser
          .from("segmen_tiang")
          .select("tiang_id,segmen!inner(penyulang,status)")
          .in("tiang_id", tiangIds.slice(i, i + 150))
          .eq("segmen.status", "aktif")
          .ilike("segmen.penyulang", s.penyulang);
        for (const x of (st ?? []) as { tiang_id: string }[]) masuk.add(x.tiang_id);
      }
      if (!hidup) return;
      setSegmen(baris);
      setLintas(new Set(((l ?? []) as { segmen_id: string }[]).map((x) => x.segmen_id)));
      setTanpaSegmen(tiangIds.filter((id) => !masuk.has(id)).length);
    })();
    return () => { hidup = false; };
    // tiangIds diwakili jumlahnya + id section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id, kunciTiang, ke]);

  return (
    <aside
      className="absolute z-[1100] top-14 right-3 w-[330px] max-w-[calc(100%-1.5rem)] max-h-[calc(100%-4.25rem)] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-3 text-[#e2e8f0]"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 rounded-full shrink-0" style={{ background: s.warna }} />
        <div className="flex-1 min-w-0">
          <p className={JUDUL_BAGIAN}>Section</p>
          <NamaSection s={s} boleh={boleh} oleh={oleh} onBerubah={onBerubah} />
          <p className="text-[11px] text-gray-400">{s.penyulang} · {s.ulp}</p>
        </div>
        <button onClick={onTutup} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" aria-label="Tutup">
          <X size={16} />
        </button>
      </div>

      <div>
        <Baris label="Mulai dari" nilai={LABEL_HULU[s.jenis_hulu] ?? s.jenis_hulu} />
        <Baris label="Tiang" nilai={`${s.jumlah_tiang.toLocaleString("id-ID")} tiang`} />
        <Baris label="Panjang" nilai={km(s.panjang_km, 3)} />
        <Baris
          label="Belum masuk segmen"
          nilai={tanpaSegmen === null ? "…" : tanpaSegmen === 0 ? "—" : <span className="text-amber-300">{tanpaSegmen} tiang</span>}
        />
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Segmen di section ini</p>
        {segmen === null ? (
          <p className="text-xs text-gray-400 flex items-center gap-2 mt-1"><Loader2 size={12} className="animate-spin" /> Memuat…</p>
        ) : segmen.length === 0 ? (
          <p className="text-xs text-gray-500 mt-1">Belum ada segmen.</p>
        ) : (
          <ul className="mt-1 space-y-2 text-xs">
            {segmen.map((x) => (
              <BarisSegmenSection
                key={x.segmen_id}
                x={x}
                lintas={lintas.has(x.segmen_id)}
                lain={segmen.filter((y) => y.segmen_id !== x.segmen_id)}
                boleh={boleh}
                oleh={oleh}
                onPecah={() => onPecah({ id: x.segmen_id, nama: x.segmen_nama })}
                onBerubah={() => { setKe((n) => n + 1); onBerubah(); }}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
