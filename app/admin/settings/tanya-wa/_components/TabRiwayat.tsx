"use client";

import { useEffect, useState } from "react";
import { Check, GraduationCap, RotateCcw } from "lucide-react";
import ChipSaring, { type ItemChip } from "@/app/admin/_kit/ChipSaring";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";
import { BarisMemuat, KakiTabel, KartuTabel, TD } from "@/app/admin/_kit/Tabel";
import { FIELD } from "@/app/admin/_ui";
import type { TanyaWa } from "../_hooks/useTanyaWa";
import { useRiwayatWa, type BarisRiwayat, type HasilRiwayat, type SaringHasil } from "../_hooks/useRiwayatWa";
import { muatGrupWa } from "../_lib/grupWa";
import AjarkanModal from "./AjarkanModal";

/** Pertanyaan yang masuk lewat WA (90 hari) + "Ajarkan" dari yang tidak dipahami. */

const CHIP: ItemChip<SaringHasil>[] = [
  { kunci: "tidak_dipahami", label: "Tidak dipahami" },
  { kunci: "pilihan", label: "Ragu (pilih nomor)" },
  { kunci: "dijawab", label: "Dijawab" },
  { kunci: "galat", label: "Galat" },
  { kunci: "semua", label: "Semua" },
];
const NADA: Record<HasilRiwayat, { teks: string; kelas: string }> = {
  dijawab: { teks: "Dijawab", kelas: "bg-emerald-50 text-emerald-700" },
  tidak_dipahami: { teks: "Tidak dipahami", kelas: "bg-amber-50 text-amber-700" },
  pilihan: { teks: "Ragu", kelas: "bg-sky-50 text-sky-700" },
  galat: { teks: "Galat", kelas: "bg-red-50 text-red-700" },
};
const waktu = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" });

interface Props {
  data: TanyaWa;
  bisaUbah: boolean;
}

export default function TabRiwayat({ data, bisaUbah }: Props) {
  const r = useRiwayatWa();
  const [grup, setGrup] = useState<Map<string, string>>(new Map());
  const [ajar, setAjar] = useState<BarisRiwayat | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const nama = (kode: string | null) => data.fungsi.find((f) => f.kode === kode)?.nama ?? kode;

  useEffect(() => {
    void muatGrupWa().then(setGrup);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ChipSaring item={CHIP} aktif={r.saring.hasil} onPilih={r.saring.setHasil} />
        <select value={r.saring.fungsi} onChange={(e) => r.saring.setFungsi(e.target.value)} className={`${FIELD} w-[200px]`} aria-label="Fungsi">
          <option value="">Semua fungsi</option>
          {data.fungsi.map((f) => (
            <option key={f.kode} value={f.kode}>
              {f.nama}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
          <input type="checkbox" checked={r.saring.sembunyikan} onChange={(e) => r.saring.setSembunyikan(e.target.checked)} className="accent-brand-600" />
          Sembunyikan yang sudah ditangani
        </label>
      </div>
      {(galat || r.galat) && <p className="text-xs text-red-600">{galat ?? r.galat}</p>}

      <KartuTabel kaki={<KakiTabel hal={r.hal} total={r.jumlahHal} onHal={r.setHal} ringkas={`${r.total} pertanyaan`} />}>
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
          <thead className="kepala-kit sticky top-0 z-10">
            <tr className="text-left text-xs font-semibold text-ink-soft">
              <th className="px-3 py-2.5 w-28">Waktu</th>
              <th className="px-3 py-2.5 w-48">Pengirim</th>
              <th className="px-3 py-2.5">Pertanyaan</th>
              <th className="px-3 py-2.5 w-44">Hasil</th>
              <th className="px-3 py-2.5 w-36" />
            </tr>
          </thead>
          <tbody>
            {r.memuat ? (
              <BarisMemuat kolom={5} baris={6} />
            ) : r.baris.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                  Tidak ada pertanyaan{r.saring.hasil === "tidak_dipahami" ? " yang belum dipahami — bot memahami semuanya." : "."}
                </td>
              </tr>
            ) : (
              r.baris.map((b) => (
                <tr key={b.id} className={b.ditangani ? "opacity-60" : ""}>
                  <td className={`${TD} text-ink-soft tabular-nums`}>{waktu(b.waktu)}</td>
                  <td className={TD}>
                    <div className="font-medium truncate">{b.nama || b.dari?.split("@")[0] || "–"}</div>
                    <div className="text-[11px] text-ink-muted truncate">{b.grup ? (grup.get(b.grup) ?? "Grup lain") : "Chat pribadi"}</div>
                  </td>
                  <td className={TD}>
                    <div>{b.teks}</div>
                    {b.saringan?.sisa !== undefined && b.saringan.sisa !== b.teks_rapi && (
                      <div className="text-[11px] text-ink-muted">dinilai: {b.saringan.sisa || "—"}</div>
                    )}
                  </td>
                  <td className={TD}>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${NADA[b.hasil].kelas}`}>{NADA[b.hasil].teks}</span>
                    {b.fungsi_kode && <div className="text-[11px] text-ink-muted mt-1">{nama(b.fungsi_kode)}</div>}
                  </td>
                  <td className={`${TD} text-right`}>
                    {bisaUbah && (
                      <span className="inline-flex items-center gap-1">
                        {b.hasil !== "dijawab" && !b.ditangani && (
                          <button type="button" onClick={() => setAjar(b)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold text-brand-700 hover:bg-brand-50">
                            <GraduationCap size={14} /> Ajarkan
                          </button>
                        )}
                        <button
                          type="button"
                          title={b.ditangani ? "Buka lagi" : "Tandai sudah ditangani"}
                          aria-label={b.ditangani ? "Buka lagi" : "Tandai sudah ditangani"}
                          onClick={async () => setGalat(await r.tandai(b.id, !b.ditangani))}
                          className="p-1.5 rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
                        >
                          {b.ditangani ? <RotateCcw size={14} /> : <Check size={14} />}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </KartuTabel>

      <CatatanInfo>
        Riwayat disimpan 90 hari. &quot;Ajarkan&quot; menambah kata dari pertanyaan itu ke kata kunci fungsi yang dipilih. Uji coba dari web
        tidak tercatat di sini.
      </CatatanInfo>

      {ajar && <AjarkanModal baris={ajar} data={data} onSelesai={() => r.tandai(ajar.id, true)} onTutup={() => setAjar(null)} />}
    </div>
  );
}
