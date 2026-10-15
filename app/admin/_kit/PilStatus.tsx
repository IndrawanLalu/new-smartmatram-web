import { NADA_UI, nadaStatus } from "@/lib/statusUi";

/** Umur tunggakan: > WASPADA hari amber, > LAMA hari merah. */
const WASPADA = 3;
const LAMA = 7;

/**
 * Pil status: titik + label, warna dari `lib/statusUi` (satu sumber).
 * `hari` = sudah berapa hari di status ini (pekerjaan yang masih terbuka) —
 * ditulis di bawah pil; amber/merah kalau sudah lama, supaya tunggakan
 * terlihat tanpa membaca tanggal satu per satu.
 */
export default function PilStatus({ status, hari }: { status: string; hari?: number | null }) {
  const n = NADA_UI[nadaStatus(status)];
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${n.pil}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${n.titik}`} />
        {status}
      </span>
      {hari !== undefined && hari !== null && hari >= 0 && (
        <span
          className={`pl-1 text-[10.5px] tabular-nums ${
            hari > LAMA ? "text-red-700 font-semibold" : hari > WASPADA ? "text-amber-700 font-semibold" : "text-ink-muted"
          }`}
        >
          {hari === 0 ? "hari ini" : `${hari} hari`}
        </span>
      )}
    </span>
  );
}
