"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Ban, Loader2, MapPin, Undo2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { BarisRabas } from "../_hooks/useDaftarPerabasan";
import type { Realisasi, Regu } from "../_hooks/useWoPerabasan";
import { NADA_STATUS, km, rentangKerja, tanggal } from "../_lib/tampilan";

/**
 * Detail satu segmen perabasan — pola sama dengan Optimasi Trafo.
 *
 * Bukti pohon (foto sebelum–sesudah) tampil langsung, bukan di balik tombol:
 * itulah satu-satunya yang benar-benar diperiksa sebelum Terima. Penugasan
 * regu juga di sini — selama regu kosong, segmen ini tidak muncul di HP siapa
 * pun.
 */

interface Props {
  b: BarisRabas;
  regu: Regu[];
  onTutup: () => void;
  onTugaskan: (id: string, regu: string) => Promise<boolean>;
  onPutuskan: (id: string, terima: boolean, catatan: string) => Promise<boolean>;
  onBatalkan: (id: string, alasan: string) => Promise<boolean>;
  ambilRealisasi: (id: string) => Promise<Realisasi[]>;
}

function Nilai({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink-muted">{label}</p>
      <div className="text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}

function Bukti({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block" title={`Buka foto ${label.toLowerCase()}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage / Firebase lama */}
      <img src={url} alt={label} className="w-28 h-28 object-cover rounded-lg border border-line bg-surface" />
      <span className="block text-[10px] text-ink-muted text-center mt-0.5">{label}</span>
    </a>
  );
}

export default function DetailRabasModal({
  b, regu, onTutup, onTugaskan, onPutuskan, onBatalkan, ambilRealisasi,
}: Props) {
  const [pohon, setPohon] = useState<Realisasi[] | null>(null);
  const [galatPohon, setGalatPohon] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"kembalikan" | "keluarkan" | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    ambilRealisasi(b.id).then(
      (r) => { if (hidup) setPohon(r); },
      (e: Error) => { if (hidup) setGalatPohon(e.message); },
    );
    return () => { hidup = false; };
  }, [b.id, ambilRealisasi]);

  const jalankan = async (kerja: () => Promise<boolean>) => {
    setSibuk(true);
    try {
      return await kerja();
    } finally {
      setSibuk(false);
    }
  };

  const menunggu = b.statusDb === "Selesai";
  const bisaKeluar = !["Diverifikasi", "Dibatalkan"].includes(b.statusDb);
  // Yang sudah diselesaikan regu tidak dipindah: nama regu yang tercatat
  // mengerjakan akan berbeda dari yang tertulis di WO (dijaga database juga).
  const bisaPindahRegu = ["Dijadwalkan", "Dalam Proses", "Ditolak"].includes(b.statusDb);
  const reguUlp = regu.filter((g) => g.ulp === b.ulp);
  const luarDaftar = (pohon ?? []).filter((p) => !p.tiang_id).length;

  const footer = (
    <>
      {bisaKeluar ? (
        <button onClick={() => setDialog("keluarkan")} className={BTN_GHOST} disabled={sibuk}>
          <Ban size={14} /> Keluarkan dari WO
        </button>
      ) : <span />}
      {menunggu ? (
        <div className="flex gap-2">
          <button onClick={() => setDialog("kembalikan")} className={BTN_GHOST} disabled={sibuk}>
            <Undo2 size={14} /> Kembalikan ke regu
          </button>
          <button
            onClick={() => void jalankan(() => onPutuskan(b.id, true, ""))}
            className={BTN_PRIMARY}
            disabled={sibuk}
          >
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />} Terima
          </button>
        </div>
      ) : (
        <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
      )}
    </>
  );

  return (
    <>
      <ModalShell
        title={`Perabasan · ${b.segmenNama}`}
        subtitle={`${b.penyulang} · ${b.ulp} · ${b.status}`}
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={footer}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS[b.status]}`}>
          {b.status}
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Nilai label="Panjang">
            {km(b.panjangKm)}
            {b.panjangDari === "ketikan" && <span className="block text-[11px] font-normal text-amber-700">angka ketikan, belum dari bentang</span>}
          </Nilai>
          <Nilai label="WO">
            <span className="font-normal">{b.woNama ?? "-"}</span>
            {b.woTgl && <span className="block text-[11px] font-normal text-ink-muted">terbit {tanggal(b.woTgl)}</span>}
          </Nilai>
          <Nilai label="Tanggal pekerjaan">{rentangKerja(b.tglMulai, b.tglSelesai)}</Nilai>
          <Nilai label="Petugas">{b.petugasNama ?? "—"}</Nilai>
        </div>

        <div>
          <p className={`${EYEBROW} mb-1.5`}>Regu</p>
          {bisaPindahRegu && reguUlp.length > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={b.regu ?? ""}
                disabled={sibuk}
                onChange={(e) => void jalankan(() => onTugaskan(b.id, e.target.value))}
                className={`${FIELD} w-[220px] ${b.regu ? "" : "border-red-300 text-red-700"}`}
                aria-label="Regu"
              >
                <option value="">— belum dibagi —</option>
                {reguUlp.map((g) => (
                  <option key={g.regu} value={g.regu}>
                    {g.regu} · {g.segmen_berjalan} segmen berjalan
                  </option>
                ))}
              </select>
              {!b.regu && <span className="text-xs text-red-700">Belum muncul di HP regu mana pun.</span>}
            </div>
          ) : (
            <p className="text-sm text-ink">
              {b.regu ?? (reguUlp.length === 0 ? `ULP ${b.ulp} belum punya regu rabas aktif` : "—")}
            </p>
          )}
        </div>

        {b.statusDb === "Ditolak" && b.verifiedNote && (
          <p className="text-xs rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-800">
            <b>Dikembalikan:</b> {b.verifiedNote}
          </p>
        )}

        <div>
          <p className={`${EYEBROW} mb-2`}>
            Bukti pohon{pohon ? ` · ${pohon.length} dilaporkan` : ""}
            {luarDaftar > 0 && <span className="normal-case text-violet-700"> · {luarDaftar} di luar daftar inspeksi</span>}
          </p>
          {galatPohon ? (
            <p className="text-xs text-amber-700">Bukti gagal dimuat: {galatPohon}</p>
          ) : pohon === null ? (
            <p className="text-xs text-ink-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Memuat…</p>
          ) : pohon.length === 0 ? (
            <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              Tidak ada pohon dilaporkan.
              {b.statusDb === "Selesai" && (
                <> Keterangan regu: {b.catatan ? <i>“{b.catatan}”</i> : "— tidak ada —"}</>
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {pohon.map((p) => (
                <div key={p.id} className="flex flex-wrap items-start gap-3 pb-3 border-b border-line last:border-0">
                  <div className="flex gap-2">
                    <Bukti url={p.foto_sebelum_url} label="Sebelum" />
                    <Bukti url={p.foto_sesudah_url} label="Sesudah" />
                  </div>
                  <div className="flex-1 min-w-[160px] text-xs">
                    <p className="font-medium text-ink">{p.jenis_pohon || "Jenis tidak dicatat"}</p>
                    <p className="text-ink-muted mt-0.5">
                      {p.tiang_id ? "dari inspeksi JTM" : "temuan lapangan"}
                      {p.petugas_nama && ` · ${p.petugas_nama}`}
                    </p>
                    {p.catatan && <p className="text-ink-soft mt-0.5">{p.catatan}</p>}
                    {p.lat !== null && p.lng !== null && (
                      <a
                        href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-navy-600 hover:underline mt-0.5"
                      >
                        <MapPin size={11} /> {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalShell>

      {dialog === "kembalikan" && (
        <BatalkanModal
          judul={`Kembalikan ${b.segmenNama} ke regu?`}
          keterangan="Segmen ini kembali jadi kewajiban regu di WO yang sama dan belum menambah capaian km."
          labelTombol="Kembalikan ke regu"
          placeholder="Apa yang harus diperbaiki regu — mis. foto sesudah tidak jelas, pohon di tiang 12 belum dirabas"
          onTutup={() => setDialog(null)}
          onBatalkan={(catatan) => jalankan(() => onPutuskan(b.id, false, catatan))}
        />
      )}
      {dialog === "keluarkan" && (
        <BatalkanModal
          judul={`Keluarkan ${b.segmenNama} dari WO?`}
          keterangan="Segmen ini tidak lagi menjadi pekerjaan WO tersebut dan hilang dari HP regu. Catatannya tetap tersimpan dengan status Dibatalkan."
          labelTombol="Keluarkan dari WO"
          placeholder="Alasan — mis. segmen salah pilih, sudah dirabas lewat pekerjaan lain"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasan) => jalankan(() => onBatalkan(b.id, alasan))}
        />
      )}
    </>
  );
}
