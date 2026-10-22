"use client";

import { useEffect, useState } from "react";
import { Loader2, MousePointerClick, Undo2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Pulih } from "../_hooks/useTiangBatal";

/**
 * Pulihkan tiang JTM yang salah dibatalkan (`pulihkan_tiang_jtm`): id, riwayat
 * inspeksi & foto tetap; nama penyulang kembali dari catatan pembatalan (nama
 * yang sudah dipakai tiang lain diganti menurut induknya); masuk lagi ke
 * segmen induknya.
 */

const ISIAN =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15";

interface Hasil {
  id: string;
  kode: string;
  lat: number;
  lng: number;
  nama_diganti: { penyulang: string; lama: string; baru: string }[];
  segmen: string[];
}

interface Props {
  p: Pulih;
  oleh: string;
  onPilihInduk: () => void;
  onTutup: () => void;
  onSelesai: (h: Hasil) => void;
}

export default function PulihkanTiang({ p, oleh, onPilihInduk, onTutup, onSelesai }: Props) {
  const toast = useToast();
  const [lama, setLama] = useState<{ kode: string; aktif: boolean } | null | undefined>(undefined);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const indukId = p.t.induk_id;

  useEffect(() => {
    if (!indukId) return;
    let hidup = true;
    void supabaseBrowser
      .from("tiang")
      .select("kode,status_hidup")
      .eq("id", indukId)
      .maybeSingle()
      .then(({ data }) => {
        if (hidup) setLama(data ? { kode: data.kode as string, aktif: data.status_hidup === "aktif" } : null);
      });
    return () => { hidup = false; };
  }, [indukId]);

  const lamaBisa = !!lama?.aktif;
  const siap = !!alasan.trim() && (!!p.induk || lamaBisa || !indukId);

  const pulihkan = async () => {
    setSibuk(true);
    const { data, error } = await supabaseBrowser.rpc("pulihkan_tiang_jtm", {
      p_id: p.t.id,
      p_induk_id: p.induk?.id ?? null,
      p_alasan: alasan.trim(),
      p_oleh: oleh,
    });
    setSibuk(false);
    if (error) {
      toast.error(
        error.message.includes("Could not find the function")
          ? "Fungsi pulihkan belum ada — jalankan scripts/jtm-tambah-pulihkan-tiang.sql di Supabase."
          : error.message,
      );
      return;
    }
    const h = data as Hasil;
    toast.success(
      `${h.kode} dipulihkan` +
        (h.nama_diganti.length ? ` — nama ${h.nama_diganti.map((x) => `${x.lama} → ${x.baru}`).join(", ")} (sudah dipakai tiang lain)` : "") +
        ".",
    );
    onSelesai(h);
  };

  return (
    <ModalShell
      title={`Pulihkan ${p.t.kode}?`}
      subtitle={`${p.t.penyulang ?? "—"}${p.t.aktif_sampai ? ` · dibatalkan ${p.t.aktif_sampai}` : ""}`}
      maxWidth="max-w-md"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={() => void pulihkan()} disabled={!siap || sibuk} className={BTN_PRIMARY}>
            {sibuk ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Pulihkan
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-3 text-sm text-ink">
        {p.t.catatan && (
          <p className="text-xs text-ink-soft">
            Alasan dibatalkan: <span className="text-ink">{p.t.catatan}</span>
          </p>
        )}
        <div className="rounded-lg border border-line p-3 space-y-2">
          <p className="text-xs font-semibold text-ink-soft">Menyambung dari</p>
          {p.induk ? (
            <p className="font-medium">{p.induk.kode} <span className="text-xs text-ink-soft">(dipilih di peta)</span></p>
          ) : !indukId ? (
            <p className="text-ink-soft">Pangkal — tidak punya induk.</p>
          ) : lama === undefined ? (
            <p className="text-ink-soft flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Memeriksa induk lama…</p>
          ) : lamaBisa ? (
            <p className="font-medium">{lama!.kode} <span className="text-xs text-ink-soft">(induk sebelum dibatalkan)</span></p>
          ) : (
            <p className="text-amber-700 text-xs">
              Induk lama {lama?.kode ?? ""} sudah tidak aktif — pilih induknya di peta.
            </p>
          )}
          <button onClick={onPilihInduk} className={`${BTN_GHOST} text-xs`}>
            <MousePointerClick size={14} /> Pilih induk lain di peta
          </button>
        </div>
        <p className="text-xs text-ink-soft">
          Nama penyulangnya dikembalikan; kalau nama itu sudah dipakai tiang lain, diberi nama menurut induknya. Tiang
          yang dulu dipindah dari tiang ini tidak otomatis kembali — sambungkan lewat <b>Sambung hilir</b>.
        </p>
        <input
          autoFocus
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="Alasan — wajib, mis. salah hapus di peta"
          className={ISIAN}
        />
      </div>
    </ModalShell>
  );
}

/** Selama memilih induk di peta: petunjuk melayang di atas peta. */
export function PetunjukIndukPulih({ kode, onBatal }: { kode: string; onBatal: () => void }) {
  return (
    <div className="absolute z-[1100] top-16 left-1/2 -translate-x-1/2 rounded-xl border border-sky-400/60 bg-[#0d1b2a]/95 px-4 py-2.5 text-xs text-sky-100 shadow-2xl flex items-center gap-3">
      <span>Klik tiang <b>induk</b> untuk {kode} yang dipulihkan.</span>
      <button onClick={onBatal} className="rounded-lg border border-white/20 px-2 py-1 hover:bg-white/10">Kembali</button>
    </div>
  );
}
