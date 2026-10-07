"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, TriangleAlert, X, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { ambilIsiInspeksi } from "@/app/admin/jtm/_hooks/useDaftarJtm";
import type { AntreanJtm } from "../_hooks/useAntreanJtm";
import { GARIS, JUDUL_BAGIAN, PANEL } from "../_ui";
import { Baris, TOMBOL_PANEL } from "./InfoTiang";

/**
 * Persetujuan inspeksi JTM dari peta — fungsi yang SAMA dengan tabel
 * (`putuskan_inspeksi_jtm`, `batalkan_inspeksi_jtm`), jejaknya sama.
 *
 * Pola Persetujuan JTR di peta (koreksi user 6 Okt 2026): tiang segmennya
 * disorot — hijau dinilai normal, oranye ada temuan, merah putus-putus belum
 * dinilai. Setujui hanya aktif bila daftar periksa BERSIH; temuan dilaporkan
 * tapi tidak menghalangi (ditindaklanjuti di tab Temuan).
 */

export type KeadaanTiangJtm = "normal" | "temuan" | "belum";
export interface SorotJtm { id: string; kode: string; lat: number; lng: number; keadaan: KeadaanTiangJtm }

interface Props {
  d: AntreanJtm;
  oleh: string;
  onTutup: () => void;
  /** Sesudah diputuskan: muat ulang antrean & peta. */
  onDiputuskan: () => void;
  /** Tiang segmen untuk disorot & dibingkai di peta (null = lepas). */
  onSorot: (t: SorotJtm[] | null) => void;
}

