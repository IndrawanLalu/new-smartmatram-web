"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface AddLMModalProps {
  initial?: { nama: string; pic: string; komitmen: string };
  onClose: () => void;
  onSave: (nama: string, pic: string, komitmen: string) => Promise<unknown>;
}

export default function AddLMModal({ initial, onClose, onSave }: AddLMModalProps) {
  const [nama, setNama] = useState(initial?.nama ?? "");
  const [pic, setPic] = useState(initial?.pic ?? "");
  const [komitmen, setKomitmen] = useState(initial?.komitmen ?? "");
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) return;
    setSaving(true);
    await onSave(nama.trim(), pic.trim(), komitmen.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold text-ink">{isEdit ? "Edit Lead Measure" : "Tambah Lead Measure"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Nama Lead Measure <span className="text-red-500">*</span>
            </label>
            <textarea
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Pemeliharaan Terpadu (Liga Yantek) dengan target 1 kali / 2 minggu"
              rows={3}
              required
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">PIC</label>
            <input
              type="text"
              value={pic}
              onChange={(e) => setPic(e.target.value)}
              placeholder="Contoh: ASMAN JARINGAN"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Komitmen Minggu Depan
            </label>
            <textarea
              value={komitmen}
              onChange={(e) => setKomitmen(e.target.value)}
              placeholder="Tulis komitmen minggu depan..."
              rows={3}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-line rounded-lg py-2 text-sm text-ink-soft hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !nama.trim()}
              className="flex-1 bg-linear-to-r from-brand-700 to-brand-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-opacity"
            >
              {saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
