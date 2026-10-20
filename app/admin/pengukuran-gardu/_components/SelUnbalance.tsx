import { calcUnbalancePct } from "@/lib/anomaliGardu";

/** Batas merah bawaan — sama dengan batas kuning lapisan Kesehatan peta. */
export const UNBALANCE_BATAS = 20;

interface Props {
  r: number;
  s: number;
  t: number;
  /** Merah bila ≥ batas ini. */
  batas?: number;
}

/** Sel tabel "Unbalance": arus R/S/T → %, "—" bila belum ada arus terukur. */
export default function SelUnbalance({ r, s, t, batas = UNBALANCE_BATAS }: Props) {
  if (r + s + t <= 0) return <td className="px-4 py-3 text-center font-mono text-xs text-ink-soft">—</td>;
  const unb = calcUnbalancePct(r, s, t);
  return (
    <td className={`px-4 py-3 text-center font-mono text-xs ${unb >= batas ? "text-red-600 font-semibold" : "text-ink-soft"}`}>
      {unb.toFixed(1).replace(".", ",")}%
    </td>
  );
}
