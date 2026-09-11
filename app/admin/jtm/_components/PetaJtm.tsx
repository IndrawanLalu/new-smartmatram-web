"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPinOff } from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useTiangJtm } from "../_hooks/useTiangJtm";

const PetaJtmInner = dynamic(() => import("./PetaJtmInner"), {
  ssr: false,
  loading: () => <div className="h-full rounded-xl border border-line bg-surface animate-pulse" />,
});

/** Leaflet mulai tersendat di atas beberapa ratus penanda, dan peta yang macet
 *  lebih buruk daripada peta yang meminta disaring dulu. */
const BATAS_GAMBAR = 1500;

export default function PetaJtm({ user }: { user: CurrentUser }) {
  const [ulp, setUlp] = useState("");
  const [penyulang, setPenyulang] = useState("");
  const { tiang, penyulangList, loading } = useTiangJtm(user, ulp);

  const tersaring = useMemo(
    () => tiang.filter((t) => !penyulang || t.penyulang === penyulang),
    [tiang, penyulang],
  );

  const bertitik = useMemo(
    () => tersaring.filter((t) => t.lat !== null && t.lng !== null),
    [tersaring],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat tiang…
      </div>
    );
  }

  const terlaluBanyak = bertitik.length > BATAS_GAMBAR;

  return (
    <div className="flex flex-col gap-3 h-full min-h-[420px]">
      <div className={`${CARD} px-4 py-3 flex flex-wrap items-end gap-3 shrink-0`}>
        <div>
          <p className={EYEBROW}>Penyulang</p>
          <select
            value={penyulang}
            onChange={(e) => setPenyulang(e.target.value)}
            className={`${FIELD} mt-1 block max-w-[220px]`}
          >
            <option value="">Semua penyulang</option>
            {penyulangList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {canSeeAllUnits(user.role) && (
          <div>
            <p className={EYEBROW}>ULP</p>
            <select
              value={ulp}
              onChange={(e) => setUlp(e.target.value)}
              className={`${FIELD} mt-1 block`}
            >
              <option value="">Semua ULP</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-xs text-ink-muted ml-auto">
          {bertitik.length.toLocaleString("id-ID")} tiang bertitik
          {tersaring.length !== bertitik.length &&
            ` · ${(tersaring.length - bertitik.length).toLocaleString("id-ID")} tanpa titik`}
        </p>
      </div>

      {bertitik.length === 0 ? (
        <div className={`${CARD} flex-1 flex flex-col items-center justify-center gap-2 text-center`}>
          <MapPinOff size={32} className="text-ink-muted" />
          <p className="text-sm text-ink-soft max-w-md">
            Belum ada tiang bertitik untuk saringan ini. Impor tiang dulu di tab sebelah, atau
            tunggu regu menyapu di lapangan.
          </p>
        </div>
      ) : terlaluBanyak ? (
        <div className={`${CARD} flex-1 flex flex-col items-center justify-center gap-2 text-center`}>
          <p className="text-sm text-ink-soft max-w-md">
            {bertitik.length.toLocaleString("id-ID")} tiang terlalu banyak untuk digambar
            sekaligus. Saring penyulangnya dulu — peta yang macet lebih buruk daripada peta yang
            meminta disaring.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <PetaJtmInner tiang={bertitik} />
        </div>
      )}
    </div>
  );
}
