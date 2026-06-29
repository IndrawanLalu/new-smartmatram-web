"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { fetchSheetData } from "@/lib/sheets";
import { fetchJurnalMap, normNoLaporan, type JurnalApkt } from "../_utils/jurnal";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RefGangguan {
  titik_gangguan: string;
  tgl_gangguan: string;
  jam_padam: string;
  durasi: string;
  penyebab: string;
}


export interface PadamApktRecord {
  id: string;
  no_laporan: string;
  ulp: string | null;
  penyulang: string | null;
  tgl_padam: string | null;
  jam_padam: string | null;
  tgl_nyala: string | null;
  jam_nyala: string | null;
  jml_pelanggan_padam: number | null;
  lama_padam_jam: number | null;
  jam_x_pelanggan_padam: number | null;
  ens: number | null;
  penyebab_padam: string | null;
  fasilitas: string | null;
  sub_fasilitas: string | null;
  equipment: string | null;
  event_damage: string | null;
  cause: string | null;
  group_cause: string | null;
  weather: string | null;
  keterangan: string | null;
  lokasi_gangguan: string | null;
  ampere: string | null;
  status_gangguan: string | null;
  analisis_keterangan: string | null;
  ref_gangguan: RefGangguan | null;
  [key: string]: unknown;
}

interface AnalisisModalProps {
  record: PadamApktRecord;
  onClose: () => void;
  onSaved: (id: string, patch: {
    status_gangguan: string | null;
    analisis_keterangan: string | null;
    ref_gangguan: RefGangguan | null;
  }) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BULAN_ID: Record<string, number> = {
  Januari: 0, Februari: 1, Maret: 2, April: 3, Mei: 4, Juni: 5,
  Juli: 6, Agustus: 7, September: 8, Oktober: 9, November: 10, Desember: 11,
};

function parseSheetDate(str: string): Date | null {
  const m1 = str.match(/(\d+)\s+(\w+)\s+(\d{4})/);
  if (m1) {
    const mon = BULAN_ID[m1[2]];
    if (mon !== undefined) return new Date(+m1[3], mon, +m1[1]);
  }
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);
  return null;
}

