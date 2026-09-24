"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { canManageSettings, type CurrentUser } from "@/lib/roles";
import { CARD, FIELD } from "@/app/admin/_ui";
import { useWoHargardu } from "../_hooks/useWoHargardu";
import KartuWoUlp from "./KartuWoUlp";
import TabelWoHar from "./TabelWoHar";

/**
 * Tab WO Pemeliharaan — langkah 7 `rencana-hargardu.md`, sepola WO Pengukuran.
 *
 *   atas   satu kartu per ULP: ringkasan realisasi / terbitkan / kriteria
 *   bawah  baris WO bulan terpilih beserta statusnya
 *
 * Realisasi dihitung saat regu MENGIRIM (keputusan user 24 Sep 2026); yang
 * belum disetujui tampil terpisah. HP HARGAR menampilkan WO ini sebagai daftar
 * "WO bulan ini" — tidak ada yang perlu dicentang.
 */

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const bulanIni = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" }).slice(0, 7);

export default function WoPemeliharaan({ user, ulp, daftarUlp }: { user: CurrentUser; ulp: string; daftarUlp: string[] }) {
  const [periode, setPeriode] = useState(bulanIni());
  const daftar = ulp === "SEMUA" ? daftarUlp.filter((u) => u !== "SEMUA") : [ulp];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={periode}
          onChange={(e) => e.target.value && setPeriode(e.target.value)}
          className={`${FIELD} w-[170px]`}
          aria-label="Bulan WO"
        />
        <p className="text-[11px] text-ink-muted">
          Satu WO per ULP per bulan. Gardu yang jatuh tempo = belum pernah dipelihara, atau pemeliharaan terakhirnya
          sudah melewati interval frekuensi. Yang telat dikerjakan otomatis masuk kandidat bulan berikutnya.
        </p>
      </div>

      {/* key: ganti bulan/ULP = pasang ulang, jadi angka bulan lama tidak
          sempat tampil di bawah judul bulan baru. */}
      <IsiWo key={`${periode}|${daftar.join()}`} user={user} daftar={daftar} periode={periode} />
    </div>
  );
}

function IsiWo({ user, daftar, periode }: { user: CurrentUser; daftar: string[]; periode: string }) {
  const [tahun, bulan] = periode.split("-").map(Number);
  const w = useWoHargardu(daftar, tahun, bulan);
  const label = `${BULAN[bulan - 1]} ${tahun}`;

  return (
    <>
      {w.galat ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">WO Pemeliharaan gagal dimuat</p>
            <p className="mt-0.5 text-amber-700">{w.galat}</p>
            <button onClick={w.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
          </div>
        </div>
      ) : w.loading ? (
        <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
          <Loader2 size={16} className="animate-spin" /> Menyusun WO Pemeliharaan…
        </div>
      ) : (
        <>
          <div className={`grid gap-3 ${daftar.length > 1 ? "md:grid-cols-2" : ""}`}>
            {daftar.map((u) => {
              const info = w.perUlp.get(u);
              const s = w.settingsUntuk(u);
              return (
                <KartuWoUlp
                  // Pasang ulang saat kriteria tersimpan berubah, supaya draf
                  // isian tidak tertinggal nilai lama.
                  key={`${u}-${JSON.stringify(s)}`}
                  ulp={u}
                  periode={label}
                  header={info?.header ?? null}
                  kandidat={info?.kandidat ?? []}
                  aktif={info?.aktif ?? 0}
                  rows={w.rows.filter((r) => r.ulp === u)}
                  settings={s}
                  bolehKelola={canManageSettings(user.role)}
                  memproses={w.memproses}
                  terbitkan={w.terbitkan}
                  hapus={w.hapus}
                  simpanSetting={w.simpanSetting}
                />
              );
            })}
          </div>
          <TabelWoHar rows={w.rows} />
        </>
      )}
    </>
  );
}
