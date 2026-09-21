"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCopy, Loader2, TriangleAlert, Upload } from "lucide-react";
import { parseClipboardTable } from "@/lib/parseClipboardTable";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import type { BarisImpor, HasilImpor } from "../_hooks/useMasterSegmen";

/**
 * Impor segmen per penyulang, ditempel dari Excel.
 *
 * PENYULANGNYA DIPILIH DARI MASTER, tidak diketik. Di situlah ikatan
 * gardu–penyulang–segmen ditegakkan: yang belum terdaftar tidak muncul di
 * daftar pilihan sama sekali.
 *
 * ── YANG DIBETULKAN 21 SEP ──────────────────────────────────────────────────
 * Bapak: "IMPORT segmentnya membingungkan, formatnya tidak begitu jelas."
 *
 * Yang membingungkan bukan kolomnya, melainkan apa yang TIDAK terlihat: nama
 * segmen disusun sistem dari kedua ujungnya, dan admin tidak punya cara
 * melihat hasilnya sebelum menekan Impor. Dua hal ditambahkan:
 *
 *   1. Contoh yang bisa disalin dengan satu ketukan lalu ditempel apa adanya.
 *   2. PRATINJAU dari database — nama segmen yang AKAN terbentuk, beserta
 *      baris yang akan dilewati dan sebabnya, sebelum satu baris pun ditulis.
 *      Dihitung `impor_segmen(..., p_uji := true)`, bukan ditiru di layar:
 *      tiruan akan melenceng, dan pratinjau yang melenceng lebih buruk
 *      daripada tidak ada pratinjau.
 */

const KOLOM = [
  { key: "awal", label: "Titik awal", tebak: /awal|dari|from/i },
  { key: "akhir", label: "Titik akhir", tebak: /akhir|sampai|ke$|to$/i },
  { key: "km", label: "Panjang (km)", tebak: /km|panjang|jarak/i },
] as const;

type KolomKey = (typeof KOLOM)[number]["key"];

const CONTOH = [
  "Titik awal\tTitik akhir\tPanjang (km)",
  "GI AMPENAN\tREC. BRIMOB\t2,03",
  "REC. BRIMOB\tLBS PASAR\t3,4",
  "LBS PASAR\tUJUNG\t7",
].join("\n");

