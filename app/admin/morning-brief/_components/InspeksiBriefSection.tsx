"use client";

import { ClipboardCheck, TreePine, AlertTriangle } from "lucide-react";
import type { InspeksiJaringan } from "@/app/admin/monitoring-inspeksi/_hooks/useInspeksiJaringan";
import type { InspeksiPohon } from "@/app/admin/monitoring-inspeksi/_hooks/useInspeksiPohon";

// ── Inspeksi Jaringan ─────────────────────────────────────────────────────────

interface JaringanSectionProps {
  newTemuan: InspeksiJaringan[];
  selesai: InspeksiJaringan[];
  newTemuanBulanIni: number;
  selesaiBulanIni: number;
  monthLabel: string;
}

export function InspeksiJaringanBriefSection({
  newTemuan, selesai, newTemuanBulanIni, selesaiBulanIni, monthLabel,
}: JaringanSectionProps) {
  const totalKemarin = newTemuan.length + selesai.length;

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] print:bg-white print:border print:border-gray-300">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e3552] print:border-gray-300">
        <div className="bg-yellow-500/15 rounded-lg p-2 print:hidden">
          <ClipboardCheck size={16} className="text-yellow-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-[#e2e8f0] font-semibold print:text-black">Inspeksi Jaringan</h2>
          <p className="text-[#94a3b8] text-xs print:text-gray-500">Temuan baru & penyelesaian</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-[#1e3552] text-[#94a3b8] print:text-gray-500">
            {monthLabel}: <span className="font-bold text-[#e2e8f0] print:text-black">{newTemuanBulanIni} temuan</span>
            <span className="mx-1 opacity-50">·</span>
            <span className="font-bold text-[#e2e8f0] print:text-black">{selesaiBulanIni} selesai</span>
          </span>
          <span className="bg-yellow-500/15 text-yellow-400 text-sm font-bold px-3 py-1 rounded-full print:text-yellow-700">
            Kemarin: {totalKemarin}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {totalKemarin === 0 ? (
          <p className="text-[#94a3b8] text-sm text-center py-4">Tidak ada aktivitas inspeksi jaringan kemarin</p>
        ) : (
          <>
            {newTemuan.length > 0 && (
              <InspeksiTable label="Temuan Baru" labelColor="text-red-400" items={newTemuan} />
            )}
            {selesai.length > 0 && (
              <InspeksiTable label="Selesai Dikerjakan" labelColor="text-green-400" items={selesai} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Inspeksi Pohon ────────────────────────────────────────────────────────────

interface PohonSectionProps {
  newTemuan: InspeksiPohon[];
  selesai: InspeksiPohon[];
  sanggatUrgent: InspeksiPohon[];
  newTemuanBulanIni: number;
  selesaiBulanIni: number;
  monthLabel: string;
}

export function InspeksiPohonBriefSection({
  newTemuan, selesai, sanggatUrgent,
  newTemuanBulanIni, selesaiBulanIni, monthLabel,
}: PohonSectionProps) {
  const totalKemarin = newTemuan.length + selesai.length;

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] print:bg-white print:border print:border-gray-300">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e3552] print:border-gray-300">
        <div className="bg-green-500/15 rounded-lg p-2 print:hidden">
          <TreePine size={16} className="text-green-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-[#e2e8f0] font-semibold print:text-black">Inspeksi Pohon / Rabas</h2>
          <p className="text-[#94a3b8] text-xs print:text-gray-500">Temuan & rabas kemarin</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {sanggatUrgent.length > 0 && (
            <span className="bg-red-500/15 text-red-400 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 print:text-red-700">
              <AlertTriangle size={10} />{sanggatUrgent.length} urgent hari ini
            </span>
          )}
          <span className="text-xs px-2.5 py-1 rounded-full bg-[#1e3552] text-[#94a3b8] print:text-gray-500">
            {monthLabel}: <span className="font-bold text-[#e2e8f0] print:text-black">{newTemuanBulanIni} temuan</span>
            <span className="mx-1 opacity-50">·</span>
            <span className="font-bold text-[#e2e8f0] print:text-black">{selesaiBulanIni} selesai</span>
          </span>
          <span className="bg-green-500/15 text-green-400 text-sm font-bold px-3 py-1 rounded-full print:text-green-700">
            Kemarin: {totalKemarin}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Sangat urgent hari ini */}
        {sanggatUrgent.length > 0 && (
          <div>
            <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 print:text-red-700">
              <AlertTriangle size={11} />Sangat Urgent — Perlu Tindakan Hari Ini
            </p>
            <div className="space-y-1.5">
              {sanggatUrgent.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-start gap-2 bg-red-500/8 border border-red-500/15 rounded-lg px-3 py-2 print:border-red-200">
                  <span className="text-red-400 mt-0.5 shrink-0 print:text-red-700">⚠</span>
                  <div className="min-w-0">
                    <p className="text-[#e2e8f0] text-sm font-medium truncate print:text-black">
                      {r.penyulang ?? "-"} — {r.lokasi ?? "Lokasi tidak diketahui"}
                    </p>
                    <p className="text-[#94a3b8] text-xs print:text-gray-500">
                      {r.jenis_pohon ?? "Pohon"} · {r.ulp ?? "-"} · Status: {r.status}
                    </p>
                  </div>
                </div>
              ))}
              {sanggatUrgent.length > 8 && (
                <p className="text-[#94a3b8] text-xs text-center pt-1 print:text-gray-500">
                  +{sanggatUrgent.length - 8} lainnya
                </p>
              )}
            </div>
          </div>
        )}

        {totalKemarin === 0 && sanggatUrgent.length === 0 ? (
          <p className="text-[#94a3b8] text-sm text-center py-4">Tidak ada aktivitas inspeksi pohon kemarin</p>
        ) : (
          <>
            {newTemuan.length > 0 && (
              <PohonTable label="Temuan Baru" labelColor="text-red-400" items={newTemuan} />
            )}
            {selesai.length > 0 && (
              <PohonTable label="Selesai / Rabas Dikerjakan" labelColor="text-green-400" items={selesai} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function InspeksiTable({
  label, labelColor, items,
}: { label: string; labelColor: string; items: InspeksiJaringan[] }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${labelColor}`}>{label}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1e3552] print:border-gray-300">
            <th className="text-left py-1.5 pr-3 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Penyulang</th>
            <th className="text-left py-1.5 pr-3 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Lokasi</th>
            <th className="text-left py-1.5 pr-3 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Temuan</th>
            <th className="text-left py-1.5 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-b border-[#1e3552]/50 last:border-0 print:border-gray-200">
              <td className="py-2 pr-3 text-[#e2e8f0] font-medium text-xs print:text-black">{r.penyulang ?? "-"}</td>
              <td className="py-2 pr-3 text-[#94a3b8] text-xs print:text-gray-600">{r.lokasi ?? "-"}</td>
              <td className="py-2 pr-3 text-[#94a3b8] text-xs print:text-gray-600 max-w-50 truncate">
                {r.temuan ?? r.deskripsi ?? "-"}
              </td>
              <td className="py-2"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PohonTable({
  label, labelColor, items,
}: { label: string; labelColor: string; items: InspeksiPohon[] }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${labelColor}`}>{label}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1e3552] print:border-gray-300">
            <th className="text-left py-1.5 pr-3 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Penyulang</th>
            <th className="text-left py-1.5 pr-3 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Lokasi</th>
            <th className="text-left py-1.5 pr-3 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Jenis Pohon</th>
            <th className="text-left py-1.5 text-[#94a3b8] font-semibold text-xs print:text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-b border-[#1e3552]/50 last:border-0 print:border-gray-200">
              <td className="py-2 pr-3 text-[#e2e8f0] font-medium text-xs print:text-black">{r.penyulang ?? "-"}</td>
              <td className="py-2 pr-3 text-[#94a3b8] text-xs print:text-gray-600">{r.lokasi ?? "-"}</td>
              <td className="py-2 pr-3 text-[#94a3b8] text-xs print:text-gray-600">{r.jenis_pohon ?? "-"}</td>
              <td className="py-2"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  Temuan: "bg-red-500/15 text-red-400 print:text-red-700",
  "Perlu Tindakan": "bg-orange-500/15 text-orange-400 print:text-orange-700",
  Ditugaskan: "bg-blue-500/15 text-blue-400 print:text-blue-700",
  "Dalam Proses": "bg-yellow-500/15 text-yellow-400 print:text-yellow-700",
  Selesai: "bg-green-500/15 text-green-400 print:text-green-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status] ?? "bg-gray-500/15 text-gray-400"}`}>
      {status}
    </span>
  );
}
