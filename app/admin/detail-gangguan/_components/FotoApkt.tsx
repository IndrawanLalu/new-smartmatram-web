"use client";

import { useEffect, useState } from "react";
import { Camera, Loader2, UserRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { EYEBROW } from "@/app/admin/_ui";

/**
 * Foto APKT + Petugas APKT satu laporan (scripts/apkt-foto.sql). Ditarik pekerja
 * homelab (pekerja/apktFoto.mjs); tombol "Ambil foto" mendahulukan laporan ini
 * di antrean. Fotonya sudah kecil (±40 KB) → tampil apa adanya, tanpa
 * render/image Supabase.
 */

interface Catatan {
  status: "antre" | "ada_foto" | "tidak_ada_foto" | "gagal";
  coba: number;
  pesan: string | null;
  dicoba_at: string | null;
  petugas: string | null;
  minta_manual_at: string | null;
}
interface Foto { tahap: "pengerjaan" | "selesai"; path: string | null }

const TAHAP = [
  { kunci: "pengerjaan", label: "Dalam Pengerjaan" },
  { kunci: "selesai", label: "Selesai" },
] as const;
const BATAS_TUNGGU = 3 * 60_000;

interface Isi { catatan: Catatan | null; foto: Foto[]; galat: string | null }

async function baca(noLaporan: string): Promise<Isi> {
  const [c, f] = await Promise.all([
    supabaseBrowser.from("apkt_foto_laporan")
      .select("status,coba,pesan,dicoba_at,petugas,minta_manual_at")
      .eq("no_laporan", noLaporan).maybeSingle(),
    supabaseBrowser.from("apkt_foto").select("tahap,path").eq("no_laporan", noLaporan),
  ]);
  const e = c.error ?? f.error;
  return { catatan: (c.data as Catatan | null) ?? null, foto: (f.data ?? []) as Foto[], galat: e ? e.message : null };
}

const urlFoto = (path: string) => supabaseBrowser.storage.from("apkt-foto").getPublicUrl(path).data.publicUrl;
const jam = (s: string | null) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function FotoApkt({ noLaporan, statusAkhir }: { noLaporan: string; statusAkhir?: string }) {
  const [isi, setIsi] = useState<Isi>({ catatan: null, foto: [], galat: null });
  const [meminta, setMeminta] = useState(false);
  const [kelamaan, setKelamaan] = useState(false);
  const { catatan, foto, galat } = isi;

  useEffect(() => {
    let hidup = true;
    void baca(noLaporan).then((h) => { if (hidup) setIsi(h); });
    return () => { hidup = false; };
  }, [noLaporan]);

  // Menunggu pekerja: baca ulang tiap 5 detik, paling lama 3 menit.
  const menunggu = !!catatan?.minta_manual_at;
  useEffect(() => {
    if (!menunggu) return;
    const mulai = Date.now();
    const t = setInterval(() => {
      if (Date.now() - mulai > BATAS_TUNGGU) {
        setKelamaan(true);
        return clearInterval(t);
      }
      void baca(noLaporan).then(setIsi);
    }, 5000);
    return () => { clearInterval(t); setKelamaan(false); };
  }, [menunggu, noLaporan]);

  const minta = async () => {
    setMeminta(true);
    const { error } = await supabaseBrowser.rpc("apkt_foto_minta", { p_no_laporan: noLaporan });
    setMeminta(false);
    if (error) return setIsi((v) => ({ ...v, galat: error.message }));
    setIsi(await baca(noLaporan));
  };

  const selesai = statusAkhir === "Selesai";
  const terlaluLama = menunggu && kelamaan;

  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className={`${EYEBROW} flex-1`}>Foto APKT</p>
        {selesai && (
          <button onClick={minta} disabled={meminta || menunggu}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-navy-300 bg-white text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60">
            {meminta || menunggu ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {menunggu ? "Menunggu pekerja…" : "Ambil foto"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TAHAP.map((t) => {
          const f = foto.find((x) => x.tahap === t.kunci);
          return (
            <div key={t.kunci}>
              <p className="text-[11px] text-ink-soft mb-1">{t.label}</p>
              {f?.path ? (
                <a href={urlFoto(f.path)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- berkas Storage kecil, klik = ukuran asli */}
                  <img src={urlFoto(f.path)} alt={t.label} loading="lazy"
                    className="w-full h-40 object-cover rounded-lg border border-line bg-white" />
                </a>
              ) : (
                <div className="h-40 rounded-lg border border-dashed border-line bg-white flex items-center justify-center text-[11px] text-ink-muted text-center px-2">
                  {f ? "Berkas sudah dihapus (lebih dari 2 bulan)" : "Belum ada foto"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink flex items-center gap-1.5">
        <UserRound size={13} className="text-ink-soft" />
        <span className="text-ink-soft">Petugas APKT:</span>
        <span className="font-semibold">{catatan?.petugas ?? "—"}</span>
      </p>

      <p className={`text-[11px] ${catatan?.status === "gagal" || terlaluLama ? "text-amber-700" : "text-ink-soft"}`}>
        {!selesai
          ? `Foto hanya diambil untuk laporan berstatus Selesai — laporan ini ${statusAkhir || "tanpa status"}.`
          : terlaluLama
            ? "Pekerja belum memproses permintaan ini — periksa container pekerja di homelab."
            : menunggu
              ? "Menunggu giliran di antrean pekerja (biasanya kurang dari 1 menit)."
              : !catatan
                ? "Belum diambil — otomatis pukul 00.00–06.00 WITA, atau tekan Ambil foto."
                : catatan.status === "ada_foto"
                  ? `Diambil ${jam(catatan.dicoba_at)}.`
                  : catatan.status === "tidak_ada_foto"
                    ? `Tidak ada foto di APKT (dicoba ${catatan.coba}×, terakhir ${jam(catatan.dicoba_at)}).${catatan.pesan ? ` ${catatan.pesan}` : ""}`
                    : catatan.status === "gagal"
                      ? `Gagal diambil (dicoba ${catatan.coba}×, ${jam(catatan.dicoba_at)}): ${catatan.pesan ?? "tanpa keterangan"}`
                      : "Menunggu giliran di antrean pekerja."}
      </p>
      {galat && <p className="text-[11px] text-red-700">{galat}</p>}
    </div>
  );
}
