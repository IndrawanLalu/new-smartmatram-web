import { AlertTriangle, ExternalLink, Info, MapPin } from "lucide-react";
import type { HasilPrediksi } from "@/lib/prediksiGangguan/hitung";
import { LABEL_JENIS } from "./label";

const km = (n: number) => n.toFixed(2).replace(".", ",");
const ribu = (n: number) => Math.round(n).toLocaleString("id-ID");
const peta = (lat: number | null, lng: number | null) =>
  lat != null && lng != null ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}` : null;

function Peta({ lat, lng }: { lat: number | null; lng: number | null }) {
  const url = peta(lat, lng);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline shrink-0">
      <ExternalLink size={12} /> Maps
    </a>
  );
}

/** Hasil prediksi satu gangguan: ringkasan, rekomendasi cek (OC) atau seksi (EF), catatan. */
export default function IsiPrediksi({ h }: { h: HasilPrediksi }) {
  const b = h.bacaan;
  const s = h.sumber;
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-surface p-3">
          <p className="text-ink-muted">Jenis dari arus</p>
          <p className="font-semibold text-ink">{LABEL_JENIS[b.jenis].panjang}{b.fasa !== "-" && ` · fasa ${b.fasa}`}</p>
          {b.rentang && <p className="text-ink-soft">arus gangguan {ribu(b.rentang[0])}–{ribu(b.rentang[1])} A{b.beban ? ` (beban ${b.beban} A dikeluarkan)` : ""}</p>}
        </div>
        <div className="rounded-xl bg-surface p-3">
          <p className="text-ink-muted">Zona</p>
          {h.zona ? (
            <>
              <p className="font-semibold text-ink">Hilir {h.alat.nama}</p>
              <p className="text-ink-soft">{ribu(h.zona.tiang)} tiang · {km(h.zona.km)} km · {km(h.zona.kmDari)}–{km(h.zona.kmSampai)} km dari GI</p>
            </>
          ) : <p className="font-semibold text-ink">–</p>}
        </div>
        <div className="rounded-xl bg-surface p-3">
          <p className="text-ink-muted">Sumber</p>
          {s ? (
            <>
              <p className="font-semibold text-ink">{s.trafo ?? "Trafo belum diketahui"} · Xs {s.xs.toFixed(2).replace(".", ",")} Ω</p>
              <p className="text-ink-soft">{s.asal === "kalibrasi" ? `terkalibrasi dari ${s.n} temuan` : "perkiraan dari kapasitas trafo"}</p>
            </>
          ) : <p className="font-semibold text-ink">Tidak dipakai (bukan OC)</p>}
        </div>
      </div>

      {h.uji && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <b>Lokasi temuan dibanding prediksi:</b>{" "}
          {h.uji.saranKe != null
            ? `saran ke-${h.uji.saranKe} dari ${h.kelompok.length || h.seksi.length}${h.uji.peringkat != null ? ` (tiang calon ke-${h.uji.peringkat} dari ${h.calon.length})` : ""}.`
            : h.uji.masukZona ? "di zona, tetapi tidak masuk calon." : "di luar zona peralatan yang trip."}
          {" "}Dinilai dengan kalibrasi tanpa temuan ini sendiri.
        </div>
      )}

      {h.kelompok.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink mb-1.5">Rekomendasi cek — {h.calon.length} tiang calon dalam {h.kelompok.length} area, urut paling cocok</p>
          <ol className="space-y-1.5">
            {h.kelompok.map((k, i) => (
              <li key={k.cabang[0].awalan} className="rounded-xl border border-line px-3 py-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {i + 1}. {k.patokan.map((p) => (p.jenis === "alat" ? `sekitar ${p.nama}` : `seputaran ${p.nama}`)).join(" / ") || k.cabang[0].label}
                    </p>
                    {k.cabang.map((c) => (
                      <p key={c.awalan} className="text-ink-soft">{c.label}: {c.dari === c.sampai ? c.dari : `${c.dari} … ${c.sampai}`} ({c.jumlah} tiang)</p>
                    ))}
                    <p className="text-ink-muted">{k.jumlah} tiang · {km(k.kmDari)}–{km(k.kmSampai)} km dari GI · calon terbaik ke-{k.peringkat}</p>
                    {k.temuan > 0 && <p className="text-amber-700 mt-0.5">⚠ {k.temuan} temuan JTM terbuka{k.temuanRow ? ` (${k.temuanRow} ROW)` : ""}</p>}
                  </div>
                  <Peta lat={k.lat} lng={k.lng} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {h.peralatan.length > 0 && (
        <div className="rounded-xl border border-line px-3 py-2 text-xs">
          <p className="font-semibold text-ink mb-0.5">Cek dulu peralatan di zona — jumperan, isolator, FCO (cepat dilihat dari jalan)</p>
          <p className="text-ink-soft">{h.peralatan.map((p) => p.nama).join(", ")}</p>
        </div>
      )}

      {h.seksi.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink mb-1.5">Lalu sisir per seksi — jaringan terpanjang dulu</p>
          <ol className="space-y-1.5">
            {h.seksi.map((sk, i) => (
              <li key={sk.kode} className="rounded-xl border border-line px-3 py-2 text-xs flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{i + 1}. Seksi {sk.pangkal}</p>
                  <p className="text-ink-soft">{sk.jumlah} tiang · {km(sk.km)} km{sk.patokan[0] && ` · dekat ${sk.patokan[0].nama}`}</p>
                  {sk.temuan > 0 && <p className="text-amber-700 mt-0.5">⚠ {sk.temuan} temuan JTM terbuka{sk.temuanRow ? ` (${sk.temuanRow} ROW)` : ""}</p>}
                </div>
                <Peta lat={sk.lat} lng={sk.lng} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {!h.kelompok.length && !h.seksi.length && (
        <p className="text-xs text-ink-soft flex items-center gap-1.5"><MapPin size={13} /> Belum ada rekomendasi lokasi untuk gangguan ini.</p>
      )}

      {h.catatan.length > 0 && (
        <ul className="space-y-1">
          {h.catatan.map((c) => (
            <li key={c} className="text-xs text-ink-soft flex items-start gap-1.5">
              {c.startsWith("Arus") ? <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" /> : <Info size={13} className="text-ink-muted mt-0.5 shrink-0" />}
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
