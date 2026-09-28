"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MapPin, TriangleAlert, Undo2, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useCurrentUser } from "@/app/admin/_context/UserContext";

/**
 * Tegangan ujung satu pengukuran beban — diukur di ujung JTR, dengan titik &
 * foto (`rencana-tegangan-ujung.md`). Admin bisa Kembalikan (petugas
 * memperbaiki) atau Batalkan (salah objek), keduanya beralasan (butir 2, 8).
 */

interface Titik {
  id: string;
  jurusan: string;
  v_rn: number;
  v_sn: number;
  v_tn: number;
  lat: number;
  lng: number;
  akurasi_m: number | null;
  foto_url: string;
  jarak_rekomendasi_m: number | null;
  panjang_jaringan_m: number | null;
  tgl_ukur: string;
  jam_ukur: string | null;
  petugas_nama: string | null;
  status: "Terkirim" | "Dikembalikan" | "Dibatalkan";
  alasan: string | null;
  tiang: { kode: string } | null;
}

const KOLOM =
  "id,jurusan,v_rn,v_sn,v_tn,lat,lng,akurasi_m,foto_url,jarak_rekomendasi_m,panjang_jaringan_m,tgl_ukur,jam_ukur,petugas_nama,status,alasan,tiang:tiang_rekomendasi_id(kode)";

const NADA: Record<Titik["status"], string> = {
  Terkirim: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dikembalikan: "bg-orange-50 text-orange-700 border-orange-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

const m = (v: number | null) => (v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2).replace(".", ",")} km` : `${Math.round(v)} m`);

export default function TeganganUjungPanel({ pengukuranId, amgTerkunci }: { pengukuranId: string; amgTerkunci: boolean }) {
  const user = useCurrentUser();
  const toast = useToast();
  const oleh = user.name ?? user.email ?? "";
  const [titik, setTitik] = useState<Titik[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [aksi, setAksi] = useState<{ t: Titik; jenis: "kembali" | "batal" } | null>(null);

  useEffect(() => {
    let hidup = true;
    supabaseBrowser
      .from("pengukuran_tegangan_ujung")
      .select(KOLOM)
      .eq("pengukuran_id", pengukuranId)
      .order("jurusan")
      .then(({ data, error }) => {
        if (!hidup) return;
        // Tabel belum ada (SQL T1 belum dijalankan) = belum ada data, bukan galat.
        if (error && error.code !== "PGRST205") setGalat(error.message);
        setTitik((data ?? []) as unknown as Titik[]);
      });
    return () => { hidup = false; };
  }, [pengukuranId]);

  const jalankan = async (alasan: string) => {
    if (!aksi) return false;
    const fn = aksi.jenis === "kembali" ? "kembalikan_tegangan_ujung" : "batalkan_tegangan_ujung";
    const { error } = await supabaseBrowser.rpc(fn, { p_id: aksi.t.id, p_alasan: alasan, p_nama: oleh });
    if (error) {
      toast.error(error.message);
      return false;
    }
    const status = aksi.jenis === "kembali" ? "Dikembalikan" : "Dibatalkan";
    // Ditambal di tempat — satu baris berubah.
    setTitik((p) => (p ?? []).map((x) => (x.id === aksi.t.id ? { ...x, status, alasan } : x)));
    toast.success(aksi.jenis === "kembali" ? "Dikembalikan ke petugas." : "Tegangan ujung dibatalkan.");
    return true;
  };

  if (titik === null) return null;

  return (
    <div className="border-t border-line bg-white px-4 py-3">
      <p className="text-xs font-semibold text-ink-soft mb-2">Tegangan Ujung — diukur di ujung JTR (V, fasa-netral)</p>
      {galat && <p className="text-xs text-amber-700">{galat}</p>}
      {titik.length === 0 ? (
        <p className="text-xs text-ink-muted">Belum ada tegangan ujung yang diukur di lapangan untuk pengukuran ini.</p>
      ) : (
        <div className="space-y-2">
          {titik.map((t) => (
            <div key={t.id} className={`rounded-lg border border-line p-2.5 flex flex-wrap gap-3 ${t.status === "Dibatalkan" ? "opacity-60" : ""}`}>
              <a href={t.foto_url} target="_blank" rel="noreferrer" className="shrink-0" title="Buka foto alat ukur">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.foto_url} alt={`Foto tegangan ujung jurusan ${t.jurusan}`} className="w-16 h-16 rounded-md object-cover border border-line" />
              </a>
              <div className="flex-1 min-w-[200px] text-xs">
                <p className="text-ink">
                  <b className="text-accent-deep">Jurusan {t.jurusan}</b> · R-N <b>{t.v_rn}</b> · S-N <b>{t.v_sn}</b> · T-N <b>{t.v_tn}</b>
                  <span className={`ml-2 inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${NADA[t.status]}`}>{t.status}</span>
                </p>
                <p className="text-ink-soft mt-0.5">
                  {t.tgl_ukur} {t.jam_ukur?.slice(0, 5) ?? ""} · {t.petugas_nama ?? "—"} · GPS ±{t.akurasi_m === null ? "?" : Math.round(t.akurasi_m)} m
                  {t.akurasi_m !== null && t.akurasi_m > 20 && <TriangleAlert size={11} className="inline ml-1 text-amber-600" />}
                </p>
                <p className="text-ink-soft mt-0.5">
                  {t.tiang
                    ? <>Diukur <b className="text-ink">{m(t.jarak_rekomendasi_m)}</b> dari ujung terjauh (tiang {t.tiang.kode}, {m(t.panjang_jaringan_m)} jaringan dari gardu)</>
                    : "Tanpa rekomendasi — gardu belum punya data JTR saat diukur"}
                  <a
                    href={`https://www.google.com/maps?q=${t.lat},${t.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 inline-flex items-center gap-0.5 text-navy-600 font-medium hover:underline"
                  >
                    <MapPin size={11} /> titik <ExternalLink size={10} />
                  </a>
                </p>
                {t.alasan && <p className="text-orange-700 mt-0.5">Alasan: {t.alasan}</p>}
              </div>
              {t.status === "Terkirim" && !amgTerkunci && (
                <div className="flex flex-col gap-1 items-end">
                  <button onClick={() => setAksi({ t, jenis: "kembali" })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 hover:underline">
                    <Undo2 size={12} /> Kembalikan
                  </button>
                  <button onClick={() => setAksi({ t, jenis: "batal" })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:underline">
                    <XCircle size={12} /> Batalkan
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {aksi && (
        <BatalkanModal
          judul={aksi.jenis === "kembali" ? `Kembalikan tegangan ujung jurusan ${aksi.t.jurusan}?` : `Batalkan tegangan ujung jurusan ${aksi.t.jurusan}?`}
          keterangan={
            aksi.jenis === "kembali"
              ? "Titik ini kembali ke HP petugas sebagai draf berisi isian lama untuk diperbaiki lalu dikirim ulang."
              : "Titik ini tidak dihitung lagi dan tidak dikirim ke AMG. Pakai untuk salah objek, bukan salah ukur."
          }
          labelTombol={aksi.jenis === "kembali" ? "Kembalikan" : "Batalkan"}
          placeholder={aksi.jenis === "kembali" ? "Alasan — mis. foto alat ukur tidak terbaca" : "Alasan — mis. diukur di gardu, bukan di ujung jaringan"}
          onTutup={() => setAksi(null)}
          onBatalkan={jalankan}
        />
      )}
    </div>
  );
}
