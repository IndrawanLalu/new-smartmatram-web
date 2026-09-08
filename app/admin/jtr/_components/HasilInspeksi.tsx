"use client";

import { useState, useMemo } from "react";
import { Loader2, Download, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { type CurrentUser } from "@/lib/roles";
import { CARD, EYEBROW, BTN_PRIMARY } from "@/app/admin/_ui";
import { useTiangJtr, tanggalPeriksa, type TiangBaris } from "../_hooks/useTiangJtr";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const SELECT =
  "h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15";

const PER_HALAMAN = 20;

const tgl = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const kabelRingkas = (t: TiangBaris) =>
  t.tiang_konduktor?.length
    ? t.tiang_konduktor
        .sort((a, b) => a.nomor - b.nomor)
        .map((k) => `${k.ukuran ?? "?"}${k.kondisi && k.kondisi !== "Baik" ? ` (${k.kondisi})` : ""}`)
        .join(" · ")
    : "—";

const jamperanRingkas = (t: TiangBaris) =>
  t.jamperan?.length ? `${t.jamperan[0].jenis ?? "—"} · ${t.jamperan[0].kondisi ?? "—"}` : "Tidak ada";

export default function HasilInspeksi({ user }: { user: CurrentUser }) {
  const { baris, penyulangList, garduList, loading, error } = useTiangJtr(user);

  const sekarang = new Date();
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tanggal, setTanggal] = useState("");
  const [penyulang, setPenyulang] = useState("");
  const [gardu, setGardu] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [mengunduh, setMengunduh] = useState(false);

  const garduTersedia = useMemo(() => {
    if (!penyulang) return garduList;
    return [...new Set(baris.filter((b) => b.penyulang === penyulang).map((b) => b.gardu_kode))].sort();
  }, [baris, garduList, penyulang]);

  const tersaring = useMemo(() => {
    const hasil = baris.filter((b) => {
      const iso = tanggalPeriksa(b);
      if (!iso) return false;
      const d = new Date(iso);

      // Tanggal tertentu mengalahkan penyaring bulan — kalau orang mengisi
      // tanggal, itu yang dia maksud.
      if (tanggal) {
        if (d.toISOString().slice(0, 10) !== tanggal) return false;
      } else if (d.getFullYear() !== tahun || d.getMonth() + 1 !== bulan) {
        return false;
      }

      if (penyulang && b.penyulang !== penyulang) return false;
      if (gardu && b.gardu_kode !== gardu) return false;
      return true;
    });
    return hasil.sort(
      (a, b) => new Date(tanggalPeriksa(b)).getTime() - new Date(tanggalPeriksa(a)).getTime(),
    );
  }, [baris, tahun, bulan, tanggal, penyulang, gardu]);

  const totalHalaman = Math.max(1, Math.ceil(tersaring.length / PER_HALAMAN));
  const halamanAman = Math.min(halaman, totalHalaman);
  const potong = tersaring.slice((halamanAman - 1) * PER_HALAMAN, halamanAman * PER_HALAMAN);

  async function unduh() {
    setMengunduh(true);
    try {
      const p = new URLSearchParams();
      if (tanggal) p.set("tanggal", tanggal);
      else {
        p.set("tahun", String(tahun));
        p.set("bulan", String(bulan));
      }
      if (penyulang) p.set("penyulang", penyulang);
      if (gardu) p.set("gardu", gardu);

      const res = await fetch(`/api/export/jtr?${p.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal mengunduh");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspeksi-jtr-${tanggal || `${tahun}-${String(bulan).padStart(2, "0")}`}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengunduh");
    } finally {
      setMengunduh(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat hasil inspeksi…
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>;

  return (
    <div className="space-y-3">
      <div className={`${CARD} px-4 py-3 flex flex-wrap items-end gap-3`}>
        <div>
          <p className={EYEBROW}>Bulan</p>
          <select
            value={bulan}
            onChange={(e) => { setBulan(Number(e.target.value)); setTanggal(""); setHalaman(1); }}
            disabled={!!tanggal}
            className={`${SELECT} mt-1 disabled:opacity-40`}
          >
            {BULAN.map((b, i) => (
              <option key={b} value={i + 1}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <p className={EYEBROW}>Tahun</p>
          <select
            value={tahun}
            onChange={(e) => { setTahun(Number(e.target.value)); setTanggal(""); setHalaman(1); }}
            disabled={!!tanggal}
            className={`${SELECT} mt-1 disabled:opacity-40`}
          >
            {Array.from({ length: 3 }, (_, i) => sekarang.getFullYear() - i).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <p className={EYEBROW}>Tanggal tertentu</p>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => { setTanggal(e.target.value); setHalaman(1); }}
            className={`${SELECT} mt-1`}
          />
        </div>

        <div>
          <p className={EYEBROW}>Penyulang</p>
          <select
            value={penyulang}
            onChange={(e) => { setPenyulang(e.target.value); setGardu(""); setHalaman(1); }}
            className={`${SELECT} mt-1 min-w-[160px]`}
          >
            <option value="">Semua</option>
            {penyulangList.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div>
          <p className={EYEBROW}>Gardu</p>
          <select
            value={gardu}
            onChange={(e) => { setGardu(e.target.value); setHalaman(1); }}
            className={`${SELECT} mt-1 min-w-[140px]`}
          >
            <option value="">Semua</option>
            {garduTersedia.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <button onClick={unduh} disabled={mengunduh || tersaring.length === 0} className={`${BTN_PRIMARY} ml-auto`}>
          {mengunduh ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Unduh Excel
        </button>
      </div>

      {tersaring.length === 0 ? (
        <div className={`${CARD} flex flex-col items-center gap-2 py-24 text-center`}>
          <Inbox size={34} className="text-ink-muted" />
          <p className="font-semibold text-ink">Tidak ada inspeksi pada periode ini</p>
          <p className="text-sm text-ink-soft">Coba ganti bulan, atau kosongkan penyaringnya.</p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-4 py-2.5 border-b border-line text-sm text-ink-soft">
            <b className="text-ink">{tersaring.length.toLocaleString("id-ID")}</b> tiang diperiksa
            {tanggal ? ` pada ${tgl(tanggal)}` : ` di ${BULAN[bulan - 1]} ${tahun}`}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-ink-soft border-b border-line bg-surface">
                  {["Tanggal","Tiang","Gardu","Penyulang","Jur","Jenis","Tinggi","Kondisi","Kabel","Aksesoris","Jamperan","Andongan","SR","Arde","Stay","Rawan ROW","TM","Catatan","Petugas"].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {potong.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0 hover:bg-surface/60">
                    <td className="px-3 py-2 text-ink-soft">{tgl(tanggalPeriksa(t))}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{t.kode}</td>
                    <td className="px-3 py-2 text-ink-soft">{t.gardu_kode}</td>
                    <td className="px-3 py-2 text-ink-soft">{t.penyulang ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-soft">{t.jurusan ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-soft">{t.jenis ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-soft tabular-nums">{t.tinggi ?? "—"}</td>
                    <td className={`px-3 py-2 ${t.kondisi && t.kondisi !== "Baik" ? "text-red-600 font-semibold" : "text-ink-soft"}`}>
                      {t.kondisi ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{kabelRingkas(t)}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {[t.aks_suspension, t.aks_large_angle, t.aks_dead_end].filter((v) => v && v !== "Tidak Ada").join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{jamperanRingkas(t)}</td>
                    <td className="px-3 py-2 text-ink-soft">{t.andongan ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-soft tabular-nums">{t.tarikan_sr ?? 0}</td>
                    <td className={`px-3 py-2 ${t.arde_kondisi === "Putus" ? "text-attention font-semibold" : "text-ink-soft"}`}>
                      {t.arde_kondisi ?? "—"}
                      {t.arde_nilai_ohm != null ? ` (${t.arde_nilai_ohm}Ω)` : ""}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{t.stay_kondisi ?? "—"}</td>
                    <td className={`px-3 py-2 ${(t.rawan_row?.length ?? 0) > 0 ? "text-attention font-semibold" : "text-ink-soft"}`}>
                      {t.rawan_row?.length ? t.rawan_row.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{t.underbuild_tm ? "Ya" : "—"}</td>
                    <td className="px-3 py-2 text-ink-soft max-w-[220px] truncate" title={t.catatan_perbaikan ?? ""}>
                      {t.catatan_perbaikan ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{t.dikonfirmasi_oleh ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalHalaman > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-line text-sm">
              <span className="text-ink-soft">
                Halaman {halamanAman} dari {totalHalaman}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setHalaman((h) => Math.max(1, h - 1))}
                  disabled={halamanAman === 1}
                  className="h-8 w-8 rounded-lg border border-line bg-white flex items-center justify-center disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
                  disabled={halamanAman === totalHalaman}
                  className="h-8 w-8 rounded-lg border border-line bg-white flex items-center justify-center disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
