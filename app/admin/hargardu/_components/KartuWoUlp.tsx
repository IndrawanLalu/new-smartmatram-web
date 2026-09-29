"use client";

import { useState } from "react";
import { Ban, CalendarCheck, ChevronDown, Loader2, Save, Send } from "lucide-react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CARD, DISPLAY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { intervalBulan, saranKuota, type KandidatHar, type WoHarSettings } from "../_lib/kandidatWo";
import { statusWo, type BarisWoHar, type WoHarHeader } from "../_hooks/useWoHargardu";

/**
 * Satu ULP pada WO Pemeliharaan bulan terpilih: ringkasan realisasi kalau WO
 * sudah terbit, tombol terbitkan kalau belum, dan kriteria penyusunannya.
 */

const FREKUENSI = [1, 2, 3, 4, 6, 12];

interface Props {
  ulp: string;
  periode: string;
  header: WoHarHeader | null;
  kandidat: KandidatHar[];
  aktif: number;
  /** Gardu Rencana Pemeliharaan bulan ini; 0 = disusun sistem. */
  rencana: number;
  sisa: number;
  rows: BarisWoHar[];
  settings: WoHarSettings;
  bolehKelola: boolean;
  memproses: string | null;
  terbitkan: (ulp: string) => Promise<number>;
  batalkan: (woId: string, alasan: string) => Promise<void>;
  simpanSetting: (ulp: string, s: WoHarSettings) => Promise<void>;
}

function Angka({ label, nilai, nada = "text-ink" }: { label: string; nilai: string | number; nada?: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className={`${DISPLAY} text-lg font-bold tabular-nums ${nada}`}>{nilai}</p>
    </div>
  );
}

