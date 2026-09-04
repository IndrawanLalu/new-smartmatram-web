"use client";

import { useState, useMemo } from "react";
import {
  ClipboardList, Download, Loader2, Search, Trash2, FilePlus2, RefreshCw, CheckCircle2,
  ListPlus, ChevronDown,
} from "lucide-react";
import { canManageSettings, type CurrentUser } from "@/lib/roles";
import StatTile from "@/app/admin/_components/StatTile";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { useWoPengukuran, useMasterUntukWo, type BarisWo, type RencanaTerbit } from "../_hooks/useWoPengukuran";
import { useWoPengukuranSettings } from "../_hooks/useWoPengukuranSettings";
import {
  ringkasKandidat, susunKandidatPerUlp, tanggalWo, type KandidatWo,
} from "../_lib/kandidatWo";
import { downloadWoPengukuranXlsx } from "../_utils/woPengukuranXlsx";
import TabelWoPengukuran, { type BarisTampil } from "./TabelWoPengukuran";
import WoSettingsPanel from "./WoSettingsPanel";

// ── Konstanta ─────────────────────────────────────────────────────────────────

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const SARINGAN = [
  { nilai: "", label: "Semua status" },
  { nilai: "belum", label: "Belum diukur" },
  { nilai: "selesai", label: "Sudah diukur" },
] as const;

type Saringan = (typeof SARINGAN)[number]["nilai"];

const INPUT =
  "h-9 border border-line rounded-lg px-3 text-sm text-ink bg-white focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15";

