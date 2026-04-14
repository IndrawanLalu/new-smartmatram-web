"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, RefreshCw, Copy, Presentation, Maximize, Minimize, Printer, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { useScoreboard } from "./_hooks/useScoreboard";
import LMCard from "./_components/LMCard";
import AddLMModal from "./_components/AddLMModal";
import DuplicateModal from "./_components/DuplicateModal";
import GangguanDetailSection from "./_components/GangguanDetailSection";

// ── Constants ─────────────────────────────────────────────────────────────────

const BULAN_NAMA = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const now = new Date();
const DEFAULT_BULAN = now.getMonth() + 1;
const DEFAULT_TAHUN = now.getFullYear();

const PRINT_STYLE = `
@media print {
  @page { margin: 1cm; size: A4 landscape; }
  body { background: white !important; font-size: 9px; }
  [data-sidebar], .print-hidden { display: none !important; }
}
`;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScoreboardPage() {
  const user = useCurrentUser();
  const isUp3 = canSeeAllUnits(user.role);
  const contentRef = useRef<HTMLDivElement>(null);

  const [bulan, setBulan] = useState(DEFAULT_BULAN);
  const [tahun, setTahun] = useState(DEFAULT_TAHUN);
  const [ulp, setUlp] = useState<string>(isUp3 ? "AMPENAN" : (user.unit ?? "AMPENAN"));
  const [showAddLM, setShowAddLM] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  const { data, loading, error, refresh, addLM, deleteLM, addItem, deleteItem,
    updateRealisasi, updateKomitmen, updateLM, updateItemMeta, updateTarget, duplicateToMonth } =
    useScoreboard(bulan, tahun, ulp);

  const totalSlides = 1 + data.length; // slide 0 = gangguan, slide 1..N = LM

  // Track fullscreen state
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Reset slide when entering present mode
  useEffect(() => {
    if (presentMode) setSlideIndex(0);
  }, [presentMode]);

  // Keyboard navigation
  useEffect(() => {
    if (!presentMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setSlideIndex((i) => Math.min(i + 1, totalSlides - 1));
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSlideIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [presentMode, totalSlides]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      contentRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const exitPresent = () => {
    setPresentMode(false);
    if (document.fullscreenElement) document.exitFullscreen();
  };

  const bulanLabel = `${BULAN_NAMA[bulan - 1]} ${tahun}`;

  // ── PLN Slide Header (shared across LM slides) ────────────────────────────
  const SlideHeader = () => (
    <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl px-8 py-4 flex items-center justify-between">
      <img src="/logo-danantara.png" alt="Danantara" className="h-12 w-auto object-contain" />
      <div className="text-center">
        <p className="text-white font-bold text-2xl tracking-wide">SCORE BOARD</p>
        <p className="text-white/80 text-sm mt-0.5">{bulanLabel} · ULP {ulp}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-white/60 text-xs uppercase tracking-widest">PLN UP3 Mataram</p>
          <p className="text-white font-bold text-sm">ULP {ulp}</p>
        </div>
        <img src="/logo-pln.png" alt="PLN" className="h-12 w-auto object-contain" />
      </div>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* Floating Presentation Toolbar */}
      {presentMode && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-[#004D40] rounded-2xl px-4 py-2.5 shadow-2xl print-hidden">
          {/* Prev */}
          <button
            onClick={() => setSlideIndex((i) => Math.max(i - 1, 0))}
            disabled={slideIndex === 0}
            className="text-white/70 hover:text-white disabled:text-white/20 p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:cursor-not-allowed"
            title="Slide sebelumnya (←)"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Slide counter */}
          <span className="text-white text-sm font-semibold px-2 min-w-16 text-center">
            {slideIndex + 1} / {totalSlides}
          </span>

          {/* Next */}
          <button
            onClick={() => setSlideIndex((i) => Math.min(i + 1, totalSlides - 1))}
            disabled={slideIndex === totalSlides - 1}
            className="text-white/70 hover:text-white disabled:text-white/20 p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:cursor-not-allowed"
            title="Slide berikutnya (→)"
          >
            <ChevronRight size={18} />
          </button>

          <div className="w-px h-4 bg-white/20 mx-1" />

          {/* Slide dots */}
          <div className="flex items-center gap-1 px-1">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIndex(i)}
                className={`rounded-full transition-all ${i === slideIndex ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/30 hover:bg-white/60"}`}
              />
            ))}
          </div>

          <div className="w-px h-4 bg-white/20 mx-1" />

          <button
            onClick={toggleFullscreen}
            className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={isFullscreen ? "Keluar Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
          <button
            onClick={() => window.print()}
            className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Print / Export PDF"
          >
            <Printer size={15} />
          </button>

          <div className="w-px h-4 bg-white/20 mx-1" />

          <button
            onClick={exitPresent}
            className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Keluar Mode Presentasi"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── PRESENTATION MODE — SLIDE VIEW ─────────────────────────────────── */}
      {presentMode && (
        <div ref={contentRef} className="bg-[#F4F6F8] min-h-screen overflow-y-auto p-5">
          {/* Slide 0: Gangguan Penyulang */}
          {slideIndex === 0 && (
            <GangguanDetailSection
              bulan={bulan}
              tahun={tahun}
              ulp={ulp}
              bulanLabel={bulanLabel}
              presentMode
            />
          )}

          {/* Slides 1..N: Lead Measures */}
          {slideIndex > 0 && data[slideIndex - 1] && (
            <div className="space-y-4">
              <SlideHeader />
              <LMCard
                lm={data[slideIndex - 1]}
                index={slideIndex - 1}
                presentMode
                onDeleteLM={deleteLM}
                onUpdateLM={updateLM}
                onAddItem={addItem}
                onDeleteItem={deleteItem}
                onUpdateItemMeta={updateItemMeta}
                onUpdateRealisasi={updateRealisasi}
                onUpdateTarget={updateTarget}
                onUpdateKomitmen={updateKomitmen}
              />
            </div>
          )}

          {/* Bottom padding so content isn't hidden behind toolbar */}
          <div className="h-20" />
        </div>
      )}

      {/* ── NORMAL MODE ────────────────────────────────────────────────────── */}
      {!presentMode && (
        <div className="space-y-5">
          {/* Page Header */}
          <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Score Board — Lead Measures</h1>
              <p className="text-white/70 text-sm mt-1">{bulanLabel} · {ulp}</p>
            </div>
            <button
              onClick={() => setPresentMode(true)}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Presentation size={16} /> Mode Presentasi
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-white"
            >
              {BULAN_NAMA.map((b, i) => (
                <option key={i + 1} value={i + 1}>{b}</option>
              ))}
            </select>

            <input
              type="number"
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
              className="w-24 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-white"
            />

            {isUp3 && (
              <select
                value={ulp}
                onChange={(e) => setUlp(e.target.value)}
                className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-white"
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            )}

            <button
              onClick={refresh}
              className="p-2 border border-[#E2E8F0] rounded-lg text-[#5D6D7E] hover:text-[#00897B] hover:border-[#00897B] transition-colors bg-white"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>

            <div className="ml-auto flex items-center gap-2">
              {data.length > 0 && (
                <button
                  onClick={() => setShowDuplicate(true)}
                  className="flex items-center gap-2 border border-[#00897B] text-[#00897B] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#00897B]/5 transition-colors bg-white"
                >
                  <Copy size={15} /> Salin ke Bulan Lain
                </button>
              )}
              <button
                onClick={() => setShowAddLM(true)}
                className="flex items-center gap-2 bg-linear-to-r from-[#004D40] to-[#00897B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus size={16} /> Tambah Lead Measure
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
              <p className="font-semibold">Gagal memuat data</p>
              <p className="text-red-500 mt-0.5">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && data.length === 0 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] border-dashed py-16 flex flex-col items-center gap-3 text-center">
              <p className="text-[#5D6D7E] font-medium">Belum ada Lead Measure</p>
              <p className="text-sm text-gray-400">untuk {bulanLabel} · {ulp}</p>
              <button
                onClick={() => setShowAddLM(true)}
                className="mt-2 flex items-center gap-2 bg-linear-to-r from-[#004D40] to-[#00897B] text-white px-5 py-2.5 rounded-lg text-sm font-medium"
              >
                <Plus size={16} /> Tambah Lead Measure Pertama
              </button>
            </div>
          )}

          {/* Rekap Gangguan */}
          <GangguanDetailSection
            bulan={bulan}
            tahun={tahun}
            ulp={ulp}
            bulanLabel={bulanLabel}
          />

          {/* LM Cards */}
          {!loading && data.length > 0 && (
            <div className="space-y-4">
              {data.map((lm, idx) => (
                <LMCard
                  key={lm.id}
                  lm={lm}
                  index={idx}
                  onDeleteLM={deleteLM}
                  onUpdateLM={updateLM}
                  onAddItem={addItem}
                  onDeleteItem={deleteItem}
                  onUpdateItemMeta={updateItemMeta}
                  onUpdateRealisasi={updateRealisasi}
                  onUpdateTarget={updateTarget}
                  onUpdateKomitmen={updateKomitmen}
                />
              ))}
            </div>
          )}

          {showAddLM && (
            <AddLMModal onClose={() => setShowAddLM(false)} onSave={addLM} />
          )}

          {showDuplicate && (
            <DuplicateModal
              fromBulan={bulan}
              fromTahun={tahun}
              totalLM={data.length}
              onClose={() => setShowDuplicate(false)}
              onDuplicate={duplicateToMonth}
            />
          )}
        </div>
      )}
    </>
  );
}
