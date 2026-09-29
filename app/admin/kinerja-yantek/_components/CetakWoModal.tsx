"use client";

import { useState } from "react";
import { CalendarX, FileSpreadsheet, FileText, Loader2, Settings, TriangleAlert } from "lucide-react";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CurrentUser } from "@/lib/roles";
import { useWoSurat } from "../_hooks/useWoSurat";
import { potretAngka, susunPaket } from "../_lib/bahanSurat";
import { JENIS_SURAT, labelBulan, labelTanggal, tglSurat, type PaketSurat } from "../_lib/woSurat";
import DaftarJenisWo from "./DaftarJenisWo";
import TempelWoModal from "./TempelWoModal";
import PengaturanSuratModal from "./PengaturanSuratModal";
import HariLiburModal from "./HariLiburModal";
import PratinjauWoModal from "./PratinjauWoModal";

/**
 * Cetak / Kirim WO — surat pengantar WO bulanan ke mitra + lampiran rencana
 * kerja, satu ULP satu bulan. Surat bertanggal hari terakhir bulan
 * sebelumnya (keputusan user 29 Sep 2026).
 */

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

const bulanDepan = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

interface Props {
  user: CurrentUser;
  ulpAwal: string | null;
  onTutup: () => void;
  /** WO manual berubah — Rekap Kinerja di belakang ikut dimuat ulang. */
  onBerubah: () => void;
}

