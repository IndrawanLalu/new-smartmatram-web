import { MapPin, Navigation } from "lucide-react";
import type { GarduBelum } from "../_hooks/useMasterSegmen";

/**
 * Daftar gardu master penyulang ini yang belum ada di segmen mana pun — satu
 * baris per gardu supaya bisa dicek satu per satu: lihat di Peta (gardu &
 * jaringan sekitarnya) atau buka titik master-nya di Google Maps.
 */

const keterangan = (g: GarduBelum) =>
  g.di_section
    ? { teks: "Sudah di tiang penyulang ini, tiangnya belum masuk segmen", kelas: "text-navy-700" }
    : g.di_tiang_penyulang
      ? { teks: `Tercatat di tiang penyulang ${g.di_tiang_penyulang} — cek feeder di master gardu`, kelas: "text-red-700" }
      : { teks: "Belum ada di tiang mana pun (belum dititik)", kelas: "text-amber-800" };

export default function GarduBelumMasuk({ belum, kolom }: { belum: GarduBelum[]; kolom: number }) {
  const kva = belum.reduce((n, g) => n + (g.daya ?? 0), 0);
  return (
    <tr className="border-b border-line bg-amber-50/40">
      <td colSpan={kolom} className="pl-7 pr-2.5 py-2">
        <p className="text-xs font-semibold text-amber-800">
          Gardu belum masuk segmen · {belum.length} gardu · {kva.toLocaleString("id-ID")} kVA
        </p>
        <table className="mt-1.5 w-full max-w-5xl text-xs">
          <thead>
            <tr className="text-left text-ink-soft border-b border-amber-200">
              <th className="py-1 pr-3 font-semibold">Kode</th>
              <th className="py-1 pr-3 font-semibold">Nama / alamat</th>
              <th className="py-1 pr-3 font-semibold text-right">kVA</th>
              <th className="py-1 pr-3 font-semibold">Keterangan</th>
              <th className="py-1 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {belum.map((g) => {
              const k = keterangan(g);
              const alamat = g.alamat && g.alamat !== g.nama ? g.alamat : null;
              return (
                <tr key={g.kode} className="border-b border-amber-100 last:border-0">
                  <td className="py-1 pr-3 font-mono font-semibold text-ink whitespace-nowrap">{g.kode}</td>
                  <td className="py-1 pr-3 text-ink">
                    {g.nama ?? "–"}
                    {alamat && <span className="block text-ink-muted">{alamat}</span>}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{g.daya ? g.daya.toLocaleString("id-ID") : "–"}</td>
                  <td className={`py-1 pr-3 ${k.kelas}`}>{k.teks}</td>
                  <td className="py-1 whitespace-nowrap">
                    <a
                      href={`/peta?jtr=${encodeURIComponent(g.kode)}${g.ulp ? `&ulp=${encodeURIComponent(g.ulp)}` : ""}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 font-semibold text-navy-600 hover:underline"
                    >
                      <MapPin size={11} /> Peta
                    </a>
                    {g.lat != null && g.lng != null && (
                      <a
                        href={`https://www.google.com/maps?q=${g.lat},${g.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-3 inline-flex items-center gap-1 text-ink-soft hover:underline"
                        title="Titik gardu di master"
                      >
                        <Navigation size={11} /> Maps
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </td>
    </tr>
  );
}
