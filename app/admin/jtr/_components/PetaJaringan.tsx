"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPinOff, Zap, Search, X, Check } from "lucide-react";
import { type CurrentUser } from "@/lib/roles";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import { useTiangJtr } from "../_hooks/useTiangJtr";

const PetaJaringanInner = dynamic(() => import("./PetaJaringanInner"), {
  ssr: false,
  loading: () => <div className="h-full rounded-xl border border-line bg-surface animate-pulse" />,
});

const SELECT =
  "h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15";

/**
 * Batas jumlah tiang yang digambar sekaligus.
 *
 * Leaflet mulai tersendat di atas beberapa ratus penanda, dan peta yang macet
 * lebih buruk daripada peta yang meminta disaring dulu. Angkanya longgar —
 * yang dicegah bukan seribu tiang, tapi belasan ribu saat seluruh ULP terpetakan.
 */
const BATAS_GAMBAR = 1500;

export default function PetaJaringan({ user }: { user: CurrentUser }) {
  const { baris, penyulangList, garduList, loading, error } = useTiangJtr(user);
  const [penyulang, setPenyulang] = useState("");
  /** Kosong berarti semua. Lebih dari satu boleh — membandingkan jaringan dua
   *  gardu bersebelahan justru yang paling sering dibutuhkan. */
  const [garduTerpilih, setGarduTerpilih] = useState<string[]>([]);
  const [cariGardu, setCariGardu] = useState("");
  const [bukaDaftar, setBukaDaftar] = useState(false);

  // Gardu menyempit mengikuti penyulang — daftar 894 gardu tanpa penyaring
  // praktis tidak bisa dipakai.
  const garduTersedia = useMemo(() => {
    const dasar = penyulang
      ? [...new Set(baris.filter((b) => b.penyulang === penyulang).map((b) => b.gardu_kode))].sort()
      : garduList;
    const q = cariGardu.trim().toUpperCase();
    return q ? dasar.filter((g) => g.toUpperCase().includes(q)) : dasar;
  }, [baris, garduList, penyulang, cariGardu]);

  const pilihGardu = (kode: string) =>
    setGarduTerpilih((s) =>
      s.includes(kode) ? s.filter((x) => x !== kode) : [...s, kode],
    );

  const tersaring = useMemo(
    () =>
      baris.filter(
        (b) =>
          (!penyulang || b.penyulang === penyulang) &&
          (garduTerpilih.length === 0 || garduTerpilih.includes(b.gardu_kode)),
      ),
    [baris, penyulang, garduTerpilih],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat jaringan…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>;
  }

  const terlaluBanyak = tersaring.length > BATAS_GAMBAR;

  return (
    <div className="flex flex-col gap-3 h-full min-h-[420px]">
      <div className={`${CARD} px-4 py-3 flex flex-wrap items-end gap-3 shrink-0`}>
        <div>
          <p className={EYEBROW}>Penyulang</p>
          <select
            value={penyulang}
            onChange={(e) => {
              setPenyulang(e.target.value);
              // Gardu yang terpilih belum tentu ada di penyulang baru — dibersihkan
              // supaya peta tidak kosong tanpa penjelasan.
              setGarduTerpilih([]);
              setCariGardu("");
            }}
            className={`${SELECT} mt-1 min-w-[180px]`}
          >
            <option value="">Semua penyulang</option>
            {penyulangList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Gardu: dicari dan boleh lebih dari satu. Daftar 894 gardu di dalam
            <select> tidak bisa dipakai — orang tahu kodenya, bukan urutannya. */}
        <div className="relative">
          <p className={EYEBROW}>Gardu</p>
          <button
            type="button"
            onClick={() => setBukaDaftar((b) => !b)}
            className={`${SELECT} mt-1 min-w-[200px] text-left flex items-center gap-2`}
          >
            <Search size={14} className="text-ink-muted shrink-0" />
            <span className="truncate">
              {garduTerpilih.length === 0
                ? "Semua gardu"
                : garduTerpilih.length === 1
                  ? garduTerpilih[0]
                  : `${garduTerpilih.length} gardu dipilih`}
            </span>
          </button>

          {bukaDaftar && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setBukaDaftar(false)} />
              <div className="absolute z-40 mt-1 w-72 rounded-xl border border-line bg-white shadow-lg overflow-hidden">
                <div className="p-2 border-b border-line">
                  <input
                    autoFocus
                    value={cariGardu}
                    onChange={(e) => setCariGardu(e.target.value)}
                    placeholder="Ketik kode gardu…"
                    className="w-full h-9 rounded-lg border border-line px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {garduTersedia.length === 0 ? (
                    <p className="text-sm text-ink-muted px-3 py-6 text-center">
                      Tidak ada gardu yang cocok
                    </p>
                  ) : (
                    garduTersedia.map((g) => {
                      const dipilih = garduTerpilih.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => pilihGardu(g)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface ${
                            dipilih ? "text-navy-600 font-semibold" : "text-ink"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              dipilih ? "bg-navy-600 border-navy-600" : "border-line"
                            }`}
                          >
                            {dipilih && <Check size={12} className="text-white" />}
                          </span>
                          {g}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {(penyulang || garduTerpilih.length > 0) && (
          <button
            onClick={() => {
              setPenyulang("");
              setGarduTerpilih([]);
              setCariGardu("");
            }}
            className="h-9 px-3 rounded-xl border border-line bg-white text-sm text-ink-soft hover:bg-surface"
          >
            Bersihkan
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
          <Zap size={15} className="text-navy-600" />
          <span>
            <b className="text-ink">{tersaring.length.toLocaleString("id-ID")}</b> tiang
            {tersaring.length !== baris.length && ` dari ${baris.length.toLocaleString("id-ID")}`}
          </span>
        </div>
      </div>

      {garduTerpilih.length > 0 && (
        <div className="flex flex-wrap gap-2 shrink-0">
          {garduTerpilih.map((g) => (
            <button
              key={g}
              onClick={() => pilihGardu(g)}
              className="inline-flex items-center gap-1.5 h-7 pl-3 pr-2 rounded-full bg-navy-600 text-white text-xs font-semibold hover:bg-navy-500"
            >
              {g}
              <X size={13} />
            </button>
          ))}
        </div>
      )}

      {baris.length === 0 ? (
        <div className={`${CARD} flex-1 flex flex-col items-center justify-center gap-2 text-center`}>
          <MapPinOff size={34} className="text-ink-muted" />
          <p className="font-semibold text-ink">Belum ada tiang tercatat</p>
          <p className="text-sm text-ink-soft max-w-sm">
            Jaringan akan muncul di sini begitu petugas mulai menitik dari aplikasi.
          </p>
        </div>
      ) : terlaluBanyak ? (
        <div className={`${CARD} flex-1 flex flex-col items-center justify-center gap-2 text-center`}>
          <MapPinOff size={34} className="text-attention" />
          <p className="font-semibold text-ink">
            {tersaring.length.toLocaleString("id-ID")} tiang terlalu banyak digambar sekaligus
          </p>
          <p className="text-sm text-ink-soft max-w-md">
            Pilih penyulang atau gardu lebih dulu. Menggambar semuanya membuat peta tersendat,
            dan peta yang macet lebih menyulitkan daripada peta yang perlu disaring.
          </p>
        </div>
      ) : (
        // `isolate`: panel Leaflet ber-z-index 400–1000; tanpa lapisan sendiri
        // daftar pencarian gardu di atas tenggelam di bawah peta.
        <div className="flex-1 min-h-0 isolate">
          <PetaJaringanInner tiang={tersaring} />
        </div>
      )}
    </div>
  );
}
