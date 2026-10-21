"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import { PilihUlp } from "@/app/admin/_kit/Saringan";
import { BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { LABEL_ALASAN, NADA_STATUS_SURVEY, STATUS_SURVEY, type StatusSurvey } from "@/lib/surveyJaringan";
import RincianSurvey from "./_components/RincianSurvey";
import { useSurveyJaringan } from "./_hooks/useSurveyJaringan";

/**
 * Survey Jaringan Baru (S1, 21 Okt 2026) — daftar rencana jaringan JTM yang
 * digambar di peta. Jaringan survey belum menjadi aset sampai dioperasikan
 * (S2). Rencana: rencana-jaringan-baru.md.
 */

const PAGE = 20;
const TH = "px-3 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap";
const kms = (m: number) => (m / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 });

export default function SurveyJaringanPage() {
  const user = useCurrentUser();
  const semuaUnit = canSeeAllUnits(user.role);
  const boleh = user.role === "UP3" || user.role === "admin";
  const oleh = user.name ?? user.email ?? "";
  const [ulp, setUlp] = useState(semuaUnit ? "SEMUA" : (user.unit ?? ""));
  const st = useSurveyJaringan(ulp === "SEMUA" ? "" : ulp);
  const [status, setStatus] = useState<StatusSurvey | "semua">("semua");
  const [cari, setCari] = useState("");
  const [hal, setHal] = useState(1);
  const [buka, setBuka] = useState<string | null>(null);

  const cacah = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of st.survey) c.set(s.status, (c.get(s.status) ?? 0) + 1);
    return c;
  }, [st.survey]);
  const tampil = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return st.survey.filter(
      (s) => (status === "semua" || s.status === status) && (!q || [s.judul, s.penyulang ?? ""].some((v) => v.toUpperCase().includes(q))),
    );
  }, [st.survey, status, cari]);
  const halaman = Math.max(1, Math.ceil(tampil.length / PAGE));
  const isi = tampil.slice((hal - 1) * PAGE, hal * PAGE);
  const terbuka = st.survey.find((s) => s.id === buka);
  const ganti = <T,>(f: (v: T) => void) => (v: T) => { f(v); setHal(1); };

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiTopbar>
        <PilihUlp nilai={ulp} onUbah={ganti(setUlp)} daftar={semuaUnit ? ["SEMUA", ...UNITS.map((u) => u.value)] : [ulp]} />
      </IsiTopbar>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-line space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[...STATUS_SURVEY, "semua" as const].map((k) => (
                <button key={k} onClick={() => ganti(setStatus)(k)} className={`${CHIP} ${status === k ? CHIP_ON : CHIP_OFF}`}>
                  {k === "semua" ? "Semua" : k}
                  <span className={`tabular-nums ${status === k ? "text-white/70" : "text-ink-muted"}`}>
                    {k === "semua" ? st.survey.length : (cacah.get(k) ?? 0)}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative w-64 ml-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input value={cari} onChange={(e) => ganti(setCari)(e.target.value)} placeholder="Cari judul atau penyulang…" className={`${FIELD} w-full pl-8`} />
            </div>
            {boleh && (
              <a href="/peta?survey=baru" target="_blank" rel="noopener" className={BTN_PRIMARY}>
                <Plus size={14} /> Survey baru di peta
              </a>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            Jaringan baru digambar di peta (sambung ke tiang JTM yang ada, lalu titik tiang baru). Belum menjadi aset — tidak ikut KMS,
            rekap, maupun inspeksi sampai dioperasikan.
          </p>
        </div>

        {st.memuat ? (
          <p className="py-16 flex items-center justify-center gap-2 text-sm text-ink-soft"><Loader2 size={15} className="animate-spin" /> Memuat…</p>
        ) : st.galat ? (
          <p className="px-5 py-10 text-center text-sm text-red-600">{st.galat}</p>
        ) : tampil.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-soft">Belum ada survey{status !== "semua" ? ` berstatus ${status}` : ""}.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="kepala-kit">
                  <tr className="bg-navy-50 text-left">
                    <th className={TH}>Survey</th>
                    <th className={TH}>Penyulang</th>
                    <th className={`${TH} text-right`}>Tiang baru</th>
                    <th className={`${TH} text-right`}>Panjang (kms)</th>
                    <th className={`${TH} text-right`}>Gardu baru</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Diubah</th>
                  </tr>
                </thead>
                <tbody>
                  {isi.map((s) => (
                    <tr key={s.id} onClick={() => setBuka(s.id)} className="border-t border-line align-top cursor-pointer hover:bg-navy-50/50">
                      <td className="px-3 py-2.5 min-w-64">
                        <span className="block font-semibold text-ink">{s.judul}</span>
                        <span className="block text-[11px] text-ink-muted">{LABEL_ALASAN[s.alasan]} · ULP {s.ulp}</span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">{s.penyulang ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.jumlah_tiang}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{kms(s.panjang_m)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.jumlah_gardu ? `${s.jumlah_gardu} (${s.gardu_kva} kVA)` : "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${NADA_STATUS_SURVEY[s.status]}`}>{s.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink-soft whitespace-nowrap">
                        <span className="block">{s.diubah_oleh ?? s.dibuat_oleh ?? "-"}</span>
                        <span className="block text-ink-muted">{s.diubah_at.slice(0, 10)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-3">
              <p className="text-xs text-ink-soft">{tampil.length} survey</p>
              {halaman > 1 && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-ink-soft">{hal}/{halaman}</span>
                  <button onClick={() => setHal((p) => Math.max(1, p - 1))} disabled={hal === 1} className="w-8 h-8 grid place-items-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setHal((p) => Math.min(halaman, p + 1))} disabled={hal === halaman} className="w-8 h-8 grid place-items-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40">
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {terbuka && <RincianSurvey key={terbuka.id + terbuka.status} s={terbuka} boleh={boleh} oleh={oleh} st={st} onTutup={() => setBuka(null)} />}
    </div>
  );
}
