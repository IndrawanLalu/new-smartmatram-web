"use client";

import { useState } from "react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { FIELD, EYEBROW, CARD } from "@/app/admin/_ui";
import { useAnomalySettings } from "@/app/admin/_hooks/useAnomalySettings";
import TabelMasterGardu from "./_components/TabelMasterGardu";

/**
 * Master Gardu — daftar aset gardu, satu-satunya.
 *
 * Dulu tab di dalam halaman Pengukuran Gardu. Tempatnya keliru: master gardu
 * dipakai pengukuran, inspeksi JTR, pemeliharaan gardu, dan nanti optimasi
 * trafo. Selama dia jadi anak topik salah satu modul, modul berikutnya akan
 * membangun daftar gardunya sendiri — dan empat daftar gardu yang berbeda isi
 * adalah persis penyakit spreadsheet yang sedang kita berantas.
 */
export default function MasterGarduPage() {
  const user = useCurrentUser();
  const [ulp, setUlp] = useState("");

  const unit = canSeeAllUnits(user.role) ? ulp : (user.unit ?? "");
  // Ambang anomali disetel per ULP, jadi ikut berubah saat ULP-nya diganti.
  const { settings } = useAnomalySettings(unit);

  return (
    <div className="text-ink flex flex-col gap-4">
      {canSeeAllUnits(user.role) && (
        <div className={`${CARD} p-4 flex flex-wrap items-end gap-3`}>
          <div>
            <label className={EYEBROW}>ULP</label>
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
        </div>
      )}

      <TabelMasterGardu user={user} ulp={unit} settings={settings} />
    </div>
  );
}
