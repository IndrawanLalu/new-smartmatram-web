"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Gauge, Info, Clock, AlertTriangle } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFeederRisk } from "@/app/admin/command-center/_hooks/useFeederRisk";
import EngineFlowAnimation from "./_components/EngineFlowAnimation";
import RealDataPanels, { type WeatherRow, type EventRow } from "./_components/RealDataPanels";
import ModelBStatus, { type MlbStatus, type F1Point } from "./_components/ModelBStatus";

interface Overview {
  events: number | null;
  weather: number | null;
  inspeksiJaringan: number | null;
  inspeksiPohon: number | null;
  padam: number | null;
  penyulang: number | null;
}

interface RunLog {
  status: string;
  rows_scored: number | null;
  message: string | null;
  created_at: string;
}

function saranDari(faktor: string): string {
  const f = faktor.toLowerCase();
  if (f.includes("pohon")) return "Prioritaskan rabas/perabasan pohon di jalur ini.";
  if (f.includes("hujan") || f.includes("angin") || f.includes("petir") || f.includes("cuaca"))
    return "Siagakan tim & PDKB menjelang cuaca buruk besok.";
  if (f.includes("trip") || f.includes("rawan")) return "Penyulang sering bermasalah — inspeksi menyeluruh & evaluasi proteksi.";
  if (f.includes("kritis") || f.includes("umur")) return "Selesaikan temuan terbuka yang sudah menumpuk.";
  return "Lakukan inspeksi prioritas pada penyulang ini.";
}

const LEVEL_LABEL: Record<string, string> = { kritis: "KRITIS", waspada: "WASPADA", aman: "AMAN" };
const LEVEL_COLOR: Record<string, string> = { kritis: "#ef4444", waspada: "#f59e0b", aman: "#10b981" };

