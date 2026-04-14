"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { GangguanDetail } from "../_hooks/useGangguanDetail";

interface GangguanDetailModalProps {
  initial?: Partial<GangguanDetail>;
  onClose: () => void;
  onSave: (data: Omit<GangguanDetail, "id" | "ulp" | "bulan" | "tahun" | "urutan">) => Promise<unknown>;
}

const INPUT = "w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20";
const TEXTAREA = `${INPUT} resize-none`;

export default function GangguanDetailModal({ initial, onClose, onSave }: GangguanDetailModalProps) {
  const [form, setForm] = useState({
    titik_gangguan: initial?.titik_gangguan ?? "",
    tgl_gangguan: initial?.tgl_gangguan ?? "",
    jam_padam: initial?.jam_padam ?? "",
    durasi: initial?.durasi ?? "",
    jml_plgn: initial?.jml_plgn ?? 0,
    jml_x_plgn_padam: initial?.jml_x_plgn_padam ?? 0,
    penyebab: initial?.penyebab ?? "",
    pain_point: initial?.pain_point ?? "",
    lesson_learned: initial?.lesson_learned ?? "",
    tindak_lanjut: initial?.tindak_lanjut ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titik_gangguan.trim()) return;
    setSaving(true);
    await onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] shrink-0">
          <h2 className="font-semibold text-[#1B2631]">
            {initial ? "Edit Gangguan" : "Tambah Gangguan"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            {/* Row 1 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Titik Gangguan *</label>
                <input value={form.titik_gangguan} onChange={set("titik_gangguan")} required className={INPUT} placeholder="REC. TATO" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Tanggal</label>
                <input value={form.tgl_gangguan} onChange={set("tgl_gangguan")} className={INPUT} placeholder="06/04/2026" />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Jam Padam</label>
                <input value={form.jam_padam} onChange={set("jam_padam")} className={INPUT} placeholder="00:01:00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Durasi</label>
                <input value={form.durasi} onChange={set("durasi")} className={INPUT} placeholder="01:45:00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Jml Pelanggan</label>
                <input type="number" value={form.jml_plgn} onChange={set("jml_plgn")} min={0} className={INPUT} />
              </div>
            </div>

            {/* Row 3 */}
            <div>
              <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Jml x Plgn Padam</label>
              <input type="number" value={form.jml_x_plgn_padam} onChange={set("jml_x_plgn_padam")} min={0} className="w-40 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20" />
            </div>

            {/* Penyebab */}
            <div>
              <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Penyebab Gangguan</label>
              <textarea value={form.penyebab} onChange={set("penyebab")} rows={2} className={TEXTAREA} placeholder="FCO Gardu putus, ada musang" />
            </div>

            {/* Pain Point */}
            <div>
              <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Pain Point</label>
              <textarea value={form.pain_point} onChange={set("pain_point")} rows={3} className={TEXTAREA} placeholder="1. Tekep Gardu belum sempurna&#10;2. ..." />
            </div>

            {/* Lesson Learned */}
            <div>
              <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Lesson Learned</label>
              <textarea value={form.lesson_learned} onChange={set("lesson_learned")} rows={3} className={TEXTAREA} placeholder="1. Memastikan pelaksanaan ROW&#10;2. ..." />
            </div>

            {/* Tindak Lanjut */}
            <div>
              <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Tindak Lanjut</label>
              <textarea value={form.tindak_lanjut} onChange={set("tindak_lanjut")} rows={3} className={TEXTAREA} placeholder="1. Meningkatkan frekuensi patroli ROW&#10;2. ..." />
            </div>
          </div>

          <div className="px-5 pb-5 flex gap-3 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 border border-[#E2E8F0] rounded-lg py-2 text-sm text-[#5D6D7E] hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={saving || !form.titik_gangguan.trim()} className="flex-1 bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
