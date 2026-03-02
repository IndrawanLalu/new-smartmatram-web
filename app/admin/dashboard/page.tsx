"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import DashboardGangguanPenyulang from "./_components/DashboardGangguanPenyulang";
import DiagramGangguanPenyulang from "./_components/DiagramGangguanPenyulang";
import Top10Gangguan from "./_components/Top10Gangguan";
import DiagramSumberGangguan from "./_components/DiagramSumberGangguan";
import TabelSegment from "./_components/TabelSegment";
import DiagramTemuan from "./_components/DiagramTemuan";

const toInputDate = (d: Date) => d.toISOString().split("T")[0];

export default function DashboardPage() {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), 0, 1); // 1 Jan tahun ini

  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [endDate, setEndDate] = useState<Date>(now);

  return (
    <div className="space-y-8">
      {/* ── Section 1: Dashboard Gangguan Penyulang ── */}
      <DashboardGangguanPenyulang />

      {/* ── Section 2: Analisis Gangguan Detail ── */}
      <section className="space-y-4">
        {/* Header + date range */}
        <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Analisis Gangguan — Detail</h2>
              <p className="text-teal-100 text-sm mt-0.5">
                Diagram dan statistik gangguan per periode yang dipilih
              </p>
            </div>

            {/* Native date range picker */}
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-4 py-2">
              <Calendar size={15} className="text-teal-200 shrink-0" />
              <input
                type="date"
                value={toInputDate(startDate)}
                onChange={(e) => {
                  if (e.target.value) setStartDate(new Date(e.target.value));
                }}
                className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
              />
              <span className="text-teal-300 text-sm">–</span>
              <input
                type="date"
                value={toInputDate(endDate)}
                onChange={(e) => {
                  if (e.target.value) setEndDate(new Date(e.target.value));
                }}
                className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 3-column chart grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend Gangguan per Tahun */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0]">
            <DiagramGangguanPenyulang />
          </div>

          {/* Top 10 Penyulang */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0]">
            <Top10Gangguan startDate={startDate} endDate={endDate} />
          </div>

          {/* Sumber Gangguan */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0]">
            <DiagramSumberGangguan startDate={startDate} endDate={endDate} />
          </div>
        </div>
      </section>

      {/* ── Section 3: Data Inspeksi & Segmen ── */}
      <section className="space-y-4">
        <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-5">
          <h2 className="text-xl font-bold">Data Inspeksi & Segmen Jaringan</h2>
          <p className="text-teal-100 text-sm mt-0.5">
            Progres inspeksi, perabasan, dan temuan per periode
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tabel Segment — 2/3 width */}
          <div className="lg:col-span-2">
            <TabelSegment />
          </div>

          {/* Diagram Temuan — 1/3 width */}
          <div>
            <DiagramTemuan startDate={startDate} endDate={endDate} />
          </div>
        </div>
      </section>
    </div>
  );
}