/** YYYY-MM-DD → DD-MM-YYYY. */
function fmtTanggal(v: string): string {
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

/** Kuota diabaikan saat menghitung tunggakan — angka itu menjawab "berapa yang
 *  sebenarnya menunggu", bukan "berapa yang muat bulan ini". */
const TANPA_KUOTA = 1_000_000;

// ── Pemetaan ke bentuk tabel ──────────────────────────────────────────────────

const dariWo = (r: BarisWo): BarisTampil => ({
  kode_gardu: r.kode_gardu,
  ulp: r.ulp,
  nama: r.nama,
  alamat: r.alamat,
  penyulang: r.penyulang,
  kva_master: r.kva_master,
  alasan: r.alasan,
  tgl_ukur_terakhir: r.tgl_ukur_terakhir,
  umur_bulan: r.umur_bulan,
  tgl_wo: r.tgl_wo,
  tgl_realisasi: r.tgl_realisasi,
  petugas_nama: r.petugas_nama,
});

/** Kandidat belum punya tanggal WO maupun realisasi — itu yang membedakannya
 *  dari baris yang sudah terbit, dan yang dibaca tabel sebagai "pratinjau". */
const dariKandidat = (k: KandidatWo): BarisTampil => ({
  kode_gardu: k.kode_gardu,
  ulp: k.ulp,
  nama: k.nama,
  alamat: k.alamat,
  penyulang: k.penyulang,
  kva_master: k.kva_master,
  alasan: k.alasan,
  tgl_ukur_terakhir: k.tgl_ukur_terakhir,
  umur_bulan: k.umur_bulan,
  tgl_wo: null,
  tgl_realisasi: null,
  petugas_nama: null,
});

interface Konfirmasi {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  tone: "primary" | "danger";
  onConfirm: () => void;
}

// ── Komponen ──────────────────────────────────────────────────────────────────

interface WoPengukuranTabProps {
  user: CurrentUser;
  /** "" = semua ULP (hanya mungkin untuk UP3). */
  ulp: string;
}

export default function WoPengukuranTab({ user, ulp }: WoPengukuranTabProps) {
  const sekarang = new Date();
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Saringan>("");
  const [bukaLuarWo, setBukaLuarWo] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState<Konfirmasi | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const {
    settings, settingsUntuk, ulpKey, loading: loadingSettings, saving, savedAt, simpan, reset,
  } = useWoPengukuranSettings(ulp);

  const {
    headers, rows, luarWo, loading, error, ulpSudahTerbit, terbitkan, hapus, refresh,
  } = useWoPengukuran(user, ulp, tahun, bulan);

  const { master, loading: loadingMaster, error: errorMaster } = useMasterUntukWo(user, ulp);

  const tglWo = tanggalWo(tahun, bulan);

  // ── Kandidat ────────────────────────────────────────────────────────────────

  /** Sudah dipotong kuota — inilah yang akan diterbitkan. */
  const kandidatPerUlp = useMemo(
    () => susunKandidatPerUlp(master, settingsUntuk, tglWo),
    [master, settingsUntuk, tglWo],
  );

  /** Seluruh gardu yang memenuhi kriteria, tanpa potong kuota. */
  const tunggakan = useMemo(() => {
    const penuh = susunKandidatPerUlp(
      master,
      (u) => ({ ...settingsUntuk(u), kuota_per_bulan: TANPA_KUOTA }),
      tglWo,
    );
    let n = 0;
    for (const [, daftar] of penuh) n += daftar.length;
    return n;
  }, [master, settingsUntuk, tglWo]);

  /** WO yang belum terbit untuk periode ini. ULP yang sudah punya tidak ikut. */
  const rencana = useMemo<RencanaTerbit[]>(() => {
    const hasil: RencanaTerbit[] = [];
    for (const [u, kandidat] of kandidatPerUlp) {
      if (ulpSudahTerbit.has(u)) continue;
      hasil.push({ ulp: u, kandidat, settings: settingsUntuk(u) });
    }
    return hasil;
  }, [kandidatPerUlp, ulpSudahTerbit, settingsUntuk]);

  const akanDiterbitkan = useMemo(
    () => rencana.reduce((s, r) => s + r.kandidat.length, 0),
    [rencana],
  );

  // ── Baris tabel ─────────────────────────────────────────────────────────────

  const semuaBaris = useMemo<BarisTampil[]>(
    () => [...rows.map(dariWo), ...rencana.flatMap((r) => r.kandidat.map(dariKandidat))],
    [rows, rencana],
  );

  const barisTampil = useMemo(() => {
    let data = semuaBaris;
    if (saring === "belum") data = data.filter((d) => !d.tgl_realisasi);
    else if (saring === "selesai") data = data.filter((d) => d.tgl_realisasi);

    if (cari.trim()) {
      const q = cari.trim().toLowerCase();
      data = data.filter(
        (d) =>
          d.kode_gardu.toLowerCase().includes(q) ||
          d.nama?.toLowerCase().includes(q) ||
          d.alamat?.toLowerCase().includes(q) ||
          d.penyulang?.toLowerCase().includes(q),
      );
    }
    return data;
  }, [semuaBaris, saring, cari]);

  const terealisasi = useMemo(() => rows.filter((r) => r.terealisasi).length, [rows]);
  const persenRealisasi = rows.length > 0 ? Math.round((terealisasi / rows.length) * 100) : 0;

  // ── Aksi ────────────────────────────────────────────────────────────────────

  const namaPeriode = `${BULAN[bulan - 1]} ${tahun}`;

  const mintaTerbitkan = () => {
    setKonfirmasi({
      title: `Terbitkan WO ${namaPeriode}?`,
      tone: "primary",
      confirmLabel: `WO-kan ${akanDiterbitkan} gardu`,
      message: (
        <>
          <b>{akanDiterbitkan} gardu</b> akan diterbitkan sebagai Work Order bertanggal{" "}
          <b>1 {namaPeriode}</b>.
          <ul className="mt-2 space-y-1">
            {rencana.map((r) => {
              const ringkas = ringkasKandidat(r.kandidat);
              return (
                <li key={r.ulp}>
                  <b>{r.ulp}</b> — {ringkas.total} gardu ({ringkas.belumPernah} belum pernah diukur,{" "}
                  {ringkas.kedaluwarsa} kedaluwarsa)
                </li>
              );
            })}
          </ul>
          <p className="mt-2">
            Setelah terbit, daftarnya tidak bisa diubah — untuk menyusun ulang, WO-nya harus
            dihapus lebih dulu.
          </p>
        </>
      ),
      onConfirm: async () => {
        setSibuk(true);
        setPesan(null);
        const hasil = await terbitkan(rencana);
        setSibuk(false);
        if (hasil.error) {
          setPesan({ ok: false, teks: `Gagal menerbitkan WO: ${hasil.error}` });
          return;
        }
        const total = hasil.diterbitkan.reduce((s, d) => s + d.jumlah, 0);
        const rincian = hasil.diterbitkan.map((d) => `${d.ulp} ${d.jumlah}`).join(", ");
        setPesan({
          ok: true,
          teks:
            `WO ${namaPeriode} terbit — ${total} gardu (${rincian}).` +
            (hasil.ditolak.length ? ` Dilewati karena sudah punya WO: ${hasil.ditolak.join(", ")}.` : ""),
        });
      },
    });
  };

  const mintaHapus = (woId: string, ulpWo: string, jumlah: number) => {
    setKonfirmasi({
      title: `Hapus WO ${ulpWo} ${namaPeriode}?`,
      tone: "danger",
      confirmLabel: "Hapus WO",
      message: (
        <>
          WO <b>{ulpWo} {namaPeriode}</b> beserta {jumlah} barisnya akan dihapus permanen.
          <p className="mt-2">
            Hasil pengukuran tidak ikut terhapus — angkanya tersimpan di data pengukuran, bukan
            di WO ini. Yang hilang hanya penugasannya.
          </p>
        </>
      ),
      onConfirm: async () => {
        setSibuk(true);
        setPesan(null);
        const gagal = await hapus(woId);
        setSibuk(false);
        setPesan(
          gagal
            ? { ok: false, teks: `Gagal menghapus WO: ${gagal}` }
            : { ok: true, teks: `WO ${ulpWo} ${namaPeriode} dihapus.` },
        );
      },
    });
  };

  const unduh = () => {
    const namaUlp = ulp || (headers.length === 1 ? headers[0].ulp : "Semua ULP");
    downloadWoPengukuranXlsx(
      barisTampil,
      {
        periode: namaPeriode,
        ulp: namaUlp,
        tglWo: headers.length > 0 ? tglWo : null,
        total: barisTampil.length,
        terealisasi: barisTampil.filter((b) => b.tgl_realisasi).length,
      },
      `wo-pengukuran-${namaUlp.toLowerCase().replace(/\s+/g, "-")}-${tahun}-${String(bulan).padStart(2, "0")}.xlsx`,
    );
  };

  // Pengaturan ikut dihitung: sebelum ia tiba, kandidat tersusun dari nilai
  // bawaan kode. Membiarkan tombol WO-kan hidup di jeda itu berarti WO bisa
  // terbit memakai kriteria yang bukan milik ULP-nya.
  const memuat = loading || loadingMaster || loadingSettings;
  const galat = error ?? errorMaster;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Periode & aksi ── */}
      <div className="bg-white rounded-2xl border border-line shadow-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-navy-600 shrink-0" />
          <span className="text-sm font-semibold text-ink">Periode</span>
        </div>

        <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={INPUT}>
          {BULAN.map((b, i) => (
            <option key={b} value={i + 1}>{b}</option>
          ))}
        </select>

        <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={INPUT}>
          {[sekarang.getFullYear() - 1, sekarang.getFullYear(), sekarang.getFullYear() + 1].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <span className="text-xs text-ink-muted">
          Tanggal WO: <b className="text-ink-soft">1 {namaPeriode}</b>
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={memuat}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line text-sm text-ink-soft hover:text-ink hover:bg-surface transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={memuat ? "animate-spin" : ""} />
            Muat Ulang
          </button>
          <button
            onClick={unduh}
            disabled={barisTampil.length === 0}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line text-sm text-ink-soft hover:text-ink hover:bg-surface transition-colors disabled:opacity-40"
          >
            <Download size={14} />
            Unduh Excel
          </button>
          {akanDiterbitkan > 0 && (
            <button
              onClick={mintaTerbitkan}
              disabled={sibuk || memuat}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-navy-600 text-white text-sm font-semibold hover:bg-navy-500 transition-colors disabled:opacity-50"
            >
              {sibuk ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
              WO-kan {akanDiterbitkan} gardu di {BULAN[bulan - 1]}
            </button>
          )}
        </div>
      </div>

      {/* ── Pengaturan ── */}
      {canManageSettings(user.role) && (
        <WoSettingsPanel
          settings={settings}
          ulpKey={ulpKey}
          saving={saving}
          savedAt={savedAt}
          onSave={simpan}
          onReset={reset}
        />
      )}

      {/* ── Pesan hasil aksi ── */}
      {pesan && (
        <div
          className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
            pesan.ok
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {pesan.ok && <CheckCircle2 size={16} className="shrink-0 mt-0.5" />}
          <span className="min-w-0">{pesan.teks}</span>
          <button onClick={() => setPesan(null)} className="ml-auto shrink-0 text-xs underline opacity-70">
            tutup
          </button>
        </div>
      )}

      {galat && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
          Gagal memuat data: {galat}
        </div>
      )}

      {/* ── Ringkasan ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          label="Tunggakan"
          value={memuat ? "—" : tunggakan}
          tone="attention"
          hint="gardu memenuhi kriteria"
        />
        <StatTile
          label="Akan di-WO"
          value={memuat ? "—" : akanDiterbitkan}
          tone="navy"
          hint={akanDiterbitkan > 0 ? "belum diterbitkan" : "sudah terbit semua"}
        />
        <StatTile
          label="Sudah di-WO"
          value={memuat ? "—" : rows.length}
          tone="accent"
          hint={headers.length > 0 ? `${headers.length} WO terbit` : "belum ada WO"}
        />
        <StatTile
          label="Realisasi"
          value={memuat ? "—" : `${terealisasi}/${rows.length}`}
          tone="green"
          hint={`${persenRealisasi}% terukur`}
        />
        <StatTile
          label="Di Luar WO"
          value={memuat ? "—" : luarWo.length}
          tone="navy"
          hint="gardu diukur tanpa masuk WO"
        />
      </div>

      {/* ── Rincian di luar WO ── */}
      {/* Mengukur di luar WO diperbolehkan — daftar ini ada supaya kerjanya
          tetap terlihat, bukan sebagai teguran. */}
      {!memuat && luarWo.length > 0 && (
        <div className="bg-white rounded-2xl border border-line shadow-card overflow-hidden">
          <button
            type="button"
            onClick={() => setBukaLuarWo((v) => !v)}
            className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-surface transition-colors"
          >
            <ListPlus size={15} className="text-navy-600 shrink-0" />
            <span className="text-sm font-semibold text-ink">
              {luarWo.length} gardu diukur di luar WO {namaPeriode}
            </span>
            <ChevronDown
              size={16}
              className={`ml-auto text-ink-muted transition-transform ${bukaLuarWo ? "rotate-180" : ""}`}
            />
          </button>

          {bukaLuarWo && (
            <div className="border-t border-line max-h-64 overflow-y-auto">
              <table className="w-full">
                <tbody className="divide-y divide-line">
                  {luarWo.map((g) => (
                    <tr key={`${g.ulp}|${g.kode_gardu}`} className="text-sm">
                      <td className="px-4 py-2 font-semibold text-ink whitespace-nowrap">{g.kode_gardu}</td>
                      {!ulp && <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{g.ulp}</td>}
                      <td className="px-3 py-2 text-ink-soft whitespace-nowrap tabular-nums">
                        {fmtTanggal(g.tanggal)}
                      </td>
                      <td className="px-4 py-2 text-ink-soft truncate">{g.petugas_nama ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── WO yang sudah terbit ── */}
      {headers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">WO terbit:</span>
          {headers.map((h) => {
            const jumlah = rows.filter((r) => r.wo_id === h.id).length;
            return (
              <span
                key={h.id}
                className="inline-flex items-center gap-2 h-8 pl-3 pr-1.5 rounded-full border border-line bg-white text-xs text-ink-soft"
              >
                <b className="text-ink">{h.ulp}</b>
                <span>{jumlah} gardu</span>
                <button
                  onClick={() => mintaHapus(h.id, h.ulp, jumlah)}
                  disabled={sibuk}
                  className="h-6 w-6 grid place-items-center rounded-full text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                  aria-label={`Hapus WO ${h.ulp}`}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Saringan ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari kode, nama, alamat, penyulang…"
            className={`${INPUT} pl-9 w-72`}
          />
        </div>
        <select value={saring} onChange={(e) => setSaring(e.target.value as Saringan)} className={INPUT}>
          {SARINGAN.map((s) => (
            <option key={s.nilai} value={s.nilai}>{s.label}</option>
          ))}
        </select>
        <span className="text-xs text-ink-muted">
          {barisTampil.length} dari {semuaBaris.length} baris
        </span>
      </div>

      {/* ── Tabel ── */}
      {memuat ? (
        <div className="bg-white rounded-2xl border border-line shadow-card p-10 text-center">
          <Loader2 size={22} className="mx-auto animate-spin text-navy-600 mb-2" />
          <p className="text-sm text-ink-soft">Memuat data WO…</p>
        </div>
      ) : (
        <TabelWoPengukuran rows={barisTampil} tampilkanUlp={!ulp} />
      )}

      {konfirmasi && (
        <ConfirmDialog
          title={konfirmasi.title}
          message={konfirmasi.message}
          tone={konfirmasi.tone}
          confirmLabel={konfirmasi.confirmLabel}
          onConfirm={konfirmasi.onConfirm}
          onClose={() => setKonfirmasi(null)}
        />
      )}
    </div>
  );
}
