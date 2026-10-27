"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, TriangleAlert } from "lucide-react";
import { BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, UNITS, type CurrentUser } from "@/lib/roles";

/**
 * Susun WO bersatuan GARDU, diukur JUMLAH gardu (W2 rencana-wo-gardu-dan-
 * inspeksi-gardu.md). Kembaran SusunWoSegmen — yang itu terikat kilometer.
 * Dipakai Inspeksi Gardu; kelak Pemeliharaan Gardu & Pengukuran.
 *
 * Data gardu dimuat lewat `muatGardu(ulp)` saat ULP dipilih: tiap modul
 * menentukan sendiri arti "terakhir dikerjakan".
 */

export interface GarduPilihan {
  kode: string;
  nama: string | null;
  penyulang: string;
  ulp: string;
  /** ISO — pekerjaan terakhir di gardu ini; null = belum pernah. */
  terakhir: string | null;
}

export interface WoGarduTerbuka {
  wo_id: string;
  ulp: string;
  nama: string;
  tgl_wo: string;
  target: number | null;
  item: number;
}

interface Props {
  user: CurrentUser;
  judul: string;
  contohNama: string;
  /** "belum pernah diinspeksi" / "belum pernah dipelihara". */
  labelBelum: string;
  muatGardu: (ulp: string) => Promise<GarduPilihan[]>;
  /** `ULP|KODE` huruf besar yang masih terbuka di WO sejenis. */
  terikat: Set<string>;
  regu: { regu: string; ulp: string }[];
  woTerbuka: WoGarduTerbuka[];
  woAwal: { id: string; ulp: string } | null;
  onTerbitkan: (v: { ulp: string; nama: string; target: number; gardu: string[]; regu: Record<string, string>; tglWo: string }) => Promise<boolean>;
  onTambah: (v: { woId: string; gardu: string[]; regu: Record<string, string>; target: number | null }) => Promise<boolean>;
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const LANGKAH_TAMPIL = 100;
const dua = (n: number) => String(n).padStart(2, "0");
const bulanWoBawaan = () => {
  const d = new Date();
  if (d.getDate() >= 20) d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}`;
};
const umurBulan = (iso: string) => {
  const d = new Date(iso);
  const s = new Date();
  return (s.getFullYear() - d.getFullYear()) * 12 + s.getMonth() - d.getMonth();
};

export default function SusunWoGardu(p: Props) {
  const bolehSemua = canSeeAllUnits(p.user.role);
  const [ulp, setUlp] = useState(p.woAwal?.ulp ?? (bolehSemua ? "" : (p.user.unit ?? "").toUpperCase()));
  const [mode, setMode] = useState<"baru" | "tambah">(p.woAwal ? "tambah" : "baru");
  const [woTujuan, setWoTujuan] = useState(p.woAwal?.id ?? "");
  const [nama, setNama] = useState("");
  const [target, setTarget] = useState("");
  const [bulanWo, setBulanWo] = useState(bulanWoBawaan);
  const [gardu, setGardu] = useState<GarduPilihan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [bagi, setBagi] = useState<Record<string, string>>({});
  const [penyulang, setPenyulang] = useState("");
  const [cari, setCari] = useState("");
  const [batas, setBatas] = useState(LANGKAH_TAMPIL);
  const [sibuk, setSibuk] = useState(false);
  const { muatGardu } = p;

  useEffect(() => {
    if (!ulp) return;
    let hidup = true;
    muatGardu(ulp).then(
      (g) => { if (hidup) { setGardu(g); setGalat(null); } },
      (e: Error) => { if (hidup) { setGardu([]); setGalat(e.message); } },
    );
    return () => { hidup = false; };
  }, [ulp, muatGardu]);

  const kunci = (g: GarduPilihan) => `${g.ulp.toUpperCase()}|${g.kode.toUpperCase()}`;
  const bebas = useMemo(() => (gardu ?? []).filter((g) => !p.terikat.has(kunci(g))), [gardu, p.terikat]);
  const daftarPenyulang = useMemo(() => [...new Set(bebas.map((g) => g.penyulang))].sort(), [bebas]);
  const tersedia = useMemo(() => {
    const k = cari.trim().toUpperCase();
    return bebas
      .filter((g) => !penyulang || g.penyulang === penyulang)
      .filter((g) => !k || `${g.kode} ${g.nama ?? ""} ${g.penyulang}`.toUpperCase().includes(k))
      // Belum pernah di atas, lalu yang paling lama.
      .sort((a, b) => (a.terakhir ?? "").localeCompare(b.terakhir ?? "") || a.kode.localeCompare(b.kode));
  }, [bebas, penyulang, cari]);
  // Dari seluruh gardu bebas, bukan yang tersaring: mencari yang lain tidak
  // boleh diam-diam mengeluarkan yang sudah dicentang.
  const dipilih = useMemo(() => bebas.filter((g) => pilih.has(g.kode)), [bebas, pilih]);
  const semuaTersaring = tersedia.length > 0 && tersedia.every((g) => pilih.has(g.kode));
  const reguUlp = p.regu.filter((g) => g.ulp === ulp);
  const woUlp = p.woTerbuka.filter((w) => w.ulp === ulp);
  const woDipilih = woUlp.find((w) => w.wo_id === woTujuan) ?? null;
  const targetNum = Math.round(Number(target) || 0);
  const siap = !!ulp && dipilih.length > 0 && (mode === "baru" ? nama.trim().length > 2 && targetNum > 0 : !!woTujuan);

  const kirim = async () => {
    setSibuk(true);
    const kode = dipilih.map((g) => g.kode);
    const regu = Object.fromEntries(kode.filter((k) => bagi[k]).map((k) => [k, bagi[k]]));
    const ok = mode === "baru"
      ? await p.onTerbitkan({ ulp, nama: nama.trim(), target: targetNum, gardu: kode, regu, tglWo: `${bulanWo}-01` })
      : await p.onTambah({ woId: woTujuan, gardu: kode, regu, target: targetNum > 0 ? targetNum : null });
    setSibuk(false);
    if (ok) {
      setPilih(new Set());
      setBagi({});
      setNama("");
      setTarget("");
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>{p.judul}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([["baru", "Buat WO baru"], ["tambah", "Tambah ke WO yang sudah ada"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)} disabled={k === "tambah" && woUlp.length === 0}
              className={`${CHIP} ${mode === k ? CHIP_ON : CHIP_OFF} disabled:opacity-40`}
              title={k === "tambah" && woUlp.length === 0 ? "Belum ada WO berjalan di ULP ini" : undefined}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label>
            <span className={EYEBROW}>ULP</span>
            <select value={ulp} disabled={!bolehSemua || !!p.woAwal}
              onChange={(e) => { setUlp(e.target.value); setGardu(null); setPilih(new Set()); setPenyulang(""); }}
              className={`${FIELD} mt-1 block w-[170px] disabled:opacity-60`}>
              <option value="">— pilih ULP —</option>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </label>
          {mode === "baru" ? (
            <>
              <label>
                <span className={EYEBROW}>Nama WO</span>
                <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder={p.contohNama} className={`${FIELD} mt-1 block w-[260px]`} />
              </label>
              <label>
                <span className={EYEBROW}>Target (gardu)</span>
                <input value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                  placeholder={dipilih.length ? String(dipilih.length) : "20"} className={`${FIELD} mt-1 block w-[110px] text-right font-mono`} />
              </label>
              <label>
                <span className={EYEBROW}>Bulan WO</span>
                <input type="month" value={bulanWo} onChange={(e) => e.target.value && setBulanWo(e.target.value)} className={`${FIELD} mt-1 block w-[170px]`} />
              </label>
            </>
          ) : (
            <>
              <label>
                <span className={EYEBROW}>WO tujuan</span>
                <select value={woTujuan} onChange={(e) => setWoTujuan(e.target.value)} className={`${FIELD} mt-1 block w-[300px]`}>
                  <option value="">— pilih WO —</option>
                  {woUlp.map((w) => (
                    <option key={w.wo_id} value={w.wo_id}>
                      {w.nama} · {NAMA_BULAN[Number(w.tgl_wo.slice(5, 7)) - 1]} {w.tgl_wo.slice(0, 4)} · {w.item} gardu
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={EYEBROW}>Ubah target</span>
                <input value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                  placeholder={woDipilih?.target != null ? String(woDipilih.target) : "opsional"} className={`${FIELD} mt-1 block w-[120px] text-right font-mono`} />
              </label>
            </>
          )}
        </div>
        {mode === "tambah" && woDipilih && (
          <p className="text-xs text-ink-soft mt-3">
            <b className="text-ink">{woDipilih.nama}</b> berisi {woDipilih.item} gardu, target {woDipilih.target ?? "—"}
            {dipilih.length > 0 && <> → jadi <b className="text-ink">{woDipilih.item + dipilih.length}</b> gardu</>}
          </p>
        )}
      </div>

      <div className={`${CARD} p-4 sticky top-2 z-10 flex flex-wrap items-center gap-x-5 gap-y-2`}>
        <span className="text-sm">
          <b className="text-ink tabular-nums text-lg">{dipilih.length}</b> <span className="text-ink-soft">gardu dipilih</span>
          {mode === "baru" && targetNum > 0 && <span className="ml-1.5 text-xs text-ink-muted">dari target {targetNum}</span>}
        </span>
        {reguUlp.length > 0 && dipilih.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            Semua ke:
            {reguUlp.map((g) => (
              <button key={g.regu} onClick={() => setBagi((b) => ({ ...b, ...Object.fromEntries(dipilih.map((x) => [x.kode, g.regu])) }))}
                className={`${CHIP} ${CHIP_OFF}`}>{g.regu}</button>
            ))}
            <button onClick={() => setBagi({})} className={`${CHIP} ${CHIP_OFF}`}>Kosongkan</button>
          </span>
        )}
        <button onClick={() => void kirim()} disabled={!siap || sibuk} className={`${BTN_PRIMARY} ml-auto`}>
          {sibuk ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {mode === "baru" ? "Terbitkan WO" : "Tambahkan ke WO"}
        </button>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <input value={cari} onChange={(e) => { setCari(e.target.value); setBatas(LANGKAH_TAMPIL); }}
            placeholder="Cari kode, nama gardu, penyulang" className={`${FIELD} w-[260px]`} />
          <select value={penyulang} onChange={(e) => { setPenyulang(e.target.value); setBatas(LANGKAH_TAMPIL); }}
            className={`${FIELD} w-[220px]`} aria-label="Penyulang">
            <option value="">Semua penyulang</option>
            {daftarPenyulang.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          {ulp && reguUlp.length === 0 && (
            <span className="text-[11px] text-ink-muted">Belum ada regu ber-menu Inspeksi Gardu di {ulp} — WO tetap bisa terbit, semua tim se-ULP melihatnya.</span>
          )}
        </div>

        {!ulp ? (
          <p className="text-xs text-ink-muted py-10 text-center">Pilih ULP dulu.</p>
        ) : gardu === null ? (
          <p className="text-xs text-ink-muted py-10 text-center"><Loader2 size={14} className="inline animate-spin" /> Memuat gardu…</p>
        ) : galat ? (
          <p className="text-xs text-red-700 py-10 text-center">Gardu gagal dimuat: {galat}</p>
        ) : tersedia.length === 0 ? (
          <p className="text-xs text-ink-muted py-10 text-center">Tidak ada gardu yang bisa dipilih. Yang masih terbuka di WO tier ini tidak muncul.</p>
        ) : (
          <div className="mt-3 space-y-1">
            <label className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface cursor-pointer">
              <input type="checkbox" checked={semuaTersaring} className="accent-navy-600"
                onChange={() => setPilih((prev) => {
                  const n = new Set(prev);
                  for (const g of tersedia) if (semuaTersaring) n.delete(g.kode); else n.add(g.kode);
                  return n;
                })} />
              <span className="text-xs font-semibold text-ink">Pilih semua {tersedia.length} gardu{penyulang ? ` di ${penyulang}` : ""}</span>
            </label>
            {tersedia.slice(0, batas).map((g) => {
              const aktif = pilih.has(g.kode);
              return (
                <label key={g.kode}
                  className={`flex flex-wrap items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${aktif ? "border-navy-300 bg-navy-50/50" : "border-line hover:bg-surface"}`}>
                  <input type="checkbox" checked={aktif} className="accent-navy-600"
                    onChange={() => setPilih((prev) => { const n = new Set(prev); if (n.has(g.kode)) n.delete(g.kode); else n.add(g.kode); return n; })} />
                  <span className="text-xs text-ink-soft w-[130px] truncate">{g.penyulang}</span>
                  <span className="text-sm text-ink flex-1 min-w-[180px]"><b>{g.kode}</b>{g.nama ? ` · ${g.nama}` : ""}</span>
                  <span className="w-[150px] text-right text-[11px]">
                    {g.terakhir === null ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><TriangleAlert size={11} /> {p.labelBelum}</span>
                    ) : (
                      <span className="text-ink-muted">{umurBulan(g.terakhir)} bln lalu</span>
                    )}
                  </span>
                  {aktif && reguUlp.length > 0 && (
                    <select value={bagi[g.kode] ?? ""} onClick={(e) => e.preventDefault()}
                      onChange={(e) => setBagi((b) => ({ ...b, [g.kode]: e.target.value }))} className={`${FIELD} w-[130px] h-8 text-xs`}>
                      <option value="">— semua tim —</option>
                      {reguUlp.map((r) => <option key={r.regu} value={r.regu}>{r.regu}</option>)}
                    </select>
                  )}
                </label>
              );
            })}
            {tersedia.length > batas && (
              <button onClick={() => setBatas((n) => n + LANGKAH_TAMPIL)}
                className="w-full py-2.5 rounded-xl border border-dashed border-navy-200 text-xs font-semibold text-navy-600 hover:bg-navy-50/50">
                Tampilkan {Math.min(LANGKAH_TAMPIL, tersedia.length - batas)} lagi · sisa {tersedia.length - batas} gardu
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
