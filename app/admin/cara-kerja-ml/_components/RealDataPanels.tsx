"use client";

import { useMemo, useState } from "react";
import { CloudRain, Target, Microscope, History } from "lucide-react";
import type { FeederRisk } from "@/app/admin/command-center/_hooks/useFeederRisk";

export interface WeatherRow {
  ulp: string;
  precip_mm: number | null;
  wind_max_kmh: number | null;
  thunder: boolean | null;
}
export interface EventRow {
  tgl_gangguan: string | null;
  penyulang: string | null;
  ulp: string | null;
  kode: string | null;
  arus_r: number | null;
  arus_s: number | null;
  arus_t: number | null;
  arus_n: number | null;
  penyebab: string | null;
  predicted_cause: string | null;
  cause_reason: string | null;
}

interface Props {
  riskData: FeederRisk[];
  weather: WeatherRow[];
  events: EventRow[];
  besok: string;
}

const LEVEL_COLOR: Record<string, string> = { kritis: "#ef4444", waspada: "#f59e0b", aman: "#10b981" };
const LEVEL_LABEL: Record<string, string> = { kritis: "KRITIS", waspada: "WASPADA", aman: "AMAN" };

const FITUR_LABEL: Record<string, string> = {
  precip_mm: "Curah hujan besok (mm)",
  wind_max_kmh: "Angin maks besok (km/jam)",
  thunder: "Petir besok",
  trip_30d: "Jumlah trip 30 hari",
  trip_90d: "Jumlah trip 90 hari",
  trip_365d: "Jumlah trip 365 hari",
  hari_sejak_trip: "Hari sejak trip terakhir",
  rate_hujan: "Rasio gangguan saat hujan",
  temuan_jaringan_terbuka: "Temuan jaringan terbuka",
  temuan_pohon_terbuka: "Temuan pohon terbuka",
  temuan_kritis_terbuka: "Temuan kritis terbuka",
  umur_temuan_tertua_hari: "Umur temuan tertua (hari)",
};

