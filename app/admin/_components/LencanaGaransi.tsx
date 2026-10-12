import { TriangleAlert } from "lucide-react";
import { asalGaransi, bulanTahun, type InfoGaransi } from "@/app/admin/_hooks/useGaransi";

/**
 * "⚠ Masa garansi s.d. Nov 2026" + asalnya (istilah disetujui user 12 Okt
 * 2026). Hanya peringatan: objek yang masih bergaransi tetap boleh di-WO-kan.
 */
export default function LencanaGaransi({ g, namaWoGardu, ringkas }: { g: InfoGaransi; namaWoGardu?: string; ringkas?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5" title={asalGaransi(g, namaWoGardu)}>
      <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full border border-amber-300 bg-amber-50 text-[10px] font-semibold text-amber-800 whitespace-nowrap">
        <TriangleAlert size={10} /> Masa garansi s.d. {bulanTahun(g.garansi_sampai)}
      </span>
      {!ringkas && <span className="text-[10px] text-amber-700">{asalGaransi(g, namaWoGardu)}</span>}
    </span>
  );
}
