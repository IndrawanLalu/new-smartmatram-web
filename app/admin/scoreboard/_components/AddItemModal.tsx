"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface AddItemModalProps {
  lmNama: string;
  onClose: () => void;
  onSave: (
    nama_item: string,
    satuan: string,
    targets: { m1: number; m2: number; m3: number; m4: number }
  ) => Promise<unknown>;
}

const WEEK_LABELS = ["M1", "M2", "M3", "M4"] as const;

export default function AddItemModal({ lmNama, onClose, onSave }: AddItemModalProps) {
  const [namaItem, setNamaItem] = useState("");
  const [satuan, setSatuan] = useState("");
  const [sameTarget, setSameTarget] = useState(true);
  const [targetAll, setTargetAll] = useState("0");
  const [targets, setTargets] = useState({ m1: "0", m2: "0", m3: "0", m4: "0" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaItem.trim()) return;
    setSaving(true);

    const t = sameTarget
      ? { m1: Number(targetAll), m2: Number(targetAll), m3: Number(targetAll), m4: Number(targetAll) }
      : { m1: Number(targets.m1), m2: Number(targets.m2), m3: Number(targets.m3), m4: Number(targets.m4) };

    await onSave(namaItem.trim(), satuan.trim(), t);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="font-semibold text-[#1B2631]">Tambah Item Pekerjaan</h2>
            <p className="text-xs text-[#5D6D7E] mt-0.5 line-clamp-1">{lmNama}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#1B2631] mb-1">
                Nama Pekerjaan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={namaItem}
                onChange={(e) => setNamaItem(e.target.value)}
                placeholder="Contoh: PDKB — 30 titik"
                required
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-[#1B2631] mb-1">Satuan</label>
              <input
                type="text"
                value={satuan}
                onChange={(e) => setSatuan(e.target.value)}
                placeholder="titik / kali"
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sameTarget}
                onChange={(e) => setSameTarget(e.target.checked)}
                className="w-4 h-4 accent-[#00897B]"
              />
              <span className="text-sm text-[#1B2631]">Target sama untuk semua minggu</span>
            </label>

            {sameTarget ? (
              <div>
                <label className="block text-sm font-medium text-[#1B2631] mb-1">Target (M1–M4)</label>
                <input
                  type="number"
                  value={targetAll}
                  onChange={(e) => setTargetAll(e.target.value)}
                  min={0}
                  className="w-32 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-[#1B2631] mb-2">Target per Minggu</label>
                <div className="grid grid-cols-4 gap-2">
                  {WEEK_LABELS.map((w) => {
                    const key = w.toLowerCase() as "m1" | "m2" | "m3" | "m4";
                    return (
                      <div key={w}>
                        <p className="text-xs text-center text-[#5D6D7E] mb-1">{w}</p>
                        <input
                          type="number"
                          value={targets[key]}
                          onChange={(e) => setTargets((prev) => ({ ...prev, [key]: e.target.value }))}
                          min={0}
                          className="w-full border border-[#E2E8F0] rounded-lg px-2 py-2 text-sm text-center text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#E2E8F0] rounded-lg py-2 text-sm text-[#5D6D7E] hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !namaItem.trim()}
              className="flex-1 bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-opacity"
            >
              {saving ? "Menyimpan..." : "Tambah Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