export default function CetakWoModal({ user, ulpAwal, onTutup, onBerubah }: Props) {
  const toast = useToast();
  const up3 = user.role === "UP3";
  const oleh = user.name ?? user.email;
  const [ulp, setUlp] = useState(up3 ? (ulpAwal ?? UNIT[0]) : (user.unit ?? "").toUpperCase());
  const [periode, setPeriode] = useState(bulanDepan);
  const [tahun, bulan] = periode.split("-").map(Number);
  const { data, galat, loading, muatUlang } = useWoSurat(ulp, tahun, bulan);
  // null = belum diketik: pakai nomor surat yang pernah terbit untuk bulan ini.
  const [nomorKetik, setNomorKetik] = useState<string | null>(null);
  const nomor = nomorKetik ?? data?.terbit?.nomor ?? "";
  const [tempel, setTempel] = useState<string | null>(null);
  const [hapus, setHapus] = useState<string | null>(null);
  const [atur, setAtur] = useState<"surat" | "libur" | null>(null);
  const [paket, setPaket] = useState<PaketSurat | null>(null);
  const [sibuk, setSibuk] = useState<"pdf" | "xlsx" | null>(null);

  const ganti = (u: string, p: string) => { setNomorKetik(null); setUlp(u); setPeriode(p); };
  const berubah = () => { muatUlang(); onBerubah(); };

  const s = data?.set;
  const kurang = s
    ? [
        !s.nama_manager && "nama Manager",
        !s.mitra && "pelaksana (mitra)",
        !s.penerima && "penerima",
        !s.ttd_manager && "tanda tangan Manager",
        !s.ttd_tl && "tanda tangan pembuat lampiran",
      ].filter(Boolean)
    : [];

  const siapkan = async (jenis: "pdf" | "xlsx") => {
    if (!data) return;
    setSibuk(jenis);
    try {
      const p = await susunPaket(data, ulp, tahun, bulan, nomor.trim());
      if (jenis === "pdf") setPaket(p);
      else {
        const { unduhExcelSurat } = await import("../_lib/unduhExcel");
        await unduhExcelSurat(p);
        await catatTerbit(p);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyiapkan surat");
    } finally {
      setSibuk(null);
    }
  };

  const catatTerbit = async (p: PaketSurat) => {
    const { error } = await supabaseBrowser.from("wo_surat").upsert({
      ulp, tahun, bulan, nomor: p.nomor, tgl_surat: p.tglSurat, angka: potretAngka(p),
      oleh, oleh_uid: user.id, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  };

  const hapusTempelan = async (kunci: string) => {
    const { error } = await supabaseBrowser.rpc("simpan_wo_manual", {
      p_ulp: ulp, p_tahun: tahun, p_bulan: bulan, p_jenis: kunci, p_item: [], p_oleh: oleh,
    });
    if (error) return toast.error(error.message);
    toast.success("Tempelan dihapus.");
    berubah();
  };

  const footer = (
    <>
      <div className="flex gap-2">
        <button onClick={() => setAtur("surat")} className={BTN_GHOST} disabled={!data}>
          <Settings size={14} /> Pengaturan Surat
        </button>
        <button onClick={() => setAtur("libur")} className={BTN_GHOST}>
          <CalendarX size={14} /> Hari Libur
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => void siapkan("xlsx")} className={BTN_GHOST} disabled={!data || !nomor.trim() || !!sibuk}>
          {sibuk === "xlsx" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Unduh Excel
        </button>
        <button onClick={() => void siapkan("pdf")} className={BTN_PRIMARY} disabled={!data || !nomor.trim() || !!sibuk}>
          {sibuk === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Lihat PDF
        </button>
      </div>
    </>
  );

  return (
    <>
      <ModalShell
        title="Cetak / Kirim WO"
        subtitle="Surat WO bulanan Yantek ke pelaksana, berikut lampiran rencana kerja per pekerjaan"
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={footer}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-ink-soft">
            ULP
            <select value={ulp} onChange={(e) => ganti(e.target.value, periode)} disabled={!up3} className={`${FIELD} w-[160px] mt-1 block`}>
              {(up3 ? UNIT : [ulp]).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-soft">
            Bulan WO
            <input
              type="month"
              value={periode}
              onChange={(e) => e.target.value && ganti(ulp, e.target.value)}
              className={`${FIELD} w-[170px] mt-1 block`}
            />
          </label>
          <label className="text-xs text-ink-soft flex-1 min-w-[220px]">
            Nomor surat
            <input
              value={nomor}
              onChange={(e) => setNomorKetik(e.target.value)}
              placeholder="008/DIS.00.04/190206/2026"
              className={`${FIELD} w-full mt-1 block`}
            />
          </label>
          <div className="text-xs text-ink-soft">
            Tanggal surat
            <p className="h-9 mt-1 flex items-center font-semibold text-ink">{labelTanggal(tglSurat(tahun, bulan))}</p>
          </div>
        </div>

        {data?.terbit && (
          <p className="text-[11px] text-ink-muted">
            Surat {labelBulan(tahun, bulan)} sudah pernah diterbitkan ({data.terbit.nomor}) oleh {data.terbit.oleh ?? "—"} —
            mencetak lagi menimpa catatannya.
          </p>
        )}

        {kurang.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>Pengaturan surat ULP {ulp} belum lengkap: {kurang.join(", ")}. Lengkapi lewat <b>Pengaturan Surat</b>.</span>
          </div>
        )}

        {galat && <p className="text-sm text-red-600">Data WO gagal dibaca: {galat}</p>}
        {loading && !galat && (
          <div className="flex items-center gap-2 text-xs text-ink-soft py-6 justify-center">
            <Loader2 size={14} className="animate-spin" /> memuat WO {labelBulan(tahun, bulan)}…
          </div>
        )}
        {data && !loading && (
          <DaftarJenisWo data={data} bolehUbah onTempel={setTempel} onHapus={setHapus} />
        )}
        <p className="text-[11px] text-ink-soft leading-relaxed">
          Angka = kolom <b>WO terbit</b> Rekap Kinerja bulan itu. ULP yang belum menyusun WO di aplikasi memakai
          <b> Tempel dari Excel</b>: pekerjaan yang punya modul langsung menjadi WO modulnya dan tampil di HP regu, yang
          belum punya modul tersimpan untuk surat dan rekap. Kisi harian lampiran dibagi rata ke hari efektif (tanpa Sabtu,
          Minggu, dan hari libur).
        </p>
      </ModalShell>

      {tempel && (
        <TempelWoModal
          ulp={ulp} tahun={tahun} bulan={bulan} kunci={tempel} oleh={oleh}
          onTutup={() => setTempel(null)} onTersimpan={berubah}
        />
      )}
      {hapus && (
        <ConfirmDialog
          title="Hapus tempelan WO?"
          message={`Tempelan ${JENIS_SURAT.find((j) => j.kunci === hapus)?.nama} ${labelBulan(tahun, bulan)} ULP ${ulp} yang tersimpan untuk surat & rekap dihapus beserta centang realisasinya. WO yang sudah masuk modul tidak ikut terhapus — batalkan di modulnya.`}
          confirmLabel="Hapus"
          tone="danger"
          onConfirm={() => { const k = hapus; setHapus(null); void hapusTempelan(k); }}
          onClose={() => setHapus(null)}
        />
      )}
      {atur === "surat" && data && (
        <PengaturanSuratModal awal={data.set} oleh={oleh} onTutup={() => setAtur(null)} onTersimpan={muatUlang} />
      )}
      {atur === "libur" && (
        <HariLiburModal tahun={tahun} oleh={oleh} onTutup={() => setAtur(null)} onBerubah={muatUlang} />
      )}
      {paket && <PratinjauWoModal paket={paket} onTutup={() => setPaket(null)} onTerbit={() => catatTerbit(paket)} />}
    </>
  );
}
