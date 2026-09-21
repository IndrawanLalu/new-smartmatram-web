"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Radio, TriangleAlert } from "lucide-react";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import type { SegmenBaris } from "../_hooks/useMasterSegmen";

/**
 * Daftar acuan segmen.
 *
 * Diurutkan dari YANG PALING LAMA TIDAK DIINSPEKSI, bukan menurut abjad. Itu
 * seluruh gunanya halaman ini: WO berikutnya tinggal diambil dari atas, bukan
 * diingat-ingat orang. Yang belum pernah diinspeksi sama sekali naik paling
 * atas — bukan turun ke bawah sebagai data kosong.
 */

const LABEL_SUMBER: Record<string, { teks: string; kelas: string }> = {
  lapangan: { teks: "lapangan", kelas: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  impor: { teks: "impor", kelas: "bg-slate-100 text-ink-soft border-line" },
  manual: { teks: "manual", kelas: "bg-slate-100 text-ink-soft border-line" },
};

export default function DaftarSegmen({
  baris,
  daftarUlp,
  loading,
  user,
  onUbahPanjang,
}: {
  baris: SegmenBaris[];
  daftarUlp: string[];
  loading: boolean;
  user: CurrentUser;
  onUbahPanjang: (segmenId: string, km: number | null) => Promise<unknown>;
}) {
  const bolehSemua = canSeeAllUnits(user.role);
  const [saring, setSaring] = useState(bolehSemua ? "" : (user.unit ?? ""));
  const [cari, setCari] = useState("");

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return baris
      .filter((b) => (!saring || b.ulp === saring) && b.status === "aktif")
      .filter((b) => !q || b.nama.toLowerCase().includes(q) || b.penyulang.toLowerCase().includes(q))
      .sort((a, b) => {
        // Belum pernah diinspeksi = paling mendesak, jadi paling atas.
        const ua = a.umur_inspeksi_bulan ?? Number.MAX_SAFE_INTEGER;
        const ub = b.umur_inspeksi_bulan ?? Number.MAX_SAFE_INTEGER;
        if (ua !== ub) return ub - ua;
        return a.penyulang.localeCompare(b.penyulang) || a.nama.localeCompare(b.nama);
      });
  }, [baris, saring, cari]);

  const totalKm = tampil.reduce((n, b) => n + (b.panjang_pakai_km ?? 0), 0);
  const kmKetikan = tampil
    .filter((b) => b.panjang_dari === "ketikan")
    .reduce((n, b) => n + (b.panjang_pakai_km ?? 0), 0);
  const persenKetikan = totalKm > 0 ? (kmKetikan / totalKm) * 100 : 0;
  const belumDiukur = tampil.filter((b) => b.panjang_dari === "kosong").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat master segmen…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          {bolehSemua && (
            <>
              <button
                onClick={() => setSaring("")}
                className={`${CHIP} ${saring === "" ? CHIP_ON : CHIP_OFF}`}
              >
                Semua ULP
              </button>
              {daftarUlp.map((u) => (
                <button
                  key={u}
                  onClick={() => setSaring(u)}
                  className={`${CHIP} ${saring === u ? CHIP_ON : CHIP_OFF}`}
                >
                  {u}
                </button>
              ))}
            </>
          )}
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari segmen atau penyulang…"
            className={`${FIELD} w-[240px] ml-auto`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-ink-soft">
          <span>
            <b className="text-ink tabular-nums">{tampil.length}</b> segmen
          </span>
          <span>
            <b className="text-ink tabular-nums">{totalKm.toFixed(2)}</b> km
          </span>
          {/* Berapa bagian dari angka itu yang sebenarnya kiraan. Tanpa ini,
              capaian km bulan ini dan bulan lalu diam-diam mengukur hal yang
              berbeda, dan tidak ada yang tahu bagian mana. */}
          {kmKetikan > 0 && (
            <span className="text-amber-700">
              ✎ <b className="tabular-nums">{kmKetikan.toFixed(2)}</b> km ({persenKetikan.toFixed(0)}%)
              masih angka ketikan
            </span>
          )}
          {belumDiukur > 0 && (
            <span className="text-ink-muted">{belumDiukur} segmen belum punya panjang sama sekali</span>
          )}
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Paling lama tidak diinspeksi, di atas</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line bg-surface">
                {["Penyulang", "Segmen", "Sumber", "Panjang", "Tiang", "Terakhir diinspeksi", ""].map(
                  (h) => (
                    <th key={h} className="px-3 py-2.5 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {tampil.map((b) => (
                <Baris key={b.segmen_id} b={b} onUbahPanjang={onUbahPanjang} />
              ))}
              {tampil.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-ink-muted text-xs">
                    Belum ada segmen di sini. Tempelkan daftarnya lewat tab <b>Impor Segmen</b>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-ink-muted mt-3">
          <b>Terakhir dirabas</b> belum ada di sini — sumbernya baru lahir bersama modul WO
          Perabasan. Kolom kosong yang terlihat seperti data akan terbaca sebagai “belum pernah
          dirabas”, dan itu belum bisa dipertanggungjawabkan.
        </p>
      </div>
    </div>
  );
}

