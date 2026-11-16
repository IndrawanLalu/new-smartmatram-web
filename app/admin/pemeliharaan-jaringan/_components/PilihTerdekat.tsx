"use client";

import { useEffect, useState } from "react";
import { FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { BarisPemeliharaan } from "../_hooks/usePemeliharaanJaringan";

/**
 * Tiang JTM / gardu terdekat (≤ 100 m dari titik catatan) — tidak wajib.
 * Pilihan dari `cari_lokasi`; penyulang catatan ikut pilihan (keputusan user).
 * Jarak dihitung ulang dan dijaga di server (koreksi_pemeliharaan_jaringan).
 */

const RADIUS_M = 100;

interface Pilihan {
  kunci: string;
  label: string;
  tiangId: string | null;
  garduKode: string | null;
  penyulang: string | null;
}

interface Props {
  b: BarisPemeliharaan;
  tiangId: string | null;
  garduKode: string | null;
  penyulang: string;
  onPilih: (p: { tiangId: string | null; garduKode: string | null; penyulang: string | null }) => void;
}

const kunciTiang = (id: string, penyulang: string) => `t|${id}|${penyulang.toUpperCase()}`;
const kunciGardu = (kode: string) => `g|${kode.toUpperCase()}`;
const meter = (m: number) => `${Math.round(m)} m`;

export default function PilihTerdekat({ b, tiangId, garduKode, penyulang, onPilih }: Props) {
  const [pilihan, setPilihan] = useState<Pilihan[] | null>(null);
  const bertitik = b.lat !== null && b.lng !== null;

  useEffect(() => {
    if (b.lat === null || b.lng === null) return;
    let hidup = true;
    supabaseBrowser
      .rpc("cari_lokasi", { p_lat: b.lat, p_lng: b.lng, p_radius_m: RADIUS_M })
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error || !data) { setPilihan([]); return; }
        const d = data as {
          jtm: { tiang_id: string; kode: string; penyulang: string; segmen: string | null; jarak: number }[];
          gardu: { kode: string; penyulang: string | null; jarak: number }[];
        };
        setPilihan([
          ...d.jtm.map((t) => ({
            kunci: kunciTiang(t.tiang_id, t.penyulang),
            label: `Tiang ${t.kode} · ${t.penyulang}${t.segmen ? ` · ${t.segmen}` : ""} · ${meter(t.jarak)}`,
            tiangId: t.tiang_id, garduKode: null, penyulang: t.penyulang,
          })),
          ...d.gardu.map((g) => ({
            kunci: kunciGardu(g.kode),
            label: `Gardu ${g.kode.trim()}${g.penyulang ? ` · ${g.penyulang}` : ""} · ${meter(g.jarak)}`,
            tiangId: null, garduKode: g.kode.trim(), penyulang: g.penyulang,
          })),
        ]);
      });
    return () => { hidup = false; };
  }, [b.lat, b.lng]);

  const terpilih = tiangId ? kunciTiang(tiangId, penyulang) : garduKode ? kunciGardu(garduKode) : "";
  // Pilihan tersimpan yang tidak lagi muncul (mis. penyulang diganti) tetap tampil apa adanya.
  const daftar = [...(pilihan ?? [])];
  if (terpilih && !daftar.some((p) => p.kunci === terpilih) && b.terdekatLabel) {
    daftar.unshift({
      kunci: terpilih,
      label: `${b.terdekatLabel}${b.terdekatJarakM !== null ? ` · ${meter(b.terdekatJarakM)}` : ""} (tersimpan)`,
      tiangId, garduKode, penyulang: null,
    });
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-ink-soft">Tiang / gardu terdekat</span>
      <select
        value={terpilih}
        disabled={!bertitik || pilihan === null}
        onChange={(e) => {
          const p = daftar.find((x) => x.kunci === e.target.value);
          onPilih(p ? { tiangId: p.tiangId, garduKode: p.garduKode, penyulang: p.penyulang } : { tiangId: null, garduKode: null, penyulang: null });
        }}
        className={FIELD}
      >
        <option value="">Tidak dipilih</option>
        {daftar.map((p) => <option key={p.kunci} value={p.kunci}>{p.label}</option>)}
      </select>
      <span className="text-[11px] text-ink-soft">
        {!bertitik
          ? "Catatan ini tidak bertitik."
          : pilihan === null
            ? "Mencari dalam 100 m…"
            : daftar.length === 0
              ? "Tidak ada tiang JTM atau gardu dalam 100 m dari titik catatan."
              : "Tidak wajib. Penyulang ikut tiang/gardu yang dipilih."}
      </span>
    </label>
  );
}
