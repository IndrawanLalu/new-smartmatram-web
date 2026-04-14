"use client";

import { useState } from "react";
import { X, Copy } from "lucide-react";

const BULAN_NAMA = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface DuplicateModalProps {
  fromBulan: number;
  fromTahun: number;
  totalLM: number;
  onClose: () => void;
  onDuplicate: (bulan: number, tahun: number) => Promise<string | null>;
}

export default function DuplicateModal({ fromBulan, fromTahun, totalLM, onClose, onDuplicate }: DuplicateModalProps) {
  const nextBulan = fromBulan === 12 ? 1 : fromBulan + 1;
  const nextTahun = fromBulan === 12 ? fromTahun + 1 : fromTahun;

  const [targetBulan, setTargetBulan] = useState(nextBulan);
  const [targetTahun, setTargetTahun] = useState(nextTahun);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleDuplicate = async () => {
    setSaving(true);
    setError(null);
    const err = await onDuplicate(targetBulan, targetTahun);
    setSaving(false);
    if (err) { setError(err); return; }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Copy size={16} className="text-[#00897B]" />
            <h2 className="font-semibold text-[#1B2631]">Salin ke Bulan Lain</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {done ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-2xl">✅</p>
              <p className="font-semibold text-[#1B2631]">Berhasil disalin!</p>
              <p className="text-sm text-[#5D6D7E]">
                {totalLM} Lead Measure telah disalin ke{" "}
                <span className="font-medium text-[#00897B]">{BULAN_NAMA[targetBulan - 1]} {targetTahun}</span>
              </p>
              <p className="text-xs text-gray-400">Realisasi direset ke 0, target & struktur dipertahankan.</p>
              <button
                onClick={onClose}
                className="mt-3 bg-linear-to-r from-[#004D40] to-[#00897B] text-white px-6 py-2 rounded-lg text-sm font-medium"
              >
                Tutup
              </button>
            </div>
          ) : (
            <>
              <div className="bg-[#E0F2F1] rounded-lg px-4 py-3 text-sm text-[#004D40]">
                Menyalin <span className="font-semibold">{totalLM} Lead Measure</span> dari{" "}
                <span className="font-semibold">{BULAN_NAMA[fromBulan - 1]} {fromTahun}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1B2631] mb-2">Salin ke:</label>
                <div className="flex gap-2">
                  <select
                    value={targetBulan}
                    onChange={(e) => setTargetBulan(Number(e.target.value))}
                    className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                  >
                    {BULAN_NAMA.map((b, i) => (
                      <option key={i + 1} value={i + 1}>{b}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={targetTahun}
                    onChange={(e) => setTargetTahun(Number(e.target.value))}
                    className="w-24 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                  />
                </div>
              </div>

              <p className="text-xs text-[#5D6D7E] bg-gray-50 rounded-lg px-3 py-2">
                ⚠️ Realisasi akan direset ke 0. Target dan struktur LM dipertahankan. Jika bulan tujuan sudah ada data, LM baru akan ditambahkan.
              </p>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 border border-[#E2E8F0] rounded-lg py-2 text-sm text-[#5D6D7E] hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleDuplicate}
                  disabled={saving}
                  className="flex-1 bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Menyalin...</>
                  ) : (
                    <><Copy size={14} /> Salin Sekarang</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
