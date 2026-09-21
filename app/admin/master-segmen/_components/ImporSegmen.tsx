"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert, Upload } from "lucide-react";
import { parseClipboardTable } from "@/lib/parseClipboardTable";
import { BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import type { BarisImpor, HasilImpor } from "../_hooks/useMasterSegmen";

/**
 * Impor segmen per penyulang, ditempel dari Excel.
 *
 * PENYULANGNYA DIPILIH DARI MASTER, tidak diketik. Di situlah ikatan
 * gardu–penyulang–segmen benar-benar ditegakkan: yang belum terdaftar tidak
 * muncul di daftar pilihan sama sekali, jadi tidak ada jalan membuat segmen
 * yang induknya tidak dikenal siapa pun.
 */

const KOLOM = [
  { key: "awal", label: "Titik awal", tebak: /awal|dari|from/i },
  { key: "akhir", label: "Titik akhir", tebak: /akhir|sampai|ke$|to$/i },
  { key: "km", label: "Panjang (km)", tebak: /km|panjang|jarak/i },
] as const;

type KolomKey = (typeof KOLOM)[number]["key"];

/** Berkas lapangan hampir selalu memakai koma desimal. */
const angka = (s: string): number | null => {
  const v = parseFloat((s ?? "").trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

export default function ImporSegmen({
  user,
  penyulang,
  onImpor,
}: {
  user: CurrentUser;
  penyulang: { penyulang: string; ulp: string | null }[];
  onImpor: (namaPenyulang: string, isi: BarisImpor[]) => Promise<HasilImpor | null>;
}) {
  const [pilih, setPilih] = useState("");
  const [teks, setTeks] = useState("");
  const [peta, setPeta] = useState<Record<KolomKey, number>>({ awal: -1, akhir: -1, km: -1 });
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState<HasilImpor | null>(null);

  // Admin ULP hanya melihat penyulang unitnya sendiri — daftar yang memuat
  // penyulang ULP lain cuma menawarkan kesalahan yang nanti ditolak database.
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

  const kirim = async () => {
    setProses(true);
    const h = await onImpor(pilih, barisSiap);
    setProses(false);
    if (h) {
      setHasil(h);
      setTeks("");
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Impor segmen</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Tempelkan daftar ruas dari Excel. Nama segmennya disusun sistem dari kedua ujungnya —
          tulis ujungnya sebagaimana diucapkan orang lapangan: <b>GI AMPENAN</b>,{" "}
          <b>REC. BRIMOB</b>, <b>LBS PASAR</b>, <b>UJUNG</b>.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
          Panjangnya boleh dikosongkan dan diisi belakangan. Begitu inspeksi JTM menelusuri
          tiangnya, panjang beralih sendiri dari angka ketikan ke hitungan bentang — angka
          ketikannya tidak dihapus, hanya berhenti dipakai.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className={EYEBROW}>Penyulang</label>
            <select
              value={pilih}
              onChange={(e) => setPilih(e.target.value)}
              className={`${FIELD} mt-1 block w-[280px]`}
            >
              <option value="">— pilih penyulang —</option>
              {pilihan.map((p) => (
                <option key={p.penyulang} value={p.penyulang}>
                  {p.penyulang} {p.ulp ? `· ${p.ulp}` : ""}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-ink-muted max-w-sm pb-2">
            Tidak ada di daftar? Daftarkan dulu di <b>Master Penyulang</b>. Segmen tanpa induk yang
            sah tidak bisa dipakai jadi WO.
          </p>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <label className={EYEBROW}>Tempel dari Excel</label>
        <textarea
          value={teks}
          onChange={(e) => tempel(e.target.value)}
          rows={8}
          placeholder={"Titik awal\tTitik akhir\tPanjang (km)\nGI AMPENAN\tREC. BRIMOB\t2,03\nREC. BRIMOB\tLBS PASAR\t3,4\nLBS PASAR\tUJUNG\t7"}
          className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
        />

        {tabel && tabel.headers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
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
        )}

        {barisSiap.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-ink-soft">
              <b className="text-ink">{barisSiap.length} baris</b> siap diimpor
              {barisSiap.filter((b) => b.km === null).length > 0 &&
                ` · ${barisSiap.filter((b) => b.km === null).length} tanpa panjang`}
            </p>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <tbody>
                  {barisSiap.slice(0, 40).map((b, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-2.5 py-1.5 text-ink">{b.awal}</td>
                      <td className="px-2.5 py-1.5 text-ink-muted">→</td>
                      <td className="px-2.5 py-1.5 text-ink">{b.akhir}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-ink-soft">
                        {b.km !== null ? `${b.km} km` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button
          onClick={() => void kirim()}
          disabled={!pilih || barisSiap.length === 0 || proses}
          className={`${BTN_PRIMARY} mt-4`}
        >
          {proses ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Impor {barisSiap.length > 0 ? `${barisSiap.length} segmen` : "segmen"}
        </button>
      </div>

      {hasil && (
        <div className={`${CARD} p-5`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {hasil.dibuat} segmen dibuat untuk {hasil.penyulang}
          </p>
          {hasil.dilewati.length > 0 && (
            <>
              {/* Yang dilewati disebut satu per satu beserta sebabnya. Ringkasan
                  "3 baris dilewati" memaksa orang menebak yang mana — dan yang
                  ditebak salah akan diimpor ulang dengan kesalahan yang sama. */}
              <p className="text-xs text-amber-800 mt-3 flex items-center gap-1.5">
                <TriangleAlert size={13} className="text-amber-600" />
                {hasil.dilewati.length} baris dilewati:
              </p>
              <div className="mt-1.5 space-y-1">
                {hasil.dilewati.map((d, i) => (
                  <p key={i} className="text-[11px] text-ink-soft">
                    <span className="font-mono text-ink">
                      {d.baris.awal} → {d.baris.akhir}
                    </span>{" "}
                    — {d.sebab}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