function normalizeUlp(v: string) {
  return v.replace(/^ULP\s+/i, "").trim().toUpperCase();
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function fmtNum(n: number | null, dec = 2) {
  if (n == null) return "—";
  return n.toLocaleString("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function refKey(r: RefGangguan) {
  return `${r.titik_gangguan}||${r.tgl_gangguan}||${r.jam_padam}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-[#00695C] uppercase tracking-widest mb-2 mt-4 first:mt-0">
      {children}
    </p>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-[#F4F6F8] last:border-0">
      <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide">{label}</p>
      <p className="text-sm text-[#1B2631] mt-0.5">{value || "—"}</p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnalisisModal({ record, onClose, onSaved }: AnalisisModalProps) {
  const [status,     setStatus]     = useState<string>(record.status_gangguan ?? "");
  const [keterangan, setKeterangan] = useState<string>(record.analisis_keterangan ?? "");
  const [refRow,     setRefRow]     = useState<RefGangguan | null>(record.ref_gangguan ?? null);
  const [sheetRows,  setSheetRows]  = useState<RefGangguan[]>([]);
  const [loadSheet,  setLoadSheet]  = useState(false);
  const [sheetErr,   setSheetErr]   = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState<string | null>(null);
  const [jurnal,     setJurnal]     = useState<JurnalApkt | null>(null);
  const [loadJurnal, setLoadJurnal] = useState(true);
  const [jurnalErr,  setJurnalErr]  = useState<string | null>(null);

  // Ambil Jurnal APKT dari sheet LOMBOK, cocokkan no_laporan ↔ "NO. GANGGUAN TM"
  useEffect(() => {
    const target = normNoLaporan(record.no_laporan);
    if (!target) { setLoadJurnal(false); return; }

    setLoadJurnal(true);
    setJurnalErr(null);

    fetchJurnalMap()
      .then((map) => setJurnal(map.get(target) ?? null))
      .catch((e) => setJurnalErr(String(e)))
      .finally(() => setLoadJurnal(false));
  }, [record.no_laporan]);

  useEffect(() => {
    if (status !== "murni") return;
    if (sheetRows.length > 0) return;

    const [year, month] = (record.tgl_padam ?? "").split("-").map(Number);
    if (!year || !month) return;

    setLoadSheet(true);
    setSheetErr(null);

    fetchSheetData("gangguanPenyulang", "A:S")
      .then((raw) => {
        const filtered: RefGangguan[] = [];
        for (const row of raw) {
          if (!row.TANGGAL) continue;
          const d = parseSheetDate(row.TANGGAL);
          if (!d) continue;
          if (d.getMonth() + 1 !== month || d.getFullYear() !== year) continue;
          const rowUlp = normalizeUlp(row.ULP ?? "");
          const recUlp = normalizeUlp(record.ulp ?? "");
          if (rowUlp !== recUlp) continue;
          filtered.push({
            titik_gangguan: row["PENYULANG GANGGUAN"] ?? row.PENYULANG_GANGGUAN ?? "—",
            tgl_gangguan:   row.TANGGAL,
            jam_padam:      row["JAM PADAM"] ?? row.JAM_PADAM ?? "",
            durasi:         row.DURASI ?? "",
            penyebab:       row["PENYEBAB GANGGUAN"] ?? row.PENYEBAB_GANGGUAN ?? "",
          });
        }
        setSheetRows(filtered);
      })
      .catch((e) => setSheetErr(String(e)))
      .finally(() => setLoadSheet(false));
  }, [status, record.tgl_padam, record.ulp, sheetRows.length]);

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch("/api/padam-apkt", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id:                  record.id,
          status_gangguan:     status || null,
          analisis_keterangan: keterangan.trim() || null,
          ref_gangguan:        status === "murni" ? refRow : null,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Gagal menyimpan");
      onSaved(record.id, {
        status_gangguan:     status || null,
        analisis_keterangan: keterangan.trim() || null,
        ref_gangguan:        status === "murni" ? refRow : null,
      });
      onClose();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error tidak diketahui");
    } finally {
      setSaving(false);
    }
  }

  const kode = record.no_laporan[0]?.toUpperCase();
  const selectedRefKey = refRow ? refKey(refRow) : "";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      <div className="fixed inset-[5%] z-50 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#1B2631]">

        {/* Header */}
        <div className="px-6 py-4 bg-linear-to-r from-[#004D40] to-[#00897B] text-white shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
              kode === "J"
                ? "bg-red-500/20 border-red-300/30 text-white"
                : "bg-blue-500/20 border-blue-300/30 text-white"
            }`}>
              {kode}
            </span>
            <span className="font-mono font-semibold text-sm">{record.no_laporan}</span>
            <span className="text-white/40">·</span>
            <span className="text-white/75 text-sm">{record.ulp}</span>
            <span className="text-white/40">·</span>
            <span className="font-medium text-sm">{record.penyulang}</span>
            <span className="text-white/40">·</span>
            <span className="text-white/75 text-sm">{fmtDate(record.tgl_padam)}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex min-h-0">

          {/* Left: Detail */}
          <div className="w-[55%] overflow-y-auto border-r border-[#E2E8F0] p-5">

            <SectionLabel>Waktu Padam</SectionLabel>
            <div className="grid grid-cols-2 gap-x-4">
              <FieldRow label="Tgl Padam"  value={fmtDate(record.tgl_padam)} />
              <FieldRow label="Jam Padam"  value={record.jam_padam?.slice(0, 5)} />
              <FieldRow label="Tgl Nyala"  value={fmtDate(record.tgl_nyala)} />
              <FieldRow label="Jam Nyala"  value={record.jam_nyala?.slice(0, 5)} />
              <FieldRow
                label="Lama Padam"
                value={record.lama_padam_jam != null
                  ? `${Math.round(record.lama_padam_jam * 60)} menit`
                  : null}
              />
            </div>

            <SectionLabel>Dampak</SectionLabel>
            <div className="grid grid-cols-2 gap-x-4">
              <FieldRow label="Pelanggan Padam"  value={record.jml_pelanggan_padam?.toLocaleString("id-ID")} />
              <FieldRow label="Jam × Plgn"       value={fmtNum(record.jam_x_pelanggan_padam, 2)} />
              <FieldRow label="ENS (kWh)"         value={fmtNum(record.ens, 4)} />
            </div>

            <SectionLabel>Peralatan & Sebab</SectionLabel>
            <div className="grid grid-cols-2 gap-x-4">
              <FieldRow label="Fasilitas"    value={record.fasilitas} />
              <FieldRow label="Sub Fasilitas" value={record.sub_fasilitas} />
              <FieldRow label="Equipment"    value={record.equipment} />
              <FieldRow label="Event Damage" value={record.event_damage} />
              <FieldRow label="Cause"        value={record.cause} />
              <FieldRow label="Group Cause"  value={record.group_cause} />
              <FieldRow label="Weather"      value={record.weather} />
              <FieldRow label="Ampere"       value={record.ampere} />
            </div>

            {(record.penyebab_padam || record.lokasi_gangguan || record.keterangan) && (
              <>
                <SectionLabel>Keterangan</SectionLabel>
                <div className="space-y-2">
                  {record.penyebab_padam && (
                    <div>
                      <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide">Penyebab Padam</p>
                      <p className="text-sm text-[#1B2631] mt-0.5">{record.penyebab_padam}</p>
                    </div>
                  )}
                  {record.lokasi_gangguan && (
                    <div>
                      <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide">Lokasi Gangguan</p>
                      <p className="text-sm text-[#1B2631] mt-0.5">{record.lokasi_gangguan}</p>
                    </div>
                  )}
                  {record.keterangan && (
                    <div>
                      <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide">Keterangan (APKT)</p>
                      <p className="text-sm text-[#1B2631] mt-0.5">{record.keterangan}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: Analisis */}
          <div className="w-[45%] overflow-y-auto p-5 bg-[#FAFBFC]">
            <p className="text-[10px] font-semibold text-[#00695C] uppercase tracking-widest mb-4">
              Analisis
            </p>

            <div className="space-y-4">

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-[#5D6D7E] mb-1.5">
                  Status Gangguan
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    if (e.target.value !== "murni") setRefRow(null);
                  }}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                >
                  <option value="">— Belum ditentukan —</option>
                  <option value="murni">Gangguan Murni</option>
                  <option value="tidak_murni">Gangguan Tidak Murni</option>
                </select>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-xs font-medium text-[#5D6D7E] mb-1.5">
                  Keterangan Analisis
                </label>
                <textarea
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Catatan analisis…"
                  rows={4}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 resize-none"
                />
              </div>

              {/* Referensi — hanya saat murni */}
              {status === "murni" && (
                <div>
                  <label className="block text-xs font-medium text-[#5D6D7E] mb-1.5">
                    Referensi Gangguan
                    <span className="ml-1 font-normal text-[#94a3b8]">
                      · {record.ulp} · {fmtDate(record.tgl_padam).slice(3)}
                    </span>
                  </label>

                  {loadSheet ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-[#5D6D7E]">
                      <div className="w-3.5 h-3.5 border-2 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
                      Memuat dari Google Sheets…
                    </div>
                  ) : sheetErr ? (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg p-2.5">
                      <AlertCircle size={13} className="shrink-0" />
                      <span>{sheetErr}</span>
                    </div>
                  ) : (
                    <select
                      value={selectedRefKey}
                      onChange={(e) => {
                        if (!e.target.value) { setRefRow(null); return; }
                        setRefRow(sheetRows.find((r) => refKey(r) === e.target.value) ?? null);
                      }}
                      className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                    >
                      <option value="">— Tidak ada referensi —</option>
                      {sheetRows.map((row) => (
                        <option key={refKey(row)} value={refKey(row)}>
                          {row.titik_gangguan}
                          {row.jam_padam ? ` · ${row.jam_padam}` : ""}
                          {row.durasi ? ` · ${row.durasi}j` : ""}
                        </option>
                      ))}
                    </select>
                  )}

                  {!loadSheet && !sheetErr && sheetRows.length === 0 && (
                    <p className="mt-1.5 text-xs text-[#94a3b8]">
                      Tidak ada data di Sheet untuk {record.ulp} bulan ini.
                    </p>
                  )}
                </div>
              )}

              {saveErr && (
                <div className="flex items-center gap-1.5 text-red-600 bg-red-50 rounded-lg p-2.5 text-xs">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{saveErr}</span>
                </div>
              )}
            </div>

            {/* Jurnal APKT — dari sheet LOMBOK */}
            <div className="mt-6 pt-4 border-t border-[#E2E8F0]">
              <p className="text-[10px] font-semibold text-[#00695C] uppercase tracking-widest mb-3">
                Jurnal APKT
              </p>

              {loadJurnal ? (
                <div className="flex items-center gap-2 py-2 text-xs text-[#5D6D7E]">
                  <div className="w-3.5 h-3.5 border-2 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
                  Memuat jurnal…
                </div>
              ) : jurnalErr ? (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg p-2.5">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{jurnalErr}</span>
                </div>
              ) : jurnal ? (
                <div className="grid grid-cols-2 gap-x-4">
                  <FieldRow label="Section"                    value={jurnal.section} />
                  <FieldRow label="ULP"                        value={jurnal.ulp} />
                  <FieldRow label="Durasi Padam"               value={jurnal.durasi_padam} />
                  <FieldRow label="Anomali Kode J"             value={jurnal.anomali_kode_j} />
                  <FieldRow label="Action"                     value={jurnal.action} />
                  <FieldRow label="Status Koreksi / Cleansing" value={jurnal.status_koreksi} />
                  <div className="col-span-2">
                    <FieldRow label="Justifikasi" value={jurnal.justifikasi} />
                  </div>
                  <div className="col-span-2">
                    <FieldRow label="Kategori Cleansing Dikecualikan" value={jurnal.kategori_cleansing} />
                  </div>
                  <div className="col-span-2">
                    <FieldRow label="Keterangan Cleansing Dikecualikan" value={jurnal.keterangan_cleansing} />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#94a3b8]">
                  No laporan ini tidak ditemukan di Jurnal APKT (sheet LOMBOK).
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-[#E2E8F0] shrink-0 bg-white">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#5D6D7E] hover:bg-gray-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-linear-to-r from-[#004D40] to-[#00897B] text-white text-sm font-medium disabled:opacity-50 transition-opacity"
          >
            {saving ? "Menyimpan…" : "Simpan Analisis"}
          </button>
        </div>
      </div>
    </>
  );
}