export default function KartuWoUlp(p: Props) {
  const toast = useToast();
  const [atur, setAtur] = useState(false);
  const [draf, setDraf] = useState<WoHarSettings>(p.settings);
  const [dialog, setDialog] = useState<"terbit" | "hapus" | null>(null);

  const dariRencana = p.rencana > 0;
  const jumlahTerbit = dariRencana ? p.rencana + p.sisa : Math.min(p.settings.kuota_per_bulan, p.kandidat.length);
  const belumPernah = p.kandidat.filter((k) => k.alasan === "belum_pernah").length;
  const jadi = p.rows.filter((r) => r.terealisasi).length;
  const tunggu = p.rows.filter((r) => statusWo(r) === "Menunggu persetujuan").length;
  const jalan = p.rows.filter((r) => statusWo(r) === "Sedang dikerjakan").length;
  // Gardu yang sudah disentuh regu mengunci WO dari pembatalan (dijaga database juga).
  const belum = p.rows.filter((r) => statusWo(r) === "Belum dikerjakan").length;
  const pct = p.rows.length > 0 ? Math.round((jadi / p.rows.length) * 100) : 0;
  const berubah = JSON.stringify(draf) !== JSON.stringify(p.settings);

  const jalankan = async (kerja: () => Promise<unknown>, pesan: string) => {
    try {
      await kerja();
      toast.success(pesan);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    }
  };

  return (
    <div className={`${CARD} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`${DISPLAY} text-base font-bold text-ink`}>{p.ulp}</p>
        {p.header ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700">
            <CalendarCheck size={12} /> WO terbit
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">Belum terbit</span>
        )}
      </div>

      {p.header ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Angka label="Gardu WO" nilai={p.rows.length} />
            <Angka label="Terealisasi" nilai={jadi} nada="text-emerald-700" />
            <Angka label="Belum disetujui" nilai={tunggu} nada={tunggu > 0 ? "text-amber-700" : "text-ink-muted"} />
            <Angka label="Dikerjakan" nilai={jalan} nada={jalan > 0 ? "text-sky-700" : "text-ink-muted"} />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-emerald-700 w-10 text-right">{pct}%</span>
          </div>
          {p.header.kriteria?.sumber === "rencana" && (
            <p className="text-[11px] text-ink-muted">
              Disusun dari Rencana Pemeliharaan: {p.header.kriteria.rencana ?? 0} gardu rencana + {p.header.kriteria.sisa ?? 0} sisa bulan lalu
              {p.header.kriteria.otomatis ? " · terbit otomatis" : ""}.
            </p>
          )}
        </>
      ) : dariRencana ? (
        <p className="text-xs text-ink-soft">
          <b className="text-ink">Rencana Pemeliharaan</b> · {p.rencana.toLocaleString("id-ID")} gardu
          {p.sisa > 0 && <> + {p.sisa.toLocaleString("id-ID")} sisa WO bulan lalu yang belum dikerjakan</>}. Terbit otomatis
          tanggal 1 pukul 00.05 WITA — tombol di bawah untuk menerbitkan sekarang.
        </p>
      ) : (
        <p className="text-xs text-ink-soft">
          <b className="text-ink">{p.kandidat.length.toLocaleString("id-ID")}</b> gardu jatuh tempo
          {belumPernah > 0 && <> ({belumPernah.toLocaleString("id-ID")} belum pernah dipelihara)</>} dari{" "}
          {p.aktif.toLocaleString("id-ID")} gardu aktif. Kuota {p.settings.kuota_per_bulan} gardu/bulan.
        </p>
      )}

      {p.bolehKelola && (
        <div className="flex flex-wrap items-center gap-2">
          {p.header ? (
            <button
              onClick={() => setDialog("hapus")}
              className={`${BTN_GHOST} text-ink-muted hover:text-red-600`}
              disabled={!!p.memproses || p.rows.length - belum > 0}
              title={p.rows.length - belum > 0 ? `${p.rows.length - belum} gardu sudah dikerjakan regu — WO tidak bisa dibatalkan` : undefined}
            >
              <Ban size={14} /> Batalkan WO
            </button>
          ) : (
            <button onClick={() => setDialog("terbit")} className={BTN_PRIMARY} disabled={jumlahTerbit === 0 || !!p.memproses}>
              {p.memproses === `wo-${p.ulp}` ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Terbitkan {jumlahTerbit} gardu
            </button>
          )}
          <button onClick={() => setAtur((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:text-navy-500">
            Kriteria <ChevronDown size={13} className={atur ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
        </div>
      )}

      {atur && p.bolehKelola && (
        <div className="rounded-xl border border-line bg-surface/60 p-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className={EYEBROW}>Frekuensi</span>
              <select
                value={draf.frekuensi_per_tahun}
                onChange={(e) => setDraf({ ...draf, frekuensi_per_tahun: Number(e.target.value) })}
                className={`${FIELD} mt-1 w-full`}
              >
                {FREKUENSI.map((f) => (
                  <option key={f} value={f}>{f}× setahun (tiap {intervalBulan(f)} bln)</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className={EYEBROW}>Kuota per bulan</span>
              <input
                type="number"
                min={1}
                max={2000}
                value={draf.kuota_per_bulan}
                onChange={(e) => setDraf({ ...draf, kuota_per_bulan: Math.max(1, Math.min(2000, Number(e.target.value) || 1)) })}
                className={`${FIELD} mt-1 w-full`}
              />
            </label>
          </div>
          <p className="text-[11px] text-ink-muted">
            Saran: <b className="text-ink">{saranKuota(p.aktif, draf.frekuensi_per_tahun)} gardu/bulan</b> supaya{" "}
            {p.aktif.toLocaleString("id-ID")} gardu aktif terpelihara {draf.frekuensi_per_tahun}× setahun.
          </p>
          <label className="inline-flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={draf.hanya_gardu_aktif}
              onChange={(e) => setDraf({ ...draf, hanya_gardu_aktif: e.target.checked })}
              className="accent-navy-600"
            />
            Hanya gardu berstatus Aktif (tanpa status dianggap Aktif)
          </label>
          <div className="flex justify-end">
            <button
              onClick={() => void jalankan(() => p.simpanSetting(p.ulp, draf), `Kriteria WO ${p.ulp} disimpan.`)}
              className={BTN_PRIMARY}
              disabled={!berubah || !!p.memproses}
            >
              <Save size={14} /> Simpan kriteria
            </button>
          </div>
          {p.header && (
            <p className="text-[11px] text-ink-muted">Berlaku untuk WO berikutnya — WO {p.periode} yang sudah terbit tidak berubah.</p>
          )}
        </div>
      )}

      {dialog === "terbit" && (
        <ConfirmDialog
          title={`Terbitkan WO Pemeliharaan ${p.ulp} — ${p.periode}?`}
          message={`${jumlahTerbit} gardu${dariRencana ? ` (${p.rencana} dari Rencana Pemeliharaan${p.sisa > 0 ? `, ${p.sisa} sisa bulan lalu` : ""})` : ""} masuk WO dan langsung muncul di HP regu HARGAR ${p.ulp}. WO yang sudah terbit tidak bisa disusun ulang tanpa dihapus lebih dulu.`}
          confirmLabel="Terbitkan"
          tone="primary"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void jalankan(() => p.terbitkan(p.ulp), `WO ${p.ulp} terbit — ${jumlahTerbit} gardu.`);
          }}
        />
      )}
      {dialog === "hapus" && p.header && (
        <BatalkanModal
          judul={`Batalkan WO Pemeliharaan ${p.ulp} — ${p.periode}?`}
          keterangan={`${p.rows.length} gardu hilang dari daftar WO di HP regu dan tidak dihitung di rekap. WO beserta alasannya tersimpan di arsip pembatalan, dan bulan ini bisa diterbitkan ulang.`}
          labelTombol="Batalkan WO"
          onTutup={() => setDialog(null)}
          onBatalkan={async (alasan) => {
            try {
              await p.batalkan(p.header!.id, alasan);
              toast.success(`WO ${p.ulp} dibatalkan.`);
              return true;
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal membatalkan WO.");
              return false;
            }
          }}
        />
      )}
    </div>
  );
}
