/* eslint-disable @next/next/no-img-element -- dirender next/og jadi PNG, bukan halaman; next/image tidak berlaku di sini. */
import type { Beban, LokasiTerdekat } from "@/lib/wa/lokasiTerdekat";
import type { GambarBingkai } from "./aset";
import { BULAN, C, HURUF, HURUF_JUDUL } from "./gaya";
import { Ikon, type NamaIkon } from "./ikon";

/**
 * Balasan WA japri "kirim lokasi" — PNG tegak 1080 px: sketsa posisi (titik,
 * 3 gardu, tiang JTR menurut arah & jarak sebenarnya, tanpa peta jalan),
 * daftar gardu + beban terakhir, dan tiang JTR + jarak dari gardu lewat JTR.
 * Aturan Satori sama dengan kartu lain: elemen beranak >1 wajib flex.
 * Teks di dalam <svg> tidak dipakai — label ditaruh sebagai div absolut.
 */

export const LEBAR = 1080;
const PAD = 36;
const ISI = LEBAR - PAD * 2;
const T = { header: 150, info: 72, sketsa: 500, judul: 58, celah: 20, gardu: 136, jtr: 120, jtrBeban: 48, kosong: 60, footer: 84 } as const;
const WARNA = { gardu: C.navy, jtr: "#0E7C86", titik: C.merah } as const;

export function tinggiLokasi(d: LokasiTerdekat) {
  return T.header + T.info + T.sketsa
    + T.celah + T.judul + (d.gardu.length ? d.gardu.length * T.gardu : T.kosong)
    + T.celah + T.judul + (d.jtr ? T.jtr + (d.jtr.garduDiDaftar ? 0 : T.jtrBeban) : T.kosong)
    + T.celah + T.footer;
}

