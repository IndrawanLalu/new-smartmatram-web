/**
 * Petak angka bergaya peta gelap: angka besar, label kecil di bawahnya,
 * keterangan tambahan opsional. Dipakai hasil simulasi & ringkasan SLD.
 */

const NADA = {
  jingga: { latar: "bg-orange-500/10", angka: "text-orange-300" },
  merah: { latar: "bg-red-500/10", angka: "text-red-300" },
  netral: { latar: "bg-white/5", angka: "text-[#e2e8f0]" },
} as const;

interface Props {
  nilai: string;
  label: string;
  sub?: string;
  nada?: keyof typeof NADA;
}

export default function KartuAngka({ nilai, label, sub, nada = "netral" }: Props) {
  const n = NADA[nada];
  return (
    <div className={`rounded-md ${n.latar} py-1.5 text-center`}>
      <p className={`text-base font-bold ${n.angka} tabular-nums`}>{nilai}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
      {sub && <p className="text-[10px] text-gray-500 leading-tight">{sub}</p>}
    </div>
  );
}
