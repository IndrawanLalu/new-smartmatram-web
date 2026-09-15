"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Merge, Trash2, X } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { usePenyapuan, type JawabanTiang, type Penyapuan } from "../_hooks/usePenyapuan";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

/**
 * Persetujuan penyapuan JTM.
 *
 * Tanpa layar ini seluruh modul JTM buntu: `tiang_kondisi_terakhir` hanya
 * memuat penyapuan berstatus 'Diverifikasi', jadi setiap tiang yang dinilai
 * regu tersimpan rapi dan tidak pernah muncul di angka mana pun. Regu bekerja
 * sehari penuh, lalu melihat nol di mana-mana.
 */

const NADA: Record<string, string> = {
  "Dalam Proses": "bg-amber-50 text-amber-700 border-amber-200",
  Selesai: "bg-blue-50 text-blue-700 border-blue-200",
  Diverifikasi: "bg-green-50 text-green-700 border-green-200",
  Ditolak: "bg-red-50 text-red-700 border-red-200",
  Dijadwalkan: "bg-gray-100 text-gray-600 border-gray-200",
};

const tanggal = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function DaftarPenyapuan({ user }: { user: CurrentUser }) {
  // UP3 melihat seluruh unit; peran lain terkunci di unitnya sendiri — aturan
  // yang sama dengan halaman JTM lainnya, bukan aturan baru untuk layar ini.
  const { baris, loading, isiPenyapuan, putuskan, gabung, buangKosong } = usePenyapuan(
    canSeeAllUnits(user.role) ? null : (user.unit ?? null),
  );
  const [buka, setBuka] = useState<string | null>(null);
  const [isi, setIsi] = useState<JawabanTiang[]>([]);
  const [memuatIsi, setMemuatIsi] = useState(false);

  const nama = user.name || user.email;

  /** Satu segmen = satu kartu, penyapuannya jadi riwayat di dalamnya.
   *
   *  Sebelum perbaikan `jtm-lanjut.sql`, tiap kali regu masuk lagi ke segmen
   *  yang sudah dinyatakan selesai lahir penyapuan baru — satu segmen PERUMNAS
   *  jadi punya tiga. Dikelompokkan begini, yang terbaca adalah pekerjaannya,
   *  bukan berapa kali layarnya dibuka. */
  const kelompok = useMemo(() => {
    const m = new Map<string, Penyapuan[]>();
    for (const b of baris) {
      const k = (b.segmenId ?? b.id) + "|" + b.tier;
      const d = m.get(k) ?? [];
      d.push(b);
      m.set(k, d);
    }
    return [...m.values()];
  }, [baris]);

  const bukaBaris = async (p: Penyapuan) => {
    if (buka === p.id) {
      setBuka(null);
      return;
    }
    setBuka(p.id);
    setIsi([]);
    setMemuatIsi(true);
    try {
      setIsi(await isiPenyapuan(p.id));
    } finally {
      setMemuatIsi(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat penyapuan…
      </div>
    );
  }

  const menunggu = baris.filter((b) => b.status === "Selesai");

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Penyapuan JTM</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Penyapuan yang dikirim regu menunggu diputuskan di sini. Sebelum disetujui,{" "}
          <b>hasilnya belum terhitung di mana pun</b> — bukan hilang, tapi juga belum jadi
          angka. Menolak wajib beralasan, karena regu yang dikembalikan tanpa sebab akan
          mengulang seluruh penyusuran sambil menebak apa yang salah.
        </p>
        {menunggu.length > 0 && (
          <p className="text-xs font-semibold text-blue-700 mt-2">
            {menunggu.length} penyapuan menunggu keputusan Anda.
          </p>
        )}
      </div>

      {baris.length === 0 && (
        <div className={`${CARD} p-10 text-center text-sm text-ink-muted`}>
          Belum ada penyapuan untuk unit ini.
        </div>
      )}

      {kelompok.map((g) => {
        const utama = g.reduce((a, b) => (b.tiangDinilai > a.tiangDinilai ? b : a), g[0]);
        const pecah = g.filter((x) => x.status !== "Diverifikasi").length > 1;
        return (
        <div key={utama.id} className="space-y-2">
          {pecah && (
            <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <AlertTriangle size={15} className="text-amber-700 shrink-0" />
              <p className="text-xs text-amber-800 flex-1 min-w-[240px]">
                Segmen ini punya <b>{g.length} catatan penyapuan</b> padahal satu pekerjaan.
                Lahir sebelum perbaikan, saat masuk lagi ke segmen yang sudah selesai membuat
                catatan baru. Menyatukannya memindahkan semua penilaian ke satu catatan —
                tiang yang dinilai dua kali diambil yang terbaru.
              </p>
              <button
                onClick={() => void gabung(utama.id, nama)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-500"
              >
                <Merge size={14} /> Satukan
              </button>
            </div>
          )}

          {g.map((p) => (
        <div key={p.id} className={CARD}>
          <button
            onClick={() => void bukaBaris(p)}
            className="w-full flex items-center gap-3 px-5 py-4 text-left"
          >
            {buka === p.id ? (
              <ChevronDown size={16} className="text-ink-muted shrink-0" />
            ) : (
              <ChevronRight size={16} className="text-ink-muted shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">
                {p.segmenNama ?? "(segmen terhapus)"}
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {p.penyulang} · tier {p.tier} · {p.petugasNama ?? "—"} ·{" "}
                {tanggal(p.tglSelesai ?? p.tglMulai)}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-ink-soft tabular-nums">
                {p.tiangDinilai}/{p.tiangSegmen} tiang
              </span>
              {p.temuan > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  <AlertTriangle size={11} /> {p.temuan}
                </span>
              )}
              <span
                className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 ${
                  NADA[p.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                {p.status}
              </span>
            </div>
          </button>

          {buka === p.id && (
            <div className="border-t border-line px-5 py-4">
              {p.catatan && (
                <p className="text-xs text-ink-soft mb-3">
                  <span className={EYEBROW}>Catatan regu</span> — {p.catatan}
                </p>
              )}
              {p.verifiedNote && (
                <p className="text-xs text-ink-soft mb-3">
                  <span className={EYEBROW}>Keputusan</span> {p.verifiedBy} ·{" "}
                  {tanggal(p.verifiedAt)} — {p.verifiedNote}
                </p>
              )}

              {memuatIsi ? (
                <div className="flex items-center gap-2 text-sm text-ink-muted py-6">
                  <Loader2 size={15} className="animate-spin" /> Memuat isi penyapuan…
                </div>
              ) : isi.length === 0 ? (
                <p className="text-sm text-ink-muted py-4">Tidak ada tiang yang dinilai.</p>
              ) : (
                <div className="space-y-2">
                  {isi.map((t) => (
                    <IsiTiang key={t.tiangId} t={t} />
                  ))}
                </div>
              )}

              {p.status === "Selesai" && (
                <Keputusan id={p.id} nama={nama} onPutuskan={putuskan} />
              )}

              {p.tiangDinilai === 0 && p.status !== "Diverifikasi" && (
                <div className="mt-4 pt-4 border-t border-line flex items-center gap-3">
                  <p className="text-xs text-ink-muted flex-1">
                    Tidak ada satu pun tiang yang dinilai — ini bekas layar yang pernah
                    dibuka, bukan pekerjaan.
                  </p>
                  <button
                    onClick={() => void buangKosong(p.id, nama)}
                    className={`${BTN_GHOST} text-danger`}
                  >
                    <Trash2 size={14} /> Buang
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
          ))}
        </div>
        );
      })}
    </div>
  );
}

function IsiTiang({ t }: { t: JawabanTiang }) {
  const [buka, setBuka] = useState(false);
  const temuan = t.isi.filter((x) => !x.normal);

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <button
        onClick={() => setBuka((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-surface/60"
      >
        <span className="text-xs font-semibold text-ink">{t.tiangKode}</span>
        <span className="text-[11px] text-ink-muted">
          {t.isi.length} isian
          {t.jarakM !== null ? ` · ${t.jarakM} m dari petugas` : ""}
        </span>
        <span className="flex-1" />
        {temuan.length > 0 && (
          <span className="text-[11px] font-semibold text-amber-700">
            {temuan.length} temuan
          </span>
        )}
      </button>

      {buka && (
        <div className="divide-y divide-line">
          {t.isi.map((x) => (
            <div
              key={x.itemKode + x.bagian}
              className={`flex items-start gap-3 px-3 py-2 ${x.normal ? "" : "bg-amber-50/60"}`}
            >
              <span className="text-xs text-ink-soft w-[190px] shrink-0">
                {x.itemNama}
                {x.bagian !== "-" ? ` (${x.bagian})` : ""}
              </span>
              <span
                className={`text-xs flex-1 ${
                  x.normal ? "text-ink" : "text-amber-800 font-semibold"
                }`}
              >
                {x.nilaiLabel ?? "—"}
                {x.catatan ? <span className="text-ink-muted"> — {x.catatan}</span> : null}
              </span>
              {x.fotoUrl && (
                <a
                  href={x.fotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold text-navy-600 hover:underline shrink-0"
                >
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

function Keputusan({
  id,
  nama,
  onPutuskan,
}: {
  id: string;
  nama: string;
  onPutuskan: (id: string, setuju: boolean, nama: string, catatan: string) => Promise<boolean>;
}) {
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const jalan = async (setuju: boolean) => {
    setSibuk(true);
    await onPutuskan(id, setuju, nama, catatan);
    setSibuk(false);
  };

  return (
    <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-2">
      <input
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        placeholder="Catatan — wajib kalau dikembalikan"
        className={`${FIELD} flex-1 min-w-[240px]`}
      />
      <button onClick={() => void jalan(false)} disabled={sibuk} className={BTN_GHOST}>
        <X size={15} /> Kembalikan
      </button>
      <button onClick={() => void jalan(true)} disabled={sibuk} className={BTN_PRIMARY}>
        <Check size={15} /> Setujui
      </button>
    </div>
  );
}