// ── Bantu ───────────────────────────────────────────────────────────────────
const meter = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);
const n1 = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
const tgl = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN[m - 1].slice(0, 3)} ${y}`;
};
const potong = (s: string, maks: number) => (s.length > maks ? `${s.slice(0, maks - 1).trimEnd()}…` : s);
const warnaBeban = (p: number | null) => (p === null ? C.pudar : p >= 80 ? C.merah : p >= 60 ? C.oranye : C.hijau);

function Judul({ ikon, teks, sub, warna }: { ikon: NamaIkon; teks: string; sub: string; warna: string }) {
  return (
    <div style={{ marginTop: T.celah, height: T.judul, display: "flex", alignItems: "center", gap: 14, padding: "0 20px", borderRadius: 12, background: warna, color: C.putih }}>
      <Ikon nama={ikon} ukuran={30} warna={C.putih} />
      <div style={{ fontFamily: HURUF_JUDUL, fontSize: 32, fontWeight: 800, letterSpacing: 0.5 }}>{teks}</div>
      <div style={{ marginLeft: "auto", fontSize: 19, fontWeight: 600, opacity: 0.9 }}>{sub}</div>
    </div>
  );
}

function Kosong({ teks }: { teks: string }) {
  return (
    <div style={{ height: T.kosong, display: "flex", alignItems: "center", padding: "0 20px", fontSize: 21, fontWeight: 600, color: C.tintaLembut, fontStyle: "italic" }}>
      {teks}
    </div>
  );
}

/** Bilah beban; tanpa pengukuran → teks abu-abu. */
function BilahBeban({ b, lebar }: { b: Beban | undefined; lebar: number }) {
  if (!b) return <div style={{ display: "flex", fontSize: 20, fontWeight: 600, color: C.pudar, fontStyle: "italic" }}>beban belum diukur</div>;
  const w = warnaBeban(b.persen);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", width: lebar, height: 14, borderRadius: 7, background: C.garis }}>
        <div style={{ width: `${Math.min(100, Math.max(0, b.persen ?? 0))}%`, height: 14, borderRadius: 7, background: w }} />
      </div>
      <div style={{ fontFamily: HURUF_JUDUL, fontSize: 30, fontWeight: 800, color: w }}>{b.persen === null ? "–" : `${Math.round(b.persen)}%`}</div>
      <div style={{ fontSize: 19, fontWeight: 600, color: C.tintaLembut }}>
        {`${b.kva === null ? "–" : `${n1(b.kva)} kVA`} · ${tgl(b.tanggal)}`}
      </div>
    </div>
  );
}

// ── Sketsa ──────────────────────────────────────────────────────────────────
const SK_W = ISI;
const SK_H = T.sketsa - 30;
const SK_R = SK_H / 2 - 34; // jari-jari lingkar luar (px)
const SKALA = [100, 200, 300, 500, 750, 1000];
const LABEL_W = 210;
const LABEL_H = 36;

/** Label digeser turun sampai tidak menimpa label lain maupun penanda lain (termasuk titik
 *  di tengah); penandanya tetap di tempat, diberi garis penunjuk. */
function aturLabel<P extends { x: number; y: number }>(posisi: P[], tengah: { x: number; y: number }) {
  const urut = posisi.map((p, i) => ({ ...p, i, kanan: p.x < SK_W - LABEL_W - 20, ly: p.y })).sort((a, b) => a.y - b.y);
  const penanda = [...posisi, tengah];
  const ditaruh: typeof urut = [];
  for (const p of urut) {
    const kiri = p.kanan ? p.x + 22 : p.x - 22 - LABEL_W;
    const tabrak = () =>
      ditaruh.some((q) => Math.abs((q.kanan ? q.x + 22 : q.x - 22 - LABEL_W) - kiri) < LABEL_W && Math.abs(q.ly - p.ly) < LABEL_H) ||
      penanda.some((m) => m !== posisi[p.i] && m.x > kiri - 16 && m.x < kiri + LABEL_W + 16 && Math.abs(m.y - p.ly) < LABEL_H / 2 + 14);
    for (let n = 0; n < 12 && tabrak(); n++) p.ly += LABEL_H / 2;
    p.ly = Math.min(p.ly, SK_H - LABEL_H / 2 - 6);
    ditaruh.push(p);
  }
  return ditaruh;
}

function Sketsa({ d }: { d: LokasiTerdekat }) {
  const objek = [
    ...d.gardu.map((g, i) => ({ lat: g.lat, lng: g.lng, jarak: g.jarak, label: `${i + 1} ${g.kode}`, jenis: "gardu" as const })),
    ...(d.jtr ? [{ lat: d.jtr.lat, lng: d.jtr.lng, jarak: d.jtr.jarak, label: d.jtr.kode, jenis: "jtr" as const }] : []),
  ];
  const jauh = Math.max(50, ...objek.map((o) => o.jarak));
  const R = SKALA.find((s) => s >= jauh * 1.1) ?? 1000;
  const px = SK_R / R;
  const cx = SK_W / 2;
  const cy = SK_H / 2;
  const kosLat = Math.cos((d.titik.lat * Math.PI) / 180);
  const posisi = aturLabel(objek.map((o) => ({
    ...o,
    x: cx + (o.lng - d.titik.lng) * 111320 * kosLat * px,
    y: cy - (o.lat - d.titik.lat) * 110574 * px,
  })), { x: cx, y: cy });
  const warnaOf = (o: { jenis: "gardu" | "jtr" }) => (o.jenis === "gardu" ? WARNA.gardu : WARNA.jtr);

  return (
    <div style={{ marginTop: 10, width: SK_W, height: SK_H, display: "flex", position: "relative", borderRadius: 16, background: C.putih, border: `1px solid ${C.garis}`, overflow: "hidden" }}>
      <svg width={SK_W} height={SK_H} viewBox={`0 0 ${SK_W} ${SK_H}`} style={{ position: "absolute", left: 0, top: 0, width: SK_W, height: SK_H }}>
        <circle cx={cx} cy={cy} r={SK_R} fill={C.biruMuda} stroke={C.biruLangit} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={SK_R / 2} fill="none" stroke={C.biruLangit} strokeWidth={2} strokeDasharray="8 8" />
        {posisi.map((o, i) => (
          <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke={warnaOf(o)} strokeWidth={2} strokeDasharray="6 6" strokeOpacity={0.55} />
        ))}
        {posisi.filter((o) => o.ly !== o.y).map((o, i) => (
          <line key={`p${i}`} x1={o.x} y1={o.y} x2={o.kanan ? o.x + 22 : o.x - 22} y2={o.ly} stroke={warnaOf(o)} strokeWidth={2} />
        ))}
      </svg>

      {/* Skala lingkar */}
      {[R / 2, R].map((m) => (
        <div key={m} style={{ position: "absolute", left: cx + m * px + 6, top: cy - 12, display: "flex", fontSize: 17, fontWeight: 700, color: C.tintaLembut }}>{meter(m)}</div>
      ))}

      {/* Utara */}
      <div style={{ position: "absolute", left: 24, top: 18, display: "flex", flexDirection: "column", alignItems: "center", color: C.tinta }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800, lineHeight: 1 }}>↑</div>
        <div style={{ display: "flex", fontSize: 20, fontWeight: 800 }}>U</div>
      </div>

      {/* Keterangan */}
      <div style={{ position: "absolute", right: 20, top: 16, display: "flex", flexDirection: "column", gap: 8, fontSize: 18, fontWeight: 600, color: C.tintaLembut }}>
        {([["Titik dikirim", WARNA.titik, 9], ["Gardu", WARNA.gardu, 4], ["Tiang JTR", WARNA.jtr, 9]] as const).map(([l, w, r]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 18, height: 18, borderRadius: r, background: w }} />
            <div style={{ display: "flex" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Objek: label (boleh tergeser dari penandanya), lalu penanda di atasnya */}
      {posisi.map((o, i) => (
        <div key={`l${i}`} style={{ position: "absolute", left: o.kanan ? o.x + 22 : o.x - 22 - LABEL_W, top: o.ly - LABEL_H / 2 + 2, width: LABEL_W, display: "flex", justifyContent: o.kanan ? "flex-start" : "flex-end" }}>
          <div style={{ display: "flex", padding: "2px 10px", borderRadius: 8, background: C.putih, border: `1px solid ${C.garis}`, fontSize: 19, fontWeight: 800, color: warnaOf(o) }}>
            {o.label}
          </div>
        </div>
      ))}

      {posisi.map((o, i) => {
        const s = o.jenis === "gardu" ? 26 : 20;
        return <div key={`m${i}`} style={{ position: "absolute", left: o.x - s / 2, top: o.y - s / 2, width: s, height: s, borderRadius: o.jenis === "gardu" ? 5 : s / 2, background: warnaOf(o), border: `3px solid ${C.putih}` }} />;
      })}
      {/* Titik yang dikirim */}
      <div style={{ position: "absolute", left: cx - 13, top: cy - 13, width: 26, height: 26, borderRadius: 13, background: WARNA.titik, border: `4px solid ${C.putih}` }} />
    </div>
  );
}

// ── Kartu ───────────────────────────────────────────────────────────────────
export function KartuLokasiTerdekat({ d, gambar, dibuat }: { d: LokasiTerdekat; gambar: GambarBingkai; dibuat: string }) {
  const j = d.jtr;
  return (
    <div style={{ width: LEBAR, height: tinggiLokasi(d), display: "flex", flexDirection: "column", fontFamily: HURUF, color: C.tinta, background: "#F1F6FC" }}>
      {/* Kepala */}
      <div style={{ height: T.header, display: "flex", alignItems: "center", padding: `0 ${PAD}px`, color: C.putih, background: `linear-gradient(120deg, ${C.navyTua} 0%, ${C.navy} 60%, ${C.biru} 100%)` }}>
        <img src={gambar.logoPln} width={74} height={74} alt="" />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, opacity: 0.9 }}>JARINGAN TERDEKAT</div>
          <div style={{ fontFamily: HURUF_JUDUL, fontSize: 30, fontWeight: 700 }}>Gardu & JTR · radius 1 km</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex" }}>
          <Ikon nama="lokasi" ukuran={84} warna={C.kuning} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", padding: `0 ${PAD}px` }}>
        <div style={{ height: T.info, display: "flex", alignItems: "center", gap: 12, fontSize: 24 }}>
          <span style={{ color: C.tintaLembut, fontWeight: 600 }}>Titik</span>
          <span style={{ fontWeight: 800 }}>{`${d.titik.lat.toFixed(5)}, ${d.titik.lng.toFixed(5)}`}</span>
        </div>
        <Sketsa d={d} />

        {/* Gardu */}
        <Judul ikon="petir" teks="GARDU TERDEKAT" sub="beban = pengukuran terakhir" warna={WARNA.gardu} />
        {d.gardu.length ? d.gardu.map((g, i) => (
          <div key={g.kode + g.ulp} style={{ height: T.gardu, display: "flex", alignItems: "center", gap: 18, borderBottom: i < d.gardu.length - 1 ? `1px solid ${C.garis}` : "none" }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: WARNA.gardu, color: C.putih, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800 }}>{String(i + 1)}</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <div style={{ fontFamily: HURUF_JUDUL, fontSize: 36, fontWeight: 800 }}>{g.kode}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.tintaLembut }}>
                  {potong([g.penyulang && `Penyulang ${g.penyulang}`, g.daya && `${g.daya} kVA`, g.ulp].filter(Boolean).join(" · "), 52)}
                </div>
                <div style={{ marginLeft: "auto", fontFamily: HURUF_JUDUL, fontSize: 32, fontWeight: 800, color: WARNA.gardu }}>{meter(g.jarak)}</div>
              </div>
              <div style={{ display: "flex", fontSize: 19, fontWeight: 600, color: C.tintaLembut }}>{potong(g.nama || "–", 80)}</div>
              <BilahBeban b={g.beban} lebar={380} />
            </div>
          </div>
        )) : <Kosong teks="Tidak ada gardu dalam 1 km." />}

        {/* JTR */}
        <Judul ikon="jalur" teks="TIANG JTR TERDEKAT" sub="jarak dari gardu menyusuri kabel" warna={WARNA.jtr} />
        {j ? (
          <div style={{ height: T.jtr + (j.garduDiDaftar ? 0 : T.jtrBeban), display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div style={{ fontFamily: HURUF_JUDUL, fontSize: 36, fontWeight: 800 }}>{j.kode}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: C.tintaLembut }}>{`gardu ${j.gardu_kode}${j.jurusan ? ` · jurusan ${j.jurusan}` : ""}`}</div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {[
                ["Dari titik", meter(j.jarak)],
                [`Dari gardu ${j.gardu_kode} lewat JTR`, j.lewatJtr === null ? "rantai belum lengkap" : `± ${meter(j.lewatJtr)}`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", gap: 10, alignItems: "center", height: 48, padding: "0 18px", borderRadius: 24, background: C.putih, border: `1px solid ${C.garis}`, fontSize: 20 }}>
                  <span style={{ color: C.tintaLembut, fontWeight: 600 }}>{l}</span>
                  <span style={{ fontWeight: 800, color: WARNA.jtr }}>{v}</span>
                </div>
              ))}
            </div>
            {!j.garduDiDaftar && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", fontSize: 20, fontWeight: 700 }}>{`Beban ${j.gardu_kode}`}</div>
                <BilahBeban b={j.bebanGardu} lebar={300} />
              </div>
            )}
          </div>
        ) : <Kosong teks="Tidak ada tiang JTR dalam 1 km." />}
      </div>

      {/* Kaki */}
      <div style={{ marginTop: "auto", height: T.footer, display: "flex", alignItems: "center", gap: 14, padding: `0 ${PAD}px`, color: C.putih, background: `linear-gradient(90deg, ${C.navyTua} 0%, ${C.navy} 100%)` }}>
        <img src={gambar.logoSmart} width={52} height={52} alt="" />
        <div style={{ fontSize: 24, fontWeight: 800 }}>SMART Mataram</div>
        <div style={{ marginLeft: "auto", fontSize: 18, fontWeight: 600, opacity: 0.85 }}>{`dibuat ${dibuat} WITA`}</div>
      </div>
    </div>
  );
}
