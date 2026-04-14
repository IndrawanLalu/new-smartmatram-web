"use client";

import { useState } from "react";
import { Plus, Download, Pencil, Trash2 } from "lucide-react";
import { useGangguanDetail } from "../_hooks/useGangguanDetail";
import type { GangguanDetail } from "../_hooks/useGangguanDetail";
import GangguanDetailModal from "./GangguanDetailModal";
import ImportSheetsModal from "./ImportSheetsModal";

interface GangguanDetailSectionProps {
  bulan: number;
  tahun: number;
  ulp: string;
  bulanLabel: string;
  presentMode?: boolean;
}

const TH = "px-3 py-2 text-xs font-semibold text-white text-center whitespace-nowrap";
const TD = "px-3 py-2 text-xs text-[#1B2631] align-top";
const TDC = `${TD} text-center`;

export default function GangguanDetailSection({ bulan, tahun, ulp, bulanLabel, presentMode }: GangguanDetailSectionProps) {
  const { data, loading, addItem, bulkAdd, updateItem, deleteItem } = useGangguanDetail(bulan, tahun, ulp);

  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState<GangguanDetail | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
      {/* Section Header */}
      {presentMode ? (
        <div className="bg-[#004D40] px-6 py-4 flex items-center justify-between">
          <img src="/logo-danantara.png" alt="Danantara" className="h-10 w-auto object-contain" />
          <div className="text-center">
            <p className="text-white font-bold text-xl tracking-wide">REKAP GANGGUAN PENYULANG</p>
            <p className="text-white/70 text-sm mt-0.5">SAIDI &amp; SAIFI — {bulanLabel} · ULP {ulp}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-white/60 text-xs uppercase tracking-widest">PLN UP3 Mataram</p>
              <p className="text-white font-bold text-sm">ULP {ulp}</p>
            </div>
            <img src="/logo-pln.png" alt="PLN" className="h-10 w-auto object-contain" />
          </div>
        </div>
      ) : (
        <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Rekap Detail</p>
            <h2 className="text-white font-bold text-base leading-tight">
              Gangguan Penyulang — {bulanLabel} · {ulp}
            </h2>
          </div>
          <div className="flex items-center gap-2 print-hidden">
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
              <Download size={13} /> Import Sheets
            </button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
              <Plus size={13} /> Tambah Manual
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="py-10 text-center text-sm text-[#5D6D7E]">
          <p>Belum ada data gangguan.</p>
          <p className="text-xs text-gray-400 mt-1">Klik "Import Sheets" untuk menarik data dari Google Sheets, atau "Tambah Manual".</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#00695C]">
                <th className={`${TH} w-8`}>No</th>
                <th className={`${TH} text-left`}>Titik Gangguan</th>
                <th className={TH}>Tgl</th>
                <th className={TH}>Jam Padam</th>
                <th className={TH}>Durasi</th>
                <th className={TH}>Jml Plgn</th>
                <th className={TH}>Jml×Plgn Padam</th>
                <th className={`${TH} text-left min-w-40`}>Penyebab</th>
                <th className={`${TH} text-left min-w-45`}>Pain Point</th>
                <th className={`${TH} text-left min-w-45`}>Lesson Learned</th>
                <th className={`${TH} text-left min-w-45`}>Tindak Lanjut</th>
                {!presentMode && <th className={`${TH} w-16 print-hidden`}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={row.id} className={`border-t border-[#E2E8F0] ${idx % 2 === 0 ? "bg-white" : "bg-[#f0faf9]"}`}>
                  <td className={`${TDC} font-semibold text-[#00695C]`}>{idx + 1}</td>
                  <td className={`${TD} font-medium`}>{row.titik_gangguan}</td>
                  <td className={TDC}>{row.tgl_gangguan}</td>
                  <td className={TDC}>{row.jam_padam}</td>
                  <td className={TDC}>{row.durasi}</td>
                  <td className={TDC}>{row.jml_plgn > 0 ? row.jml_plgn.toLocaleString() : "—"}</td>
                  <td className={TDC}>{row.jml_x_plgn_padam > 0 ? Number(row.jml_x_plgn_padam).toLocaleString() : "—"}</td>
                  <td className={TD}><pre className="whitespace-pre-wrap font-sans text-xs">{row.penyebab || "—"}</pre></td>
                  <td className={TD}><pre className="whitespace-pre-wrap font-sans text-xs">{row.pain_point || "—"}</pre></td>
                  <td className={TD}><pre className="whitespace-pre-wrap font-sans text-xs">{row.lesson_learned || "—"}</pre></td>
                  <td className={TD}><pre className="whitespace-pre-wrap font-sans text-xs">{row.tindak_lanjut || "—"}</pre></td>
                  {!presentMode && (
                    <td className={`${TDC} print-hidden`}>
                      {confirmDeleteId === row.id ? (
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-xs text-gray-500">Hapus?</span>
                          <div className="flex gap-1">
                            <button onClick={() => deleteItem(row.id)} className="text-xs text-red-600 font-semibold">Ya</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400">Batal</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setEditRow(row)} className="text-[#00897B]/60 hover:text-[#00897B] p-0.5 transition-colors" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setConfirmDeleteId(row.id)} className="text-red-300 hover:text-red-500 p-0.5 transition-colors" title="Hapus">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <GangguanDetailModal
          onClose={() => setShowAdd(false)}
          onSave={addItem}
        />
      )}

      {editRow && (
        <GangguanDetailModal
          initial={editRow}
          onClose={() => setEditRow(null)}
          onSave={(data) => updateItem(editRow.id, data)}
        />
      )}

      {showImport && (
        <ImportSheetsModal
          bulan={bulan}
          tahun={tahun}
          ulp={ulp}
          onClose={() => setShowImport(false)}
          onImport={(rows) => bulkAdd(rows.map((r) => ({
            ...r, jml_plgn: 0, jml_x_plgn_padam: 0, pain_point: "", lesson_learned: "", tindak_lanjut: "",
          })))}
        />
      )}
    </div>
  );
}
