"use client";

import { useEffect, useState } from "react";
import { Ban, Calendar, CheckCircle2, GitBranch, Loader2, Merge, Ruler, Trash2, TriangleAlert, XCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import { ambilIsiInspeksi, type BarisJtm, type JawabanTiang } from "../_hooks/useDaftarJtm";
import { NADA_STATUS, km, rentangKerja, statusTampil, tglJam } from "../_lib/tampilan";

/**
 * Modal persetujuan inspeksi JTM — pola Kinerja Pelayanan Teknik.
 *
 *   Setujui     → hasilnya masuk `tiang_kondisi_terakhir`, jadi angka & temuan
 *   Kembalikan  → salah kerja, ULANGI (alasan wajib)
 *   Batalkan    → salah segmen / uji coba, JANGAN diulang (dijauhkan ke kiri)
 *   Buang       → hanya catatan nol tiang, bekas layar yang pernah dibuka
 */

interface Props {
  d: BarisJtm;
  memproses: string | null;
  onTutup: () => void;
  putuskan: (id: string, setuju: boolean, catatan?: string) => Promise<void>;
  batalkan: (id: string, alasan: string) => Promise<void>;
  buang: (id: string) => Promise<void>;
  gabung: (id: string) => Promise<{ penyapuan_dibuang: number; tiang_dinilai: number }>;
}

function Fakta({ ikon, label, nilai }: { ikon: React.ReactNode; label: string; nilai: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {ikon}
        {label}
      </p>
      <p className="text-sm font-semibold text-ink mt-1 truncate">{nilai}</p>
    </div>
  );
}

export default function DetailInspeksiJtmModal({ d, memproses, onTutup, putuskan, batalkan, buang, gabung }: Props) {
  const toast = useToast();
  const [isi, setIsi] = useState<JawabanTiang[] | null>(null);
  const [galatIsi, setGalatIsi] = useState<string | null>(null);
  const [hanyaTemuan, setHanyaTemuan] = useState(false);
  const [dialog, setDialog] = useState<"kembalikan" | "batalkan" | "buang" | "satukan" | null>(null);
  const status = statusTampil(d.status);
  const sibuk = memproses === d.id;

  // Dipasang ulang per inspeksi (key = id di halaman); tiang_dinilai ikut
  // menentukan karena "Satukan" memindahkan penilaian ke catatan ini.
  useEffect(() => {
    let hidup = true;
    ambilIsiInspeksi(d.id).then(
      (h) => { if (hidup) setIsi(h); },
      (e: Error) => { if (hidup) setGalatIsi(e.message); },
    );
    return () => { hidup = false; };
  }, [d.id, d.tiang_dinilai]);

  const jalankan = async (kerja: () => Promise<unknown>, pesan: string) => {
    try {
      await kerja();
      toast.success(pesan);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
      return false;
    }
  };

  const menunggu = d.status === "Selesai";
  const kosong = d.tiang_dinilai === 0;
  const bisaBuang = kosong && d.status !== "Diverifikasi" && d.status !== "Dibatalkan";
  const bisaBatal = !kosong && d.status !== "Dibatalkan";
  const tampilIsi = (isi ?? []).filter((t) => !hanyaTemuan || t.isi.some((x) => !x.normal));

  const footer = (
    <>
      {bisaBatal ? (
        <button onClick={() => setDialog("batalkan")} className={`${BTN_GHOST} text-ink-muted hover:text-red-600`} disabled={sibuk}>
          <Ban size={14} /> Batalkan
        </button>
      ) : bisaBuang ? (
        <button onClick={() => setDialog("buang")} className={`${BTN_GHOST} text-ink-muted hover:text-red-600`} disabled={sibuk}>
          <Trash2 size={14} /> Buang catatan kosong
        </button>
      ) : <span />}
      {menunggu ? (
        <div className="flex gap-2">
          <button onClick={() => setDialog("kembalikan")} className={BTN_GHOST} disabled={sibuk}>
            <XCircle size={14} /> Kembalikan ke regu
          </button>
          <button
            onClick={() => void jalankan(() => putuskan(d.id, true), "Disetujui — hasilnya kini terhitung.")}
            className={BTN_PRIMARY}
            disabled={sibuk}
          >
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Setujui inspeksi
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
        title={`Inspeksi JTM · ${d.segmen_nama ?? "(segmen terhapus)"}`}
        subtitle={`${d.penyulang} · ${d.ulp} · tier ${d.tier} · ${status}`}
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={footer}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS[status]}`}>
          {status}
        </span>

        {menunggu && (
          <p className="text-xs text-ink-soft">
            Sebelum disetujui, hasil inspeksi ini <b>belum terhitung di mana pun</b> — bukan hilang, tapi juga belum
            jadi angka maupun temuan.
          </p>
        )}

        {d.kembar > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            <TriangleAlert size={15} className="text-amber-700 shrink-0" />
            <p className="text-xs text-amber-800 flex-1 min-w-[240px]">
              Segmen ini punya <b>{d.kembar + 1} catatan inspeksi terbuka</b> padahal satu pekerjaan — lahir sebelum
              perbaikan, saat masuk lagi ke segmen yang sudah selesai membuat catatan baru. Menyatukannya memindahkan
              semua penilaian ke catatan ini; tiang yang dinilai dua kali diambil yang terbaru.
            </p>
            <button
              onClick={() => setDialog("satukan")}
              disabled={sibuk}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50"
            >
              <Merge size={14} /> Satukan ke sini
            </button>
          </div>
        )}

        {(d.status === "Ditolak" || d.status === "Dibatalkan") && d.verified_note && (
          <p className="text-xs rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-800">
            <b>{d.status === "Ditolak" ? "Dikembalikan" : "Dibatalkan"}:</b> {d.verified_note}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Fakta ikon={<GitBranch size={14} />} label="Tiang dinilai" nilai={`${d.tiang_dinilai} / ${d.tiang_segmen}`} />
          <Fakta ikon={<Ruler size={14} />} label="Panjang segmen" nilai={km(d.panjang_km)} />
          <Fakta ikon={<TriangleAlert size={14} />} label="Temuan" nilai={String(d.temuan)} />
          <Fakta ikon={<Calendar size={14} />} label="Tanggal" nilai={rentangKerja(d.tgl_mulai, d.tgl_selesai)} />
        </div>

        <div className="text-xs text-ink-soft space-y-1">
          <p><span className={EYEBROW}>Regu</span> {d.petugas_nama ?? "—"} · {d.jumlah_foto} foto</p>
          {d.catatan && <p><span className={EYEBROW}>Catatan regu</span> {d.catatan}</p>}
          {d.verified_by && d.status === "Diverifikasi" && (
            <p>
              <span className={EYEBROW}>Disetujui</span> {d.verified_by} · {tglJam(d.verified_at)}
              {d.verified_note ? ` — ${d.verified_note}` : ""}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className={EYEBROW}>Tiang yang dinilai</p>
            <label className="inline-flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
              <input type="checkbox" checked={hanyaTemuan} onChange={(e) => setHanyaTemuan(e.target.checked)} className="accent-navy-600" />
              Hanya yang bertemuan
            </label>
          </div>
          {galatIsi ? (
            <p className="text-sm text-red-600">Isi inspeksi gagal dimuat: {galatIsi}</p>
          ) : isi === null ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted py-6">
              <Loader2 size={15} className="animate-spin" /> Memuat isi inspeksi…
            </div>
          ) : tampilIsi.length === 0 ? (
            <p className="text-sm text-ink-muted py-4">{hanyaTemuan ? "Tidak ada tiang bertemuan." : "Tidak ada tiang yang dinilai."}</p>
          ) : (
            <div className="space-y-2">
              {tampilIsi.map((t) => <IsiTiang key={t.tiangId} t={t} />)}
            </div>
          )}
        </div>
      </ModalShell>

      {dialog === "kembalikan" && (
        <BatalkanModal
          judul="Kembalikan inspeksi ini ke regu?"
          keterangan="Segmen ini kembali jadi pekerjaan regu, dan alasannya terbaca di aplikasi."
          labelTombol="Kembalikan ke regu"
          placeholder="Apa yang harus diperbaiki — mis. tiang 12–15 belum dinilai, foto temuan isolator buram"
          onTutup={() => setDialog(null)}
          onBatalkan={(catatan) => jalankan(() => putuskan(d.id, false, catatan), "Dikembalikan ke regu.")}
        />
      )}
      {dialog === "batalkan" && (
        <BatalkanModal
          judul="Batalkan inspeksi JTM ini?"
          keterangan="Catatannya dibuang dari hitungan cakupan dan rekap temuan. Tiang yang sudah dinilai TIDAK ikut dibatalkan — tiangnya nyata berdiri di lapangan."
          peringatan="Berbeda dengan Kembalikan: segmennya tidak dikembalikan jadi pekerjaan, jadi tidak akan ada yang mengerjakannya ulang."
          labelTombol="Batalkan inspeksi"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasan) => jalankan(() => batalkan(d.id, alasan), "Inspeksi dibatalkan.")}
        />
      )}
      {dialog === "buang" && (
        <ConfirmDialog
          title="Buang catatan kosong ini?"
          message="Tidak ada satu pun tiang yang dinilai — ini bekas layar yang pernah dibuka, bukan pekerjaan."
          confirmLabel="Buang"
          tone="danger"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void jalankan(() => buang(d.id), "Catatan kosong dibuang.").then((ok) => ok && onTutup());
          }}
        />
      )}
      {dialog === "satukan" && (
        <ConfirmDialog
          title="Satukan catatan inspeksi segmen ini?"
          message={`${d.kembar} catatan lain di segmen dan tier yang sama dipindahkan ke catatan ini, lalu dibuang. Tiang yang dinilai dua kali diambil yang terbaru.`}
          confirmLabel="Satukan"
          tone="primary"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            gabung(d.id).then(
              (h) => toast.success(`${h.penyapuan_dibuang} catatan disatukan — kini ${h.tiang_dinilai} tiang dalam satu catatan.`),
              (e: Error) => toast.error(e.message),
            );
          }}
        />
      )}
    </>
  );
}

function IsiTiang({ t }: { t: JawabanTiang }) {
  const [buka, setBuka] = useState(false);
  const temuan = t.isi.filter((x) => !x.normal);

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <button onClick={() => setBuka((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left bg-surface/60">
        <span className="text-xs font-semibold text-ink">{t.tiangKode}</span>
        <span className="text-[11px] text-ink-muted">
          {t.isi.length} isian
          {t.jarakM !== null ? ` · ${t.jarakM} m dari petugas` : ""}
        </span>
        <span className="flex-1" />
        {temuan.length > 0 && <span className="text-[11px] font-semibold text-amber-700">{temuan.length} temuan</span>}
      </button>

      {buka && (
        <div className="divide-y divide-line">
          {t.isi.map((x) => (
            <div key={x.itemKode + x.bagian} className={`flex items-start gap-3 px-3 py-2 ${x.normal ? "" : "bg-amber-50/60"}`}>
              <span className="text-xs text-ink-soft w-[190px] shrink-0">
                {x.itemNama}
                {x.bagian !== "-" ? ` (${x.bagian})` : ""}
              </span>
              <span className={`text-xs flex-1 ${x.normal ? "text-ink" : "text-amber-800 font-semibold"}`}>
                {x.nilaiLabel ?? "—"}
                {x.catatan ? <span className="text-ink-muted"> — {x.catatan}</span> : null}
              </span>
              {x.fotoUrl && (
                <a href={x.fotoUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-navy-600 hover:underline shrink-0">
                  foto
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
