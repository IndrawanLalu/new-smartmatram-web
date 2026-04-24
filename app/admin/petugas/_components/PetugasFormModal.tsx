"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { UNITS } from "@/lib/roles";
import type { Petugas, SavePetugasInput } from "../_hooks/usePetugas";

const GROUPS = [
  "INSPEKTOR",
  "PERABASAN",
  "YANGU",
  "HARJAR",
  "HARGAR",
  "PDKB",
  "K3",
];

interface Props {
  petugas?: Petugas;
  fixedUlp?: string;
  onClose: () => void;
  onSave: (input: SavePetugasInput) => Promise<string | null>;
}

export default function PetugasFormModal({ petugas, fixedUlp, onClose, onSave }: Props) {
  const isEdit = !!petugas;

  const [nama, setNama] = useState(petugas?.nama ?? "");
  const [groupName, setGroupName] = useState(petugas?.group_name ?? GROUPS[0]);
  const [ulp, setUlp] = useState(petugas?.ulp ?? fixedUlp ?? UNITS[0].value);
  const [phone, setPhone] = useState(petugas?.phone ?? "");
  const [email, setEmail] = useState(petugas?.email ?? "");
  const [status, setStatus] = useState(petugas?.status ?? "aktif");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) { setError("Nama harus diisi"); return; }

    setLoading(true);
    setError(null);
    const err = await onSave({ nama, group_name: groupName, ulp, phone, email, status });
    setLoading(false);
    if (err) { setError(err); return; }
    onClose();
  };

  const inputCls = "w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="font-bold text-[#1B2631]">
            {isEdit ? "Edit Petugas" : "Tambah Petugas"}
          </h2>
          <button onClick={onClose} className="text-[#5D6D7E] hover:text-[#1B2631]">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Nama Petugas</label>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama lengkap"
              className={inputCls}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Group / Tim</label>
              <select value={groupName} onChange={(e) => setGroupName(e.target.value)} className={inputCls}>
                {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5D6D7E] mb-1">ULP</label>
              <select
                value={ulp}
                onChange={(e) => setUlp(e.target.value)}
                disabled={!!fixedUlp}
                className={`${inputCls} ${fixedUlp ? "bg-[#F4F6F8] cursor-not-allowed" : ""}`}
              >
                {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5D6D7E] mb-1">No. HP (opsional)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className={inputCls}
              type="tel"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Email (opsional)</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@pln.co.id"
              className={inputCls}
              type="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5D6D7E] mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              <option value="aktif">Aktif</option>
              <option value="non-aktif">Non-aktif</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#5D6D7E] border border-[#E2E8F0] rounded-lg hover:bg-[#F4F6F8]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : isEdit ? "Simpan" : "Tambah"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