function Baris({
  b,
  onUbahPanjang,
}: {
  b: SegmenBaris;
  onUbahPanjang: (segmenId: string, km: number | null) => Promise<unknown>;
}) {
  const [sunting, setSunting] = useState(false);
  const [nilai, setNilai] = useState(b.panjang_manual_km?.toString() ?? "");
  const [sibuk, setSibuk] = useState(false);

  const simpan = async () => {
    const v = nilai.trim() === "" ? null : Number(nilai.replace(",", "."));
    if (v !== null && !Number.isFinite(v)) return;
    setSibuk(true);
    await onUbahPanjang(b.segmen_id, v);
    setSibuk(false);
    setSunting(false);
  };

  const s = LABEL_SUMBER[b.sumber] ?? LABEL_SUMBER.manual;

  return (
    <tr className="border-b border-line last:border-0 hover:bg-surface/60">
      <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{b.penyulang}</td>
      <td className="px-3 py-2 font-medium text-ink">
        {b.nama}
        {b.tiang_bersama > 0 && (
          <span
            className="ml-1.5 text-[10px] text-violet-700"
            title={`${b.tiang_bersama} tiang dipikul bersama penyulang lain (underbuild)`}
          >
            ⇵{b.tiang_bersama}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${s.kelas}`}>
          {s.teks}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {sunting ? (
          <span className="inline-flex items-center gap-1">
            <input
              value={nilai}
              onChange={(e) => setNilai(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void simpan()}
              autoFocus
              placeholder="km"
              className={`${FIELD} w-[88px] h-8 text-right font-mono`}
            />
            <button
              onClick={() => void simpan()}
              disabled={sibuk}
              className="text-xs font-semibold text-navy-600 disabled:opacity-40"
            >
              {sibuk ? <Loader2 size={12} className="animate-spin" /> : "OK"}
            </button>
          </span>
        ) : (
          <button
            onClick={() => setSunting(true)}
            className="inline-flex items-center gap-1 group"
            title={
              b.panjang_dari === "hitungan"
                ? "Dihitung dari bentang tiang. Angka ketikan boleh diisi, tapi tidak akan dipakai selama hitungan ada."
                : "Angka ketikan — klik untuk membetulkan"
            }
          >
            <span className={`font-mono tabular-nums ${b.panjang_dari === "kosong" ? "text-ink-muted" : "text-ink"}`}>
              {b.panjang_pakai_km !== null ? b.panjang_pakai_km.toFixed(2) : "—"}
            </span>
            {b.panjang_dari === "ketikan" && <span className="text-amber-600 text-xs">✎</span>}
            <Pencil
              size={11}
              className="text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-ink-soft tabular-nums">{b.jumlah_tiang}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {b.terakhir_inspeksi ? (
          <span className="text-ink-soft">
            {b.terakhir_inspeksi}
            <span
              className={`ml-1.5 text-[10px] font-semibold ${
                (b.umur_inspeksi_bulan ?? 0) >= 12
                  ? "text-red-600"
                  : (b.umur_inspeksi_bulan ?? 0) >= 6
                    ? "text-amber-700"
                    : "text-ink-muted"
              }`}
            >
              {b.umur_inspeksi_bulan} bln
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
            <TriangleAlert size={12} /> belum pernah
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {b.inspeksi_berjalan && (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-navy-600"
            title="Ada inspeksi yang sedang berjalan di segmen ini"
          >
            <Radio size={11} /> berjalan
          </span>
        )}
      </td>
    </tr>
  );
}
