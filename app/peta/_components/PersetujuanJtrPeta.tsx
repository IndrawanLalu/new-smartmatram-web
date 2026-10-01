"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { ambilPerbandingan, type Banding } from "@/app/admin/jtr/_hooks/useApprovalJtr";
import type { AntreanJtr } from "../_hooks/useAntreanJtr";
import { JUDUL_BAGIAN } from "../_ui";
import { Baris, TOMBOL_PANEL } from "./InfoTiang";

/**
 * Persetujuan inspeksi JTR dari peta — fungsi yang SAMA dengan tabel
 * (`putuskan_inspeksi_jtr`, `batalkan_inspeksi_jtr`), jejaknya sama.
 *
 * Setujui hanya aktif bila daftar periksa BERSIH (keputusan user 1 Okt 2026):
 * temuan, kabel belum jelas, tiang tanpa kabel, dan usulan titik yang menunggu
 * diperiksa lewat rincian lengkap di tabel — rinciannya (foto temuan,
 * perbandingan sebelum–sesudah, usulan koreksi) tidak muat di panel ini.
 */

interface Props {
  d: AntreanJtr;
  oleh: string;
  /** Sesudah diputuskan: muat ulang antrean & peta. */
  onDiputuskan: () => void;
  /** Tiang baru / dikoreksi / dinonaktifkan dalam inspeksi ini, untuk disorot di peta. */
  onSorot: (b: Banding | null) => void;
}

