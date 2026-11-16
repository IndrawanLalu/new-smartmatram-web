"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Camera, FileText, Hourglass, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import StatTile from "@/app/admin/_components/StatTile";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import Ps4Laporan from "./Ps4Laporan";

/**
 * Realisasi PS4 (scripts/apkt-ps4.sql): per petugas APKT, laporan Selesai yang
 * berfoto (minimal 1) — versi tanpa verifikasi — dan yang diverifikasi
 * Masuk PS4. Penyebut keduanya = laporan Selesai.
 */

interface Baris {
  petugas: string | null;
  laporan: number;
  berfoto: number;
  diverifikasi: number;
  masuk_ps4: number;
}

interface Props {
  dari: string;
  sampai: string;
  /** "" = semua ULP (UP3); server tetap membatasi akun lain ke ULP sendiri. */
  ulp: string;
}

const TH = "py-2.5 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line whitespace-nowrap";
const TD = "py-2 px-3 border-b border-line tabular-nums";
const persen = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—";
/** Selama ada antrean: baca ulang tiap 10 detik (pekerja ± 1 laporan / 12–15 detik). */
const SEGAR_ANTRE = 10_000;
/** Penanda pilihan "belum diambil" (petugas NULL) — beda dari tidak memilih. */
const BELUM = "\u0000belum";

export default function RealisasiPs4Tab({ dari, sampai, ulp }: Props) {
  const [baris, setBaris] = useState<Baris[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pilih, setPilih] = useState<string | null>(null);
  const [versi, setVersi] = useState(0);
  const [antre, setAntre] = useState<Set<string>>(new Set());

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .rpc("realisasi_ps4", { p_dari: dari, p_sampai: sampai, p_ulp: ulp || null })
      .then(({ data, error }) => {
        if (!hidup) return;
        setGalat(error ? error.message : null);
        setBaris((data ?? []) as Baris[]);
      });
    return () => { hidup = false; };
  }, [dari, sampai, ulp, versi]);

  // Antrean pekerja (permintaan manual yang belum diproses) — dari server, jadi
  // tetap ada sesudah reload. Selama ada isinya, tab ini memperbarui diri.
  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .from("apkt_foto_laporan")
      .select("no_laporan")
      .not("minta_manual_at", "is", null)
      .then(({ data }) => { if (hidup) setAntre(new Set((data ?? []).map((r) => r.no_laporan as string))); });
    return () => { hidup = false; };
  }, [versi]);

  const adaAntre = antre.size > 0;
  useEffect(() => {
    if (!adaAntre) return;
    const t = setInterval(() => setVersi((v) => v + 1), SEGAR_ANTRE);
    return () => clearInterval(t);
  }, [adaAntre]);

  const total = useMemo(() => {
    const t = { laporan: 0, berfoto: 0, diverifikasi: 0, masuk_ps4: 0, belum: 0 };
    for (const b of baris ?? []) {
      t.laporan += b.laporan; t.berfoto += b.berfoto; t.diverifikasi += b.diverifikasi; t.masuk_ps4 += b.masuk_ps4;
      if (b.petugas === null) t.belum += b.laporan;
    }
    return t;
  }, [baris]);

  if (galat) return <div className={`${CARD} p-4 text-sm text-red-700`}>Realisasi PS4 gagal dibaca: {galat}</div>;
  if (!baris) return <div className={`${CARD} p-4 text-sm text-ink-soft`}>Memuat Realisasi PS4…</div>;

  const petugasPilih = pilih === BELUM ? null : pilih;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatTile label="Laporan Selesai" value={total.laporan} icon={FileText} hint={`${dari} s/d ${sampai}`} />
        <StatTile label="Berfoto" value={total.berfoto} icon={Camera} tone="navy"
          hint={`${persen(total.berfoto, total.laporan)} — tanpa verifikasi`} />
        <StatTile label="Masuk PS4" value={total.masuk_ps4} icon={BadgeCheck} tone="green"
          hint={`${persen(total.masuk_ps4, total.laporan)} — diverifikasi ${total.diverifikasi} dari ${total.berfoto}`} />
        <StatTile label="Belum diambil fotonya" value={total.belum} icon={Hourglass}
          tone={total.belum > 0 ? "attention" : "green"} hint="otomatis 00.00–06.00 WITA" />
      </div>

      {adaAntre && (
        <div className="rounded-xl border border-navy-200 bg-navy-50 px-4 py-2.5 text-sm text-navy-700 flex items-center gap-2">
          <Loader2 size={15} className="animate-spin shrink-0" />
          <span>
            Pekerja sedang mengambil foto: <b className="tabular-nums">{antre.size}</b> laporan lagi di antrean
            (± {Math.max(1, Math.ceil((antre.size * 13) / 60))} menit). Angka di halaman ini diperbarui sendiri.
          </span>
        </div>
      )}

      <div className={`${CARD} overflow-x-auto`}>
        <p className={`${EYEBROW} px-4 pt-3`}>Per petugas — klik untuk melihat laporannya</p>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr>
              <th className={TH}>Petugas</th>
              <th className={`${TH} text-right`}>Laporan</th>
              <th className={`${TH} text-right`}>Berfoto</th>
              <th className={`${TH} text-right`}>%</th>
              <th className={`${TH} text-right`}>Diverifikasi</th>
              <th className={`${TH} text-right`}>Masuk PS4</th>
              <th className={`${TH} text-right`}>% PS4</th>
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-ink-soft">Tidak ada laporan Selesai pada rentang ini.</td></tr>
            )}
            {baris.map((b) => {
              const kunci = b.petugas ?? BELUM;
              return (
                <tr key={kunci} onClick={() => setPilih(pilih === kunci ? null : kunci)}
                  className={`cursor-pointer hover:bg-navy-50/60 ${pilih === kunci ? "bg-navy-50" : ""}`}>
                  <td className={`${TD} font-medium ${b.petugas ? "text-ink" : "text-ink-soft italic"}`}>
                    {b.petugas ?? "Belum diambil fotonya"}
                  </td>
                  <td className={`${TD} text-right`}>{b.laporan}</td>
                  <td className={`${TD} text-right`}>{b.petugas ? b.berfoto : "—"}</td>
                  <td className={`${TD} text-right font-semibold`}>{b.petugas ? persen(b.berfoto, b.laporan) : "—"}</td>
                  <td className={`${TD} text-right`}>{b.petugas ? b.diverifikasi : "—"}</td>
                  <td className={`${TD} text-right`}>{b.petugas ? b.masuk_ps4 : "—"}</td>
                  <td className={`${TD} text-right font-semibold`}>{b.petugas ? persen(b.masuk_ps4, b.laporan) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          {baris.length > 0 && (
            <tfoot>
              <tr className="font-semibold bg-surface">
                <td className={TD}>Total</td>
                <td className={`${TD} text-right`}>{total.laporan}</td>
                <td className={`${TD} text-right`}>{total.berfoto}</td>
                <td className={`${TD} text-right`}>{persen(total.berfoto, total.laporan)}</td>
                <td className={`${TD} text-right`}>{total.diverifikasi}</td>
                <td className={`${TD} text-right`}>{total.masuk_ps4}</td>
                <td className={`${TD} text-right`}>{persen(total.masuk_ps4, total.laporan)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pilih !== null && (
        <Ps4Laporan key={pilih} dari={dari} sampai={sampai} ulp={ulp} petugas={petugasPilih}
          antre={antre} versi={versi} onBerubah={() => setVersi((v) => v + 1)} />
      )}
    </div>
  );
}