function fmtFitur(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (key === "thunder") return v ? "Ya" : "Tidak";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

function Badge({ level }: { level: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: LEVEL_COLOR[level] }}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

export default function RealDataPanels({ riskData, weather, events, besok }: Props) {
  const [sel, setSel] = useState<string>("");
  const selected = useMemo(
    () => riskData.find((r) => r.penyulang === sel) ?? riskData[0],
    [riskData, sel],
  );

  return (
    <div className="space-y-4">
      {/* 1. Cuaca prakiraan besok */}
      <Card icon={<CloudRain className="w-4 h-4 text-sky-500" />} title={`Cuaca Prakiraan Besok · ${besok}`} subtitle="Input cuaca yang dipakai mesin (per area ULP)">
        {weather.length === 0 ? (
          <Empty text="Belum ada data prakiraan cuaca untuk besok." />
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <Tr head>
                <Th>ULP</Th><Th right>Curah Hujan (mm)</Th><Th right>Angin (km/jam)</Th><Th center>Petir</Th>
              </Tr>
            </thead>
            <tbody>
              {weather.map((w) => (
                <Tr key={w.ulp}>
                  <Td><b>{w.ulp}</b></Td>
                  <Td right cls={(w.precip_mm ?? 0) > 10 ? "text-sky-600 font-semibold" : ""}>{w.precip_mm?.toFixed(1) ?? "—"}</Td>
                  <Td right cls={(w.wind_max_kmh ?? 0) > 30 ? "text-amber-600 font-semibold" : ""}>{w.wind_max_kmh?.toFixed(0) ?? "—"}</Td>
                  <Td center>{w.thunder ? "⛈️ Ya" : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 2. Hasil prediksi ML */}
      <Card icon={<Target className="w-4 h-4 text-[#00897B]" />} title="Hasil Prediksi ML — Skor Risiko Besok" subtitle={`${riskData.length} penyulang, urut paling berisiko`}>
        {riskData.length === 0 ? (
          <Empty text="Belum ada hasil prediksi. Jalankan pipeline ML dulu." />
        ) : (
          <div className="overflow-auto max-h-[45vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0">
                <Tr head>
                  <Th>#</Th><Th>Penyulang</Th><Th>ULP</Th><Th center>Skor</Th><Th center>Level</Th><Th>Dugaan Penyebab</Th><Th>Faktor Utama</Th>
                </Tr>
              </thead>
              <tbody>
                {riskData.map((r, i) => (
                  <Tr key={r.id}>
                    <Td cls="text-[#94a3b8] text-right">{i + 1}</Td>
                    <Td><b>{r.penyulang}</b></Td>
                    <Td>{r.ulp}</Td>
                    <Td center cls="font-mono font-bold" style={{ color: LEVEL_COLOR[r.risk_level] }}>{r.risk_score.toFixed(0)}</Td>
                    <Td center><Badge level={r.risk_level} /></Td>
                    <Td>{r.predicted_cause ?? "—"}</Td>
                    <Td cls="text-[#64748b]">{r.breakdown?.drivers?.[0]?.faktor ?? "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 3. Rincian fitur 1 penyulang */}
      <Card icon={<Microscope className="w-4 h-4 text-fuchsia-500" />} title="Rincian: Bagaimana Skor Satu Penyulang Terbentuk" subtitle="Angka mentah yang ditimbang mesin (transparan)">
        {riskData.length === 0 ? (
          <Empty text="Belum ada data." />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <label className="text-xs text-[#64748b]">Pilih penyulang:</label>
              <select value={selected?.penyulang ?? ""} onChange={(e) => setSel(e.target.value)}
                className="border border-[#E2E8F0] rounded-lg px-2 py-1 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B]">
                {riskData.map((r) => <option key={r.id} value={r.penyulang}>{r.penyulang} ({r.risk_score.toFixed(0)})</option>)}
              </select>
              {selected && (
                <span className="ml-auto flex items-center gap-2 text-sm">
                  Skor: <b className="text-lg" style={{ color: LEVEL_COLOR[selected.risk_level] }}>{selected.risk_score.toFixed(0)}</b>
                  <Badge level={selected.risk_level} />
                </span>
              )}
            </div>
            {selected && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(FITUR_LABEL).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg bg-[#F4F6F8] border border-[#E2E8F0] px-3 py-1.5">
                    <span className="text-[11px] text-[#64748b]">{label}</span>
                    <span className="text-xs font-bold text-[#1B2631]">{fmtFitur(key, selected.breakdown?.fitur?.[key])}</span>
                  </div>
                ))}
              </div>
            )}
            {selected?.breakdown?.drivers && selected.breakdown.drivers.length > 0 && (
              <p className="text-[11px] text-[#64748b] mt-3">
                → Faktor terbesar pembentuk skor:{" "}
                {selected.breakdown.drivers.map((d) => `${d.faktor} (${d.kontribusi}%)`).join(" · ")}
              </p>
            )}
          </>
        )}
      </Card>

      {/* 4. Data gangguan yang dipelajari */}
      <Card icon={<History className="w-4 h-4 text-rose-500" />} title="Contoh Data Gangguan yang Dipelajari" subtitle="Kejadian terbaru + tebakan penyebab Model B">
        {events.length === 0 ? (
          <Empty text="Belum ada data kejadian." />
        ) : (
          <div className="overflow-auto max-h-[40vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0">
                <Tr head><Th>Tanggal</Th><Th>Penyulang</Th><Th center>KODE</Th><Th right>Arus IR/IS/IT/IN</Th><Th>Penyebab (asli)</Th><Th>Tebakan Model B</Th><Th>Alasan Tebakan</Th></Tr>
              </thead>
              <tbody>
                {events.map((e, i) => {
                  const arus = [e.arus_r, e.arus_s, e.arus_t, e.arus_n].map((a) => (a == null ? "–" : Math.round(a))).join(" / ");
                  const isT = (e.kode ?? "").toUpperCase() === "T";
                  return (
                    <Tr key={i}>
                      <Td cls="whitespace-nowrap">{e.tgl_gangguan ?? "—"}</Td>
                      <Td><b>{e.penyulang ?? "—"}</b> <span className="text-[#94a3b8]">· {e.ulp ?? "—"}</span></Td>
                      <Td center>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isT ? "bg-amber-100 text-amber-700" : "bg-[#E0F2F1] text-[#00695C]"}`}>
                          {e.kode ?? "—"}
                        </span>
                      </Td>
                      <Td right cls="font-mono text-[11px] text-[#64748b] whitespace-nowrap">{arus}</Td>
                      <Td cls="text-[#64748b]">{e.penyebab || <span className="italic text-[#C7D2DA]">kosong</span>}</Td>
                      <Td>{e.predicted_cause ? <span className="text-fuchsia-600 font-semibold">{e.predicted_cause}</span> : <span className="text-[#C7D2DA]">—</span>}</Td>
                      <Td cls="text-[#64748b] max-w-[300px]">{e.cause_reason || (e.predicted_cause ? "—" : <span className="italic text-[#C7D2DA]">sudah diketahui (KODE)</span>)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── helper kecil ─────────────────────────────────────────────────────────────
function Card({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-[#1B2631] flex items-center gap-2">{icon}{title}</h2>
        <p className="text-[11px] text-[#94a3b8] mt-0.5 ml-6">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
function Tr({ children, head }: { children: React.ReactNode; head?: boolean }) {
  return <tr className={head ? "" : "border-t border-[#E2E8F0] hover:bg-[#F4F6F8]"}>{children}</tr>;
}
function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return <th className={`py-2 px-2 bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] whitespace-nowrap ${right ? "text-right" : center ? "text-center" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, center, cls, style }: { children: React.ReactNode; right?: boolean; center?: boolean; cls?: string; style?: React.CSSProperties }) {
  const align = right ? "text-right" : center ? "text-center" : "text-left";
  const hasColor = cls?.includes("text-") || style?.color != null;
  return <td className={`py-1.5 px-2 ${align} ${hasColor ? "" : "text-[#1B2631]"} ${cls ?? ""}`} style={style}>{children}</td>;
}
function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-[#94a3b8]">{text}</div>;
}