export default function CaraKerjaMlPage() {
  const user = useCurrentUser();
  const { riskData, dateTgl, criticalCount, waspCount, loading } = useFeederRisk(user);
  const [ov, setOv] = useState<Overview>({ events: null, weather: null, inspeksiJaringan: null, inspeksiPohon: null, padam: null, penyulang: null });
  const [run, setRun] = useState<RunLog | null>(null);
  const [weather, setWeather] = useState<WeatherRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [mlb, setMlb] = useState<MlbStatus | null>(null);
  const [mlbTrend, setMlbTrend] = useState<F1Point[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const head = { count: "exact" as const, head: true };
        const [ev, we, i1, i2, pd, py, rl] = await Promise.all([
          supabaseBrowser.from("ml_outage_events").select("*", head),
          supabaseBrowser.from("weather_daily").select("*", head),
          supabaseBrowser.from("inspeksi").select("*", head),
          supabaseBrowser.from("inspeksi_pohon").select("*", head),
          supabaseBrowser.from("padam_apkt").select("*", head),
          supabaseBrowser.from("penyulang_ref").select("*", head),
          supabaseBrowser.from("ml_run_log").select("status, rows_scored, message, created_at").order("created_at", { ascending: false }).limit(1),
        ]);
        setOv({
          events: ev.count,
          weather: we.count,
          inspeksiJaringan: i1.count,
          inspeksiPohon: i2.count,
          padam: pd.count,
          penyulang: py.count,
        });
        setRun((rl.data?.[0] as RunLog) ?? null);

        const { data: ev2 } = await supabaseBrowser
          .from("ml_outage_events")
          .select("tgl_gangguan, penyulang, ulp, kode, arus_r, arus_s, arus_t, arus_n, penyebab, predicted_cause, cause_reason")
          .order("tgl_gangguan", { ascending: false })
          .limit(15);
        setEvents((ev2 as EventRow[]) ?? []);

        const { data: pc } = await supabaseBrowser
          .from("ml_run_log")
          .select("message, created_at")
          .eq("job", "predict_cause")
          .order("created_at", { ascending: false })
          .limit(20);
        let latest: MlbStatus | null = null;
        const pts: F1Point[] = [];
        for (const row of (pc ?? []) as { message: string; created_at: string }[]) {
          try {
            const m = JSON.parse(row.message) as MlbStatus;
            if (!latest) latest = m;
            if (m.f1 != null) {
              pts.push({ label: new Date(row.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }), f1: m.f1 });
            }
          } catch { /* run lama format str(), lewati */ }
        }
        setMlb(latest);
        setMlbTrend(pts.reverse()); // kronologis (lama → baru)
      } catch { /* tabel mungkin belum ada */ }
    })();
  }, []);

  // Cuaca prakiraan untuk H+1 (butuh dateTgl dari prediksi) + map loc_key → ULP.
  useEffect(() => {
    if (!dateTgl) return;
    (async () => {
      try {
        const [wRes, pRes] = await Promise.all([
          supabaseBrowser.from("weather_daily").select("loc_key, precip_mm, wind_max_kmh, thunder").eq("tgl", dateTgl),
          supabaseBrowser.from("penyulang_ref").select("ulp, lat, lng"),
        ]);
        const locToUlp = new Map<string, string>();
        for (const p of (pRes.data ?? []) as { ulp: string; lat: number; lng: number }[]) {
          if (p.lat != null && p.lng != null) locToUlp.set(`${Number(p.lat).toFixed(3)},${Number(p.lng).toFixed(3)}`, p.ulp);
        }
        const byUlp = new Map<string, WeatherRow>();
        for (const w of (wRes.data ?? []) as { loc_key: string; precip_mm: number | null; wind_max_kmh: number | null; thunder: boolean | null }[]) {
          const ulp = locToUlp.get(w.loc_key) ?? w.loc_key;
          if (!byUlp.has(ulp)) byUlp.set(ulp, { ulp, precip_mm: w.precip_mm, wind_max_kmh: w.wind_max_kmh, thunder: w.thunder });
        }
        setWeather([...byUlp.values()].sort((a, b) => a.ulp.localeCompare(b.ulp)));
      } catch { /* abaikan */ }
    })();
  }, [dateTgl]);

  const top = riskData[0];
  const amanCount = Math.max(0, riskData.length - criticalCount - waspCount);
  const besok = dateTgl
    ? new Date(dateTgl + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })
    : "—";

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 space-y-5">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg shrink-0"><BrainCircuit className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-bold">Cara Kerja Engine ML</h1>
            <p className="text-sm text-white/80 mt-0.5">
              Bagaimana sistem memprediksi penyulang yang berisiko gangguan — dijelaskan sederhana.
            </p>
          </div>
        </div>
      </div>

      {/* A. Alur (animasi) */}
      <EngineFlowAnimation
        counts={{
          gangguan: ov.events,
          cuaca: ov.weather,
          inspeksiJaringan: ov.inspeksiJaringan,
          inspeksiPohon: ov.inspeksiPohon,
          padam: ov.padam,
          penyulang: ov.penyulang,
        }}
        besok={besok}
        kritis={criticalCount}
        waspada={waspCount}
        aman={amanCount}
        total={riskData.length}
        top={top ?? null}
      />

      {/* Status pembelajaran Model B */}
      <ModelBStatus data={mlb} trend={mlbTrend} />

      {/* Panel data nyata */}
      <RealDataPanels riskData={riskData} weather={weather} events={events} besok={besok} />

      {/* B. Status mesin */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 flex items-center gap-3 flex-wrap">
        <Clock className="w-5 h-5 text-[#00897B] shrink-0" />
        {run ? (
          <p className="text-sm text-[#1B2631]">
            <span className="font-semibold">Mesin terakhir dijalankan:</span>{" "}
            {new Date(run.created_at).toLocaleString("id-ID", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            <span className={run.status === "ok" ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
              {run.status === "ok" ? "Berhasil ✓" : "Gagal"}
            </span>
            {ov.events != null && <> · {ov.events.toLocaleString("id-ID")} kejadian dianalisis</>}
            {riskData.length > 0 && <> · {riskData.length} penyulang dinilai</>}
          </p>
        ) : (
          <p className="text-sm text-[#64748b]">Belum ada catatan jalannya mesin. Jalankan pipeline dulu.</p>
        )}
      </div>

      {/* C. Contoh dibaca jadi cerita */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
        <h2 className="text-sm font-bold text-[#1B2631] mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-[#00897B]" /> Contoh: membaca satu hasil
        </h2>
        {loading ? (
          <p className="text-sm text-[#94a3b8]">Memuat…</p>
        ) : !top ? (
          <p className="text-sm text-[#94a3b8]">Belum ada data prediksi. Jalankan pipeline ML dulu.</p>
        ) : (
          <div className="grid md:grid-cols-[auto_1fr] gap-5 items-center">
            {/* skor besar */}
            <div className="text-center px-4">
              <div className="text-5xl font-bold" style={{ color: LEVEL_COLOR[top.risk_level] }}>{top.risk_score.toFixed(0)}</div>
              <div className="text-xs font-bold tracking-wider mt-1" style={{ color: LEVEL_COLOR[top.risk_level] }}>
                {LEVEL_LABEL[top.risk_level]}
              </div>
              <div className="text-sm font-semibold text-[#1B2631] mt-1">{top.penyulang}</div>
              <div className="text-[11px] text-[#94a3b8]">{top.ulp}</div>
            </div>
            {/* alasan */}
            <div>
              <p className="text-xs text-[#64748b] mb-2">Kenapa skornya segini? Faktor terbesar:</p>
              <div className="space-y-1.5">
                {(top.breakdown?.drivers ?? []).map((d) => (
                  <div key={d.faktor} className="flex items-center gap-2">
                    <span className="w-44 text-[12px] text-[#1B2631] shrink-0">{d.faktor}</span>
                    <div className="flex-1 h-2 bg-[#F4F6F8] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#00897B]" style={{ width: `${d.kontribusi}%` }} />
                    </div>
                    <span className="w-10 text-right text-[11px] font-mono text-[#64748b]">{d.kontribusi}%</span>
                  </div>
                ))}
              </div>
              {top.predicted_cause && (
                <p className="text-xs text-[#64748b] mt-3">Dugaan penyebab: <b className="text-[#1B2631]">{top.predicted_cause}</b></p>
              )}
              {top.breakdown?.drivers?.[0] && (
                <p className="mt-2 text-sm bg-[#E0F2F1] text-[#00695C] rounded-lg px-3 py-2">
                  💡 <b>Saran:</b> {saranDari(top.breakdown.drivers[0].faktor)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* D. Cara baca skor */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
        <h2 className="text-sm font-bold text-[#1B2631] mb-3 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[#00897B]" /> Cara membaca skor (0–100)
        </h2>
        <div className="flex h-7 rounded-lg overflow-hidden text-[11px] font-semibold text-white">
          <div className="bg-emerald-500 flex items-center justify-center" style={{ width: "40%" }}>Aman (0–40)</div>
          <div className="bg-amber-500 flex items-center justify-center" style={{ width: "35%" }}>Waspada (40–75)</div>
          <div className="bg-red-500 flex items-center justify-center" style={{ width: "25%" }}>Kritis (&gt;75)</div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-3 text-xs">
          <Zone color="#10b981" title="Aman" desc="Risiko rendah. Pantau normal." />
          <Zone color="#f59e0b" title="Waspada" desc="Perlu perhatian. Cek temuan/jadwalkan inspeksi." />
          <Zone color="#ef4444" title="Kritis" desc="Risiko tinggi besok. Siagakan tim & tindak prioritas." />
        </div>
      </div>

      {/* E. Catatan jujur */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Catatan penting</p>
          <p className="text-xs mt-1 text-amber-700 leading-relaxed">
            Skor ini adalah <b>peringatan dini berbasis pola</b>, bukan kepastian akan terjadi gangguan. Tujuannya membantu
            memprioritaskan perhatian & sumber daya. Akurasi akan terus meningkat seiring bertambahnya data inspeksi & gangguan.
            Saat ini mesin memakai metode transparan (rule-based) yang akan naik kelas ke pembelajaran mesin penuh (XGBoost) ketika data cukup.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-komponen ────────────────────────────────────────────────────────────────

function Zone({ color, title, desc }: { color: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
      <div>
        <p className="font-semibold text-[#1B2631]">{title}</p>
        <p className="text-[#64748b]">{desc}</p>
      </div>
    </div>
  );
}