export default function PersetujuanJtrPeta({ d, oleh, onDiputuskan, onSorot }: Props) {
  const toast = useToast();
  const [banding, setBanding] = useState<Banding | null>(null);
  const [usulan, setUsulan] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [dialog, setDialog] = useState<"kembalikan" | "batalkan" | null>(null);

  useEffect(() => {
    let hidup = true;
    ambilPerbandingan(d).then(
      (b) => {
        if (!hidup) return;
        setBanding(b);
        onSorot(b);
      },
      (e: Error) => hidup && setGalat(e.message),
    );
    supabaseBrowser
      .from("master_usulan")
      .select("id", { count: "exact", head: true })
      .eq("entitas", "gardu").eq("entitas_kode", d.gardu_kode.toUpperCase()).eq("ulp", d.ulp.toUpperCase())
      .eq("sumber_modul", "inspeksi_jtr").eq("status", "menunggu")
      .then(({ count }) => hidup && setUsulan(count ?? 0));
    return () => {
      hidup = false;
      onSorot(null);
    };
    // Per inspeksi; `onSorot` stabil dari induk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  const periksa = banding
    ? [
        // Temuan hanya dilaporkan — tidak menghalangi (keputusan user 1 Okt
        // 2026): temuan ditindaklanjuti lewat tab Temuan, bukan ditinjau di sini.
        { label: "Temuan (tidak menghalangi)", n: banding.temuan.length, kunci: false },
        { label: "Kabel belum jelas asalnya", n: banding.terputus.length, kunci: true },
        { label: "Tiang tanpa kabel", n: banding.rute.reduce((s, r) => s + Number(r.tiang_tanpa_kabel ?? 0), 0), kunci: true },
        { label: "Usulan titik gardu menunggu", n: usulan ?? 0, kunci: true },
      ]
    : [];
  const bersih = !!banding && usulan !== null && periksa.every((p) => !p.kunci || p.n === 0);
  const perubahan = banding
    ? {
        baru: banding.tiang.filter((t) => t.perubahan === "baru").length,
        berubah: banding.tiang.filter((t) => t.perubahan === "berubah").length,
        hilang: banding.tiang.filter((t) => t.perubahan === "hilang").length,
      }
    : null;

  const rpc = async (fn: string, args: Record<string, unknown>, pesan: string) => {
    setSibuk(true);
    const { error } = await supabaseBrowser.rpc(fn, args);
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(pesan);
    onDiputuskan();
    return true;
  };

  return (
    <div className="space-y-3 rounded-lg border border-amber-400/60 p-3">
      <p className={JUDUL_BAGIAN}>Inspeksi JTR menunggu persetujuan</p>
      <div>
        <Baris label="Regu" nilai={[d.inspektor_nama, d.petugas_2].filter(Boolean).join(" & ") || null} />
        <Baris label="Tanggal" nilai={d.tgl_selesai ? `${d.tgl_mulai} – ${d.tgl_selesai}` : d.tgl_mulai} />
        <Baris label="Tiang diperiksa" nilai={`${d.sudah_diperiksa} / ${d.tiang_aktif}`} />
        <Baris label="Panjang" nilai={`${Number(d.panjang_km ?? 0).toFixed(3).replace(".", ",")} km`} />
        {perubahan && (
          <Baris
            label="Perubahan"
            nilai={`${perubahan.baru} baru (cincin hijau) · ${perubahan.berubah} dikoreksi (kuning) · ${perubahan.hilang} dinonaktifkan (merah putus-putus)`}
          />
        )}
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Daftar periksa</p>
        {galat ? (
          <p className="text-xs text-red-300 mt-1">{galat}</p>
        ) : !banding || usulan === null ? (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Memeriksa…</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {periksa.map((p) => (
              <li
                key={p.label}
                className={`flex items-center gap-2 text-xs ${p.n > 0 && p.kunci ? "text-amber-300" : p.n > 0 ? "text-gray-400" : "text-[#5eead4]"}`}
              >
                {p.n > 0 && p.kunci ? <TriangleAlert size={12} /> : <CheckCircle2 size={12} />}
                <span className="flex-1">{p.label}</span>
                <span className="tabular-nums font-semibold">{p.n}</span>
              </li>
            ))}
          </ul>
        )}
        {banding && !bersih && usulan !== null && (
          <p className="text-[11px] text-amber-200 mt-1.5 leading-relaxed">
            Ada yang perlu dilihat rinciannya dulu — setujui dari rincian lengkap. Kabel & induk bisa dibetulkan di peta,
            lalu tekan Muat ulang.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void rpc("putuskan_inspeksi_jtr", { p_id: d.id, p_setuju: true, p_nama: oleh, p_catatan: null }, `Inspeksi JTR ${d.gardu_kode} disetujui.`)}
          disabled={!bersih || sibuk}
          className={`${TOMBOL_PANEL} border-[#00897B] text-[#5eead4]`}
          title={bersih ? "Setujui inspeksi ini" : "Daftar periksa belum bersih — setujui dari rincian lengkap"}
        >
          {sibuk ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Setujui
        </button>
        <button onClick={() => setDialog("kembalikan")} disabled={sibuk} className={TOMBOL_PANEL}>
          <XCircle size={13} /> Kembalikan
        </button>
        <Link href={`/admin/jtr?inspeksi=${d.id}`} className={TOMBOL_PANEL}>
          <ExternalLink size={13} /> Rincian lengkap
        </Link>
      </div>
      <button onClick={() => setDialog("batalkan")} disabled={sibuk} className="text-[11px] text-gray-500 hover:text-red-300">
        Batalkan inspeksi (salah objek / uji coba)…
      </button>

      {dialog === "kembalikan" && (
        <BatalkanModal
          judul={`Kembalikan inspeksi ${d.gardu_kode} ke petugas?`}
          keterangan="Regu mengerjakan ulang gardu ini dari HP; isiannya tetap ada."
          labelTombol="Kembalikan ke petugas"
          placeholder="Alasan — mis. kabel cabang B belum dicatat"
          onTutup={() => setDialog(null)}
          onBatalkan={async (a) => {
            const ok = await rpc("putuskan_inspeksi_jtr", { p_id: d.id, p_setuju: false, p_nama: oleh, p_catatan: a }, `Inspeksi ${d.gardu_kode} dikembalikan.`);
            if (ok) setDialog(null);
            return ok;
          }}
        />
      )}
      {dialog === "batalkan" && (
        <BatalkanModal
          judul={`Batalkan inspeksi ${d.gardu_kode}?`}
          keterangan="Untuk inspeksi salah objek atau uji coba."
          peringatan="Berbeda dengan Kembalikan: gardunya tidak dikembalikan jadi pekerjaan, jadi tidak akan ada yang mengerjakannya ulang."
          labelTombol="Batalkan inspeksi"
          placeholder="Alasan — mis. salah pilih gardu"
          onTutup={() => setDialog(null)}
          onBatalkan={async (a) => {
            const ok = await rpc("batalkan_inspeksi_jtr", { p_id: d.id, p_alasan: a, p_nama: oleh }, `Inspeksi ${d.gardu_kode} dibatalkan.`);
            if (ok) setDialog(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}
