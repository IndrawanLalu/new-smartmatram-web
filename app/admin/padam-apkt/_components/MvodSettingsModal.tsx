"use client";

import { useEffect, useState } from "react";
import { X, Settings2 } from "lucide-react";
import { MIN_DURASI_MENIT } from "../_lib/mvod";

interface Props {
  slaMenit: number;
  /** ULP yang sedang dilihat. Kosong = semua ULP, setelannya jadi menyeluruh. */
  ulp: string;
  saving: boolean;
  error: string | null;
  onSimpan: (nilai: number, untukUlp: string) => void;
  onClose: () => void;
}

export default function MvodSettingsModal({
  slaMenit, ulp, saving, error, onSimpan, onClose,
}: Props) {
  const [nilai, setNilai] = useState(String(slaMenit));
  const [menyeluruh, setMenyeluruh] = useState(!ulp);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const angka = Number(nilai);
  const sah = Number.isFinite(angka) && angka > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-[#E2E8F0] w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-[#00897B]" />
            <h2 className="text-base font-bold text-[#1B2631]">Setelan MVOD</h2>
          </div>
          <button onClick={onClose} className="text-[#5D6D7E] hover:text-[#1B2631] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1B2631] mb-1">
              SLA — pembagi MVOD (menit)
            </label>
            <input
              type="number"
              min={1}
              value={nilai}
              onChange={(e) => setNilai(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
            <p className="text-xs text-[#5D6D7E] mt-1.5 leading-relaxed">
              MVOD = maks(0, 2 − ((total durasi ÷ kali padam) ÷ SLA)) × 100.
              Makin besar makin baik: <b>200</b> sempurna, <b>100</b> tepat
              memenuhi SLA, <b>0</b> saat rata-rata sudah dua kali SLA atau
              lebih buruk.
            </p>
          </div>

          {/* Pilihan cakupan hanya bermakna kalau sedang menyaring satu ULP. */}
          {ulp && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={menyeluruh}
                onChange={(e) => setMenyeluruh(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#00897B]"
              />
              <span className="text-sm text-[#1B2631]">
                Berlakukan untuk semua ULP
                <span className="block text-xs text-[#5D6D7E] mt-0.5">
                  Kalau tidak dicentang, setelan ini hanya untuk ULP {ulp} dan
                  ULP lain tetap memakai setelan menyeluruh.
                </span>
              </span>
            </label>
          )}

          <div className="rounded-lg bg-[#F4F6F8] border border-[#E2E8F0] px-3 py-2.5">
            <p className="text-xs text-[#5D6D7E] leading-relaxed">
              Dua aturan lain <b>tidak</b> bisa diatur di sini karena bagian dari
              definisi MVOD-nya sendiri: hanya gangguan <b>kode J</b>, dan hanya
              yang durasinya <b>lebih dari {MIN_DURASI_MENIT} menit</b>.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#E2E8F0]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[#5D6D7E] border border-[#E2E8F0] hover:bg-gray-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={() => onSimpan(angka, menyeluruh ? "" : ulp)}
            disabled={!sah || saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-linear-to-r from-[#004D40] to-[#00897B] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
