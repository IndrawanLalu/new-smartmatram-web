"use client";

import { useMemo, useState } from "react";
import { FileWarning, Loader2, Send, TriangleAlert } from "lucide-react";
import { BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, UNITS, type CurrentUser } from "@/lib/roles";
import type { SegmenPilihan } from "../_hooks/useWoPerabasan";

/**
 * Menerbitkan WO perabasan.
 *
 * Yang harus terlihat SAAT MENCENTANG, bukan sesudah terbit:
 *
 *   1. Total km berjalan — karena targetnya km, bukan jumlah segmen.
 *   2. Berapa km di antaranya yang masih angka KETIKAN. Capaian dari segmen
 *      berpanjang ketikan tidak sebanding dengan yang diukur dari bentang
 *      tiang, dan WO yang seluruhnya ketikan menghasilkan laporan yang tidak
 *      bisa dibandingkan dengan bulan lalu.
 *   3. Segmen yang belum punya panjang SAMA SEKALI. Yang ini menyumbang 0 km
 *      ke rencana — tanpa penanda, WO terlihat kurang dari targetnya tanpa
 *      sebab yang jelas.
 */

export default function TerbitkanWo({
  user,
  segmen,
  segmenTerikat,
  onTerbitkan,
}: {
  user: CurrentUser;
  segmen: SegmenPilihan[];
  segmenTerikat: Set<string>;
  onTerbitkan: (v: {
    ulp: string;
    nama: string;
    targetKm: number;
    segmen: string[];
    tglWo: string;
  }) => Promise<{ item: number; dilewati: { segmen: string; sebab: string }[] } | null>;
}) {
  const bolehSemua = canSeeAllUnits(user.role);
  const [ulp, setUlp] = useState(bolehSemua ? "" : (user.unit ?? ""));
  const [nama, setNama] = useState("");
  const [target, setTarget] = useState("");
  const [tgl, setTgl] = useState(() => new Date().toISOString().slice(0, 10));
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [saringPenyulang, setSaringPenyulang] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const tersedia = useMemo(
    () =>
      segmen
        .filter((s) => (!ulp || s.ulp === ulp) && !segmenTerikat.has(s.segmen_id))
        .filter((s) => !saringPenyulang || s.penyulang === saringPenyulang)
        // Paling lama tidak diinspeksi di atas — sepola Master Segmen, supaya
        // yang paling perlu dirabas tidak harus dicari.
        .sort((a, b) => {
          const ua = a.umur_inspeksi_bulan ?? Number.MAX_SAFE_INTEGER;
          const ub = b.umur_inspeksi_bulan ?? Number.MAX_SAFE_INTEGER;
          return ub - ua || a.penyulang.localeCompare(b.penyulang);
        }),
    [segmen, ulp, segmenTerikat, saringPenyulang],
  );

  const daftarPenyulang = useMemo(
    () => [...new Set(segmen.filter((s) => !ulp || s.ulp === ulp).map((s) => s.penyulang))].sort(),
    [segmen, ulp],
  );

  const dipilih = useMemo(
    () => tersedia.filter((s) => pilih.has(s.segmen_id)),
    [tersedia, pilih],
  );
  const totalKm = dipilih.reduce((n, s) => n + (s.panjang_pakai_km ?? 0), 0);
  const kmKetikan = dipilih
    .filter((s) => s.panjang_dari === "ketikan")
    .reduce((n, s) => n + (s.panjang_pakai_km ?? 0), 0);
  const tanpaPanjang = dipilih.filter((s) => s.panjang_dari === "kosong").length;

  const targetNum = Number(target.replace(",", ".")) || 0;
  const siap = !!ulp && nama.trim().length > 2 && targetNum > 0 && dipilih.length > 0;

  const kirim = async () => {
    setSibuk(true);
    const h = await onTerbitkan({
      ulp,
      nama: nama.trim(),
      targetKm: targetNum,
      segmen: dipilih.map((s) => s.segmen_id),
      tglWo: tgl,
    });
    setSibuk(false);
    if (h) {
      setPilih(new Set());
      setNama("");
      setTarget("");
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Terbitkan WO perabasan</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Satu WO boleh memuat segmen dari beberapa penyulang, dan boleh terbit beberapa kali
          sebulan. Ukurannya <b>total kilometer</b> — bukan jumlah segmen, karena ruas 7 km dan
          ruas 0,3 km bukan pekerjaan yang sebanding.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className={EYEBROW}>ULP</label>
            <select
              value={ulp}
              onChange={(e) => {
                setUlp(e.target.value);
                setPilih(new Set());
              }}
              disabled={!bolehSemua}
              className={`${FIELD} mt-1 block w-[170px] disabled:opacity-60`}
            >
              <option value="">— pilih ULP —</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={EYEBROW}>Nama WO</label>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Perabasan Oktober 2026"
              className={`${FIELD} mt-1 block w-[250px]`}
            />
          </div>
          <div>
            <label className={EYEBROW}>Target (km)</label>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="25"
              className={`${FIELD} mt-1 block w-[110px] text-right font-mono`}
            />
          </div>
          <div>
            <label className={EYEBROW}>Tanggal WO</label>
            <input
              type="date"
              value={tgl}
              onChange={(e) => setTgl(e.target.value)}
              className={`${FIELD} mt-1 block w-[160px]`}
            />
          </div>
        </div>
      </div>

      {/* Angka berjalan, menempel di atas daftar supaya terbaca saat mencentang
          — bukan setelah menggulir ke bawah. */}
      <div className={`${CARD} p-4 sticky top-2 z-10`}>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-sm">
            <b className="text-ink tabular-nums text-lg">{dipilih.length}</b>{" "}
            <span className="text-ink-soft">segmen dipilih</span>
          </span>
          <span className="text-sm">
            <b className="text-ink tabular-nums text-lg">{totalKm.toFixed(2)}</b>{" "}
            <span className="text-ink-soft">km</span>
            {targetNum > 0 && (
              <span className={`ml-1.5 text-xs ${totalKm > targetNum ? "text-amber-700" : "text-ink-muted"}`}>
                dari target {targetNum.toFixed(2)} km
              </span>
            )}
          </span>
          {kmKetikan > 0 && (
            <span className="text-xs text-amber-700">
              ✎ <b className="tabular-nums">{kmKetikan.toFixed(2)}</b> km masih angka ketikan
            </span>
          )}
          {tanpaPanjang > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-red-700">
              <FileWarning size={13} />
              {tanpaPanjang} segmen belum punya panjang — menyumbang 0 km ke rencana
            </span>
          )}
          <button
            onClick={() => void kirim()}
            disabled={!siap || sibuk}
            className={`${BTN_PRIMARY} ml-auto`}
          >
            {sibuk ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Terbitkan WO
          </button>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSaringPenyulang("")}
            className={`${CHIP} ${saringPenyulang === "" ? CHIP_ON : CHIP_OFF}`}
          >
            Semua penyulang
          </button>
          {daftarPenyulang.map((p) => (
            <button
              key={p}
              onClick={() => setSaringPenyulang(p)}
              className={`${CHIP} ${saringPenyulang === p ? CHIP_ON : CHIP_OFF}`}
            >
              {p}
            </button>
          ))}
        </div>

        {!ulp ? (
          <p className="text-xs text-ink-muted py-10 text-center">Pilih ULP dulu.</p>
        ) : tersedia.length === 0 ? (
          <p className="text-xs text-ink-muted py-10 text-center">
            Tidak ada segmen yang bisa dipilih. Yang sudah terikat WO lain tidak muncul di sini —
            batalkan dulu di sana kalau memang mau dipindahkan.
          </p>
        ) : (
          <div className="mt-3 space-y-1">
            {tersedia.map((s) => {
              const aktif = pilih.has(s.segmen_id);
              return (
                <label
                  key={s.segmen_id}
                  className={`flex flex-wrap items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                    aktif ? "border-navy-300 bg-navy-50/50" : "border-line hover:bg-surface"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={aktif}
                    onChange={() =>
                      setPilih((prev) => {
                        const n = new Set(prev);
                        n.has(s.segmen_id) ? n.delete(s.segmen_id) : n.add(s.segmen_id);
                        return n;
                      })
                    }
                    className="accent-navy-600"
                  />
                  <span className="text-xs text-ink-soft w-[130px] truncate">{s.penyulang}</span>
                  <span className="text-sm text-ink flex-1 min-w-[200px]">{s.nama}</span>
                  <span className="text-sm font-mono tabular-nums text-ink w-[80px] text-right">
                    {s.panjang_pakai_km !== null ? s.panjang_pakai_km.toFixed(2) : "—"}
                    {s.panjang_dari === "ketikan" && <span className="text-amber-600"> ✎</span>}
                  </span>
                  <span className="w-[120px] text-right text-[11px]">
                    {s.umur_inspeksi_bulan === null ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                        <TriangleAlert size={11} /> belum diinspeksi
                      </span>
                    ) : (
                      <span className="text-ink-muted">{s.umur_inspeksi_bulan} bln lalu</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