async function muatTiangSegmen(inspeksiId: string, segmenId: string): Promise<SorotJtm[]> {
  const [anggota, isi] = await Promise.all([
    fetchAllRows<{ tiang_id: string }>(() =>
      supabaseBrowser.from("segmen_tiang").select("tiang_id").eq("segmen_id", segmenId).order("tiang_id"),
    ),
    ambilIsiInspeksi(inspeksiId),
  ]);
  const ids = [...new Set([...anggota.map((a) => a.tiang_id), ...isi.map((t) => t.tiangId)])];
  const tiang: { id: string; kode: string; lat: number | null; lng: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabaseBrowser.from("tiang").select("id,kode,lat,lng").in("id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    tiang.push(...((data ?? []) as typeof tiang));
  }
  const dinilai = new Map(isi.map((t) => [t.tiangId, t.isi.some((x) => !x.normal)]));
  return tiang
    .filter((t) => t.lat !== null && t.lng !== null)
    .map((t) => ({
      id: t.id,
      kode: t.kode,
      lat: Number(t.lat),
      lng: Number(t.lng),
      keadaan: !dinilai.has(t.id) ? "belum" : dinilai.get(t.id) ? "temuan" : "normal",
    }));
}

export default function PersetujuanJtmPeta({ d, oleh, onTutup, onDiputuskan, onSorot }: Props) {
  const toast = useToast();
  const [tiang, setTiang] = useState<SorotJtm[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [dialog, setDialog] = useState<"kembalikan" | "batalkan" | null>(null);

  useEffect(() => {
    if (!d.segmen_id) return;
    let hidup = true;
    muatTiangSegmen(d.id, d.segmen_id).then(
      (t) => {
        if (!hidup) return;
        setTiang(t);
        onSorot(t);
      },
      (e: Error) => hidup && setGalat(e.message),
    );
    return () => {
      hidup = false;
      onSorot(null);
    };
    // Per inspeksi; `onSorot` stabil dari induk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  const belum = Math.max(0, d.tiang_segmen - d.tiang_dinilai);
  const periksa = [
    { label: "Temuan (tidak menghalangi)", n: d.temuan, kunci: false },
    { label: "Tiang segmen belum dinilai", n: belum, kunci: true },
    { label: "Catatan inspeksi kembar", n: d.kembar, kunci: true },
  ];
  const bersih = periksa.every((p) => !p.kunci || p.n === 0);

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

  const nama = d.segmen_nama ?? "(segmen terhapus)";

  return (
    <aside
      className="absolute z-[1100] top-14 right-3 w-[330px] max-w-[calc(100%-1.5rem)] max-h-[calc(100%-4.25rem)] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-3 text-[#e2e8f0]"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className={JUDUL_BAGIAN}>Inspeksi JTM menunggu persetujuan</p>
          <p className="text-sm font-semibold mt-0.5 break-words">{nama}</p>
        </div>
        <button onClick={onTutup} className="p-1 rounded hover:bg-white/10" aria-label="Tutup"><X size={14} /></button>
      </div>

      <div>
        <Baris label="Penyulang" nilai={`${d.penyulang} · ${d.ulp} · tier ${d.tier}`} />
        <Baris label="Regu" nilai={d.petugas_nama} />
        <Baris label="Tanggal" nilai={d.tgl_selesai ? `${(d.tgl_mulai ?? "").slice(0, 10)} – ${d.tgl_selesai.slice(0, 10)}` : d.tgl_mulai?.slice(0, 10)} />
        <Baris label="Tiang dinilai" nilai={`${d.tiang_dinilai} / ${d.tiang_segmen}`} />
        {tiang && (
          <Baris
            label="Di peta"
            nilai={`${tiang.filter((t) => t.keadaan === "normal").length} normal (hijau) · ${tiang.filter((t) => t.keadaan === "temuan").length} temuan (oranye) · ${tiang.filter((t) => t.keadaan === "belum").length} belum dinilai (merah putus-putus)`}
          />
        )}
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Daftar periksa</p>
        {!d.segmen_id || galat ? (
          <p className="text-xs text-red-300 mt-1">{galat ?? "Segmennya sudah tidak ada — periksa dari rincian lengkap."}</p>
        ) : !tiang ? (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Memuat tiang segmen…</p>
        ) : null}
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
        {!bersih && (
          <p className="text-[11px] text-amber-200 mt-1.5 leading-relaxed">
            Ada yang perlu dilihat rinciannya dulu — setujui dari rincian lengkap (catatan kembar disatukan di sana).
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void rpc("putuskan_inspeksi_jtm", { p_id: d.id, p_setuju: true, p_nama: oleh, p_catatan: null }, `Inspeksi JTM ${nama} disetujui.`)}
          disabled={!bersih || sibuk}
          className={`${TOMBOL_PANEL} border-[#00897B] text-[#5eead4]`}
          title={bersih ? "Setujui inspeksi ini" : "Daftar periksa belum bersih — setujui dari rincian lengkap"}
        >
          {sibuk ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Setujui
        </button>
        <button onClick={() => setDialog("kembalikan")} disabled={sibuk} className={TOMBOL_PANEL}>
          <XCircle size={13} /> Kembalikan
        </button>
        <Link href={`/admin/jtm?inspeksi=${d.id}`} className={TOMBOL_PANEL}>
          <ExternalLink size={13} /> Rincian lengkap
        </Link>
      </div>
      <button onClick={() => setDialog("batalkan")} disabled={sibuk} className="text-[11px] text-gray-500 hover:text-red-300">
        Batalkan inspeksi (salah segmen / uji coba)…
      </button>

      {dialog === "kembalikan" && (
        <BatalkanModal
          judul={`Kembalikan inspeksi ${nama} ke regu?`}
          keterangan="Segmen ini kembali jadi pekerjaan regu, dan alasannya terbaca di aplikasi."
          labelTombol="Kembalikan ke regu"
          placeholder="Alasan — mis. 3 tiang di ujung segmen belum dinilai"
          onTutup={() => setDialog(null)}
          onBatalkan={async (a) => {
            const ok = await rpc("putuskan_inspeksi_jtm", { p_id: d.id, p_setuju: false, p_nama: oleh, p_catatan: a }, `Inspeksi ${nama} dikembalikan.`);
            if (ok) setDialog(null);
            return ok;
          }}
        />
      )}
      {dialog === "batalkan" && (
        <BatalkanModal
          judul={`Batalkan inspeksi ${nama}?`}
          keterangan="Untuk inspeksi salah segmen atau uji coba. Tiang yang sudah dinilai tidak ikut dibatalkan."
          peringatan="Berbeda dengan Kembalikan: segmennya tidak dikembalikan jadi pekerjaan, jadi tidak akan ada yang mengerjakannya ulang."
          labelTombol="Batalkan inspeksi"
          placeholder="Alasan — mis. salah pilih segmen"
          onTutup={() => setDialog(null)}
          onBatalkan={async (a) => {
            const ok = await rpc("batalkan_inspeksi_jtm", { p_id: d.id, p_alasan: a, p_nama: oleh }, `Inspeksi ${nama} dibatalkan.`);
            if (ok) setDialog(null);
            return ok;
          }}
        />
      )}
    </aside>
  );
}