/** Berkas lapangan hampir selalu memakai koma desimal. */
const angka = (s: string): number | null => {
  const v = parseFloat((s ?? "").trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

export default function ImporSegmen({
  user,
  penyulang,
  onPratinjau,
  onImpor,
}: {
  user: CurrentUser;
  penyulang: { penyulang: string; ulp: string | null }[];
  onPratinjau: (namaPenyulang: string, isi: BarisImpor[]) => Promise<HasilImpor | null>;
  onImpor: (namaPenyulang: string, isi: BarisImpor[]) => Promise<HasilImpor | null>;
}) {
  const [pilih, setPilih] = useState("");
  const [teks, setTeks] = useState("");
  const [peta, setPeta] = useState<Record<KolomKey, number>>({ awal: -1, akhir: -1, km: -1 });
  const [lihat, setLihat] = useState<HasilImpor | null>(null);
  const [menghitung, setMenghitung] = useState(false);
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState<HasilImpor | null>(null);

  const pilihan = useMemo(
    () =>
      canSeeAllUnits(user.role)
        ? penyulang
        : penyulang.filter((p) => (p.ulp ?? "") === (user.unit ?? "")),
    [penyulang, user],
  );

  const tabel = useMemo(() => (teks.trim() ? parseClipboardTable(teks) : null), [teks]);

  const tempel = (isi: string) => {
    setTeks(isi);
    setHasil(null);
    const t = parseClipboardTable(isi);
    if (t.headers.length === 0) return;
    const baru = { ...peta };
    for (const k of KOLOM) baru[k.key] = t.headers.findIndex((h) => k.tebak.test(h.trim()));

    // Tidak ada tajuk yang cocok? Pakai urutan kolom apa adanya. Orang yang
    // menempel tanpa baris judul justru yang paling sering — dan memaksanya
    // memasangkan tiga pilihan dengan tangan adalah pekerjaan yang tidak perlu.
    if (baru.awal < 0 && baru.akhir < 0) {
      baru.awal = 0;
      baru.akhir = 1;
      baru.km = t.headers.length > 2 ? 2 : -1;
    }
    setPeta(baru);
  };

  const barisSiap = useMemo<BarisImpor[]>(() => {
    if (!tabel || peta.awal < 0 || peta.akhir < 0) return [];
    return tabel.rows
      .map((r) => ({
        awal: (r[peta.awal] ?? "").trim(),
        akhir: (r[peta.akhir] ?? "").trim(),
        km: peta.km >= 0 ? angka(r[peta.km] ?? "") : null,
      }))
      .filter((b) => b.awal !== "" && b.akhir !== "");
  }, [tabel, peta]);

  // Pratinjau diminta ulang tiap pemetaan kolom atau tempelan berubah. Ditunda
  // sebentar supaya mengetik di dropdown tidak memanggil database tiap ketukan.
  useEffect(() => {
    if (!pilih || barisSiap.length === 0) {
      setLihat(null);
      return;
    }
    let batal = false;
    setMenghitung(true);
    const t = setTimeout(async () => {
      const h = await onPratinjau(pilih, barisSiap);
      if (!batal) {
        setLihat(h);
        setMenghitung(false);
      }
    }, 350);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [pilih, barisSiap, onPratinjau]);

  const kirim = async () => {
    setProses(true);
    const h = await onImpor(pilih, barisSiap);
    setProses(false);
    if (h) {
      setHasil(h);
      setTeks("");
      setLihat(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── 1. Formatnya, diperlihatkan bukan diterangkan ── */}
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={EYEBROW}>Formatnya</p>
            <p className="text-xs text-ink-soft mt-1 max-w-2xl">
              Tiga kolom dari Excel. Baris judul boleh ada, boleh tidak. Kolom panjang boleh
              dikosongkan dan diisi belakangan.
            </p>
          </div>
          <button
            onClick={() => void navigator.clipboard.writeText(CONTOH)}
            className={BTN_GHOST}
          >
            <ClipboardCopy size={14} /> Salin contoh
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="text-xs border border-line rounded-lg">
            <thead>
              <tr className="bg-surface text-ink-soft">
                <th className="px-3 py-1.5 text-left font-semibold border-b border-line">Titik awal</th>
                <th className="px-3 py-1.5 text-left font-semibold border-b border-line">Titik akhir</th>
                <th className="px-3 py-1.5 text-left font-semibold border-b border-line">Panjang (km)</th>
                <th className="px-3 py-1.5 text-left font-semibold border-b border-line text-ink-muted">
                  → nama segmen yang terbentuk
                </th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {[
                ["GI AMPENAN", "REC. BRIMOB", "2,03", "GI AMPENAN - REC. BRIMOB"],
                ["REC. BRIMOB", "LBS PASAR", "3,4", "REC. BRIMOB - LBS. PASAR"],
                ["LBS PASAR", "UJUNG", "7", "LBS. PASAR - UJUNG"],
              ].map((r) => (
                <tr key={r[0] + r[1]} className="border-b border-line last:border-0">
                  {r.slice(0, 3).map((c, i) => (
                    <td key={i} className="px-3 py-1.5 text-ink">
                      {c}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-ink-muted">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-ink-muted mt-3 max-w-3xl">
          <b>Nama segmen disusun sistem</b> dari kedua ujungnya — jangan diketik sendiri. Tulis
          ujungnya sebagaimana diucapkan orang lapangan; awalan yang dikenali:{" "}
          <span className="font-mono text-ink">GI</span>,{" "}
          <span className="font-mono text-ink">PLTD</span>,{" "}
          <span className="font-mono text-ink">REC.</span>,{" "}
          <span className="font-mono text-ink">LBS</span>,{" "}
          <span className="font-mono text-ink">PMT</span>,{" "}
          <span className="font-mono text-ink">PENG.</span>, dan{" "}
          <span className="font-mono text-ink">UJUNG</span> untuk ujung jaringan. Yang tidak
          berawalan dianggap percabangan biasa.
        </p>
      </div>

      {/* ── 2. Penyulang ── */}
      <div className={`${CARD} p-5`}>
        <label className={EYEBROW}>Penyulang</label>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <select
            value={pilih}
            onChange={(e) => setPilih(e.target.value)}
            className={`${FIELD} w-[300px]`}
          >
            <option value="">— pilih penyulang —</option>
            {pilihan.map((p) => (
              <option key={p.penyulang} value={p.penyulang}>
                {p.penyulang} {p.ulp ? `· ${p.ulp}` : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-muted max-w-sm">
            Tidak ada di daftar? Daftarkan dulu di <b>Master Penyulang</b>. Segmen tanpa induk yang
            sah tidak bisa dipakai jadi WO.
          </p>
        </div>
      </div>

      {/* ── 3. Tempelan ── */}
      <div className={`${CARD} p-5`}>
        <label className={EYEBROW}>Tempel dari Excel</label>
        <textarea
          value={teks}
          onChange={(e) => tempel(e.target.value)}
          rows={8}
          placeholder={CONTOH}
          className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
        />

        {tabel && tabel.headers.length > 0 && (
          <>
            <p className="text-[11px] text-ink-muted mt-3">
              Kolom mana yang dipakai — dibetulkan kalau tebakannya meleset:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {KOLOM.map((k) => (
                <div key={k.key}>
                  <label className="text-[11px] text-ink-soft block mb-1">{k.label}</label>
                  <select
                    value={peta[k.key]}
                    onChange={(e) => setPeta((p) => ({ ...p, [k.key]: Number(e.target.value) }))}
                    className={`${FIELD} w-[190px]`}
                  >
                    <option value={-1}>— tidak dipakai —</option>
                    {tabel.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `kolom ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── 4. Pratinjau dari database ── */}
      {(menghitung || lihat) && (
        <div className={`${CARD} p-5`}>
          <div className="flex items-baseline gap-2">
            <p className={EYEBROW}>Yang akan terbentuk</p>
            {menghitung && <Loader2 size={13} className="animate-spin text-ink-muted" />}
          </div>

          {lihat && (
            <>
              <p className="text-xs text-ink-soft mt-1">
                <b className="text-ink">{lihat.dibuat} segmen baru</b> untuk {lihat.penyulang}
                {lihat.dilewati.length > 0 && ` · ${lihat.dilewati.length} baris dilewati`}
              </p>

              {lihat.siap.length > 0 && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line">
                  <table className="w-full text-xs">
                    <tbody>
                      {lihat.siap.map((b) => (
                        <tr key={b.nama} className="border-b border-line last:border-0">
                          <td className="px-3 py-1.5 text-ink font-medium">{b.nama}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-ink-soft w-[90px]">
                            {b.km !== null ? `${b.km} km` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sebabnya disebut satu per satu. Ringkasan "3 baris dilewati"
                  memaksa orang menebak yang mana — dan yang ditebak salah akan
                  ditempel ulang dengan kesalahan yang sama. */}
              {lihat.dilewati.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-amber-800 flex items-center gap-1.5">
                    <TriangleAlert size={13} className="text-amber-600" />
                    Dilewati:
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {lihat.dilewati.map((d, i) => (
                      <p key={i} className="text-[11px] text-ink-soft">
                        <span className="font-mono text-ink">
                          {d.baris.awal} → {d.baris.akhir}
                        </span>{" "}
                        — {d.sebab}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <button
            onClick={() => void kirim()}
            disabled={!lihat || lihat.dibuat === 0 || proses || menghitung}
            className={`${BTN_PRIMARY} mt-4`}
          >
            {proses ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Impor {lihat ? `${lihat.dibuat} segmen` : "segmen"}
          </button>
        </div>
      )}

      {hasil && (
        <div className={`${CARD} p-5`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {hasil.dibuat} segmen dibuat untuk {hasil.penyulang}
          </p>
          <p className="text-xs text-ink-muted mt-1">
            Lihat dan lengkapi panjangnya di tab <b>Daftar Segmen</b>.
          </p>
        </div>
      )}
    </div>
  );
}
