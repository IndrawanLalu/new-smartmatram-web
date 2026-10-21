/* eslint-disable @next/next/no-img-element -- dirender next/og jadi PNG, bukan halaman; next/image tidak berlaku di sini. */
import type { JurusanData } from "@/lib/garduAmbang";
import { calcUnbalancePct } from "@/lib/anomaliGardu";
import type { GambarBingkai } from "./aset";
import type { DataGardu, UkurHar } from "./dataGardu";
import { BULAN, C, HURUF, HURUF_JUDUL } from "./gaya";
import { Ikon, type NamaIkon } from "./ikon";

/**
 * Kartu `#DATA <kode>` — PNG tegak 1080 px untuk WA. Tingginya dihitung dari
 * isi (`tinggiDataGardu`) supaya jurusan sebanyak apa pun tidak terpotong.
 * Aturan Satori sama dengan lib/gambar lainnya: elemen beranak >1 wajib flex,
 * anak teks harus string.
 *
 * Beban puncak (malam) dan pengukuran pemeliharaan (siang) dipisah tegas —
 * angka siang yang rendah tidak boleh terbaca sebagai beban trafo.
 */

export const LEBAR = 1080;
const PAD = 36;
const ISI = LEBAR - PAD * 2;

const T = {
  header: 176, info: 150, judul: 58, celah: 20, ringkas: 168, meta: 40,
  kepala: 42, baris: 42, kosong: 54, harInfo: 96, tanah: 60, footer: 84,
} as const;

const WARNA = { beban: C.navy, ujung: "#0E7C86", har: C.hijauTua } as const;

// ── Bantu ───────────────────────────────────────────────────────────────────
const n0 = (v: number | null | undefined) => (v === null || v === undefined ? "–" : Math.round(v).toLocaleString("id-ID"));
const n1 = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
const tgl = (iso: string | null) => {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN[m - 1].slice(0, 3)} ${y}`;
};
/** Satori tidak memotong baris sendiri — teks panjang dipotong di sini, satu baris. */
const potong = (s: string, maks: number) => (s.length > maks ? `${s.slice(0, maks - 1).trimEnd()}…` : s);
const warnaBeban = (p: number | null) => (p === null ? C.pudar : p >= 80 ? C.merah : p >= 60 ? C.oranye : C.hijau);

/** Jurusan yang benar-benar dipakai (ada arus atau tegangan), urut abjad. */
export function jurusanAktif(p: Record<string, JurusanData>) {
  return Object.entries(p)
    .filter(([, j]) => [j?.arus?.R, j?.arus?.S, j?.arus?.T, j?.arus?.N, j?.tegangan?.R].some((v) => Number(v) > 0))
    .sort(([a], [b]) => a.localeCompare(b));
}

const tinggiTabel = (n: number) => (n ? T.kepala + n * T.baris : T.kosong);

/** Tinggi kartu — harus sama persis dengan susunan di bawah. */
export function tinggiDataGardu(d: DataGardu) {
  let h = T.header + T.info;
  h += T.celah + T.judul + (d.beban ? T.ringkas + T.meta + T.celah + tinggiTabel(jurusanAktif(d.beban.perjurusan).length) : T.kosong);
  h += T.celah + T.judul + tinggiTabel(d.ujung.length);
  h += T.celah + T.judul;
  if (d.har) {
    const nUkur = (d.har.sebelum ? 1 : 0) + (d.har.sesudah ? 1 : 0);
    h += T.harInfo + tinggiTabel(nUkur);
    h += T.celah + tinggiTabel(jurusanAktif(d.har.sesudah?.perjurusan ?? d.har.sebelum?.perjurusan ?? {}).length);
    h += T.celah + T.tanah;
  } else h += T.kosong;
  return h + T.celah + T.footer;
}

// ── Potongan ────────────────────────────────────────────────────────────────
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

interface Sel { teks: string; warna?: string; tebal?: boolean }

function Tabel({ kepala, lebar, baris, warna }: { kepala: string[]; lebar: number[]; baris: Sel[][]; warna: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", borderRadius: 10, overflow: "hidden", border: `1px solid ${C.garis}` }}>
      <div style={{ display: "flex", height: T.kepala, background: warna, color: C.putih, fontSize: 19, fontWeight: 700 }}>
        {kepala.map((k, i) => (
          <div key={i} style={{ width: lebar[i], display: "flex", alignItems: "center", justifyContent: "center" }}>{k}</div>
        ))}
      </div>
      {baris.map((b, r) => (
        <div key={r} style={{ display: "flex", height: T.baris, background: r % 2 ? C.zebra : C.putih, fontSize: 21, fontWeight: 600 }}>
          {b.map((s, i) => (
            <div
              key={i}
              style={{ width: lebar[i], display: "flex", alignItems: "center", justifyContent: "center", color: s.warna ?? C.tinta, fontWeight: s.tebal ? 800 : 600 }}
            >
              {s.teks}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Lebar kolom: kolom pertama `awal`, sisanya dibagi rata. */
const bagi = (n: number, awal: number) => [awal, ...Array.from({ length: n - 1 }, () => (ISI - 2 - awal) / (n - 1))];

/** Tegangan jurusan; semua 0 = tidak diisi petugas → "–", bukan 0 volt. */
const teksTeg = (j: JurusanData) => {
  const v = [j.tegangan?.R, j.tegangan?.S, j.tegangan?.T].map(Number);
  return v.some((x) => x > 0) ? v.map(n0).join(" / ") : "–";
};

/** Baris arus per jurusan; fasa terbesar di jurusan itu ditebalkan. */
function barisJurusan(daftar: [string, JurusanData][], tambahan?: (k: string) => Sel[]): Sel[][] {
  return daftar.map(([k, j]) => {
    const fasa = [j.arus.R, j.arus.S, j.arus.T].map(Number);
    const maks = Math.max(...fasa);
    return [
      { teks: k, tebal: true },
      ...fasa.map((v) => ({ teks: n0(v), tebal: v === maks && v > 0 })),
      { teks: n0(Number(j.arus.N)), warna: C.tintaLembut },
      ...(tambahan ? tambahan(k) : [{ teks: teksTeg(j) }]),
    ];
  });
}

function Tile({ label, nilai, warna }: { label: string; nilai: string; warna?: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 16px", borderRadius: 12, background: C.putih, border: `1px solid ${C.garis}` }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: C.tintaLembut }}>{label}</div>
      <div style={{ fontSize: 27, fontWeight: 800, color: warna ?? C.tinta, marginTop: 2 }}>{nilai}</div>
    </div>
  );
}

const teksArus = (a: UkurHar["arus"]) => `${n0(a.R)} / ${n0(a.S)} / ${n0(a.T)} · N ${n0(a.N)}`;

// ── Kartu ───────────────────────────────────────────────────────────────────
export function KartuDataGardu({ d, gambar, dibuat }: { d: DataGardu; gambar: GambarBingkai; dibuat: string }) {
  const { gardu: g, beban: b, ujung, har } = d;
  const tinggi = tinggiDataGardu(d);
  const ub = b && b.arus.R !== null && b.arus.S !== null && b.arus.T !== null ? calcUnbalancePct(b.arus.R, b.arus.S, b.arus.T) : null;
  const harJurusan = har ? jurusanAktif(har.sesudah?.perjurusan ?? har.sebelum?.perjurusan ?? {}) : [];

  return (
    <div style={{ width: LEBAR, height: tinggi, display: "flex", flexDirection: "column", fontFamily: HURUF, color: C.tinta, background: "#F1F6FC" }}>
      {/* Kepala */}
      <div
        style={{
          height: T.header, display: "flex", alignItems: "center", padding: `0 ${PAD}px`, color: C.putih,
          background: `linear-gradient(120deg, ${C.navyTua} 0%, ${C.navy} 60%, ${C.biru} 100%)`,
        }}
      >
        <img src={gambar.logoPln} width={74} height={74} alt="" />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, opacity: 0.9 }}>DATA GARDU</div>
          <div style={{ fontFamily: HURUF_JUDUL, fontSize: 30, fontWeight: 700 }}>{`ULP ${g.ulp}`}</div>
        </div>
        <div style={{ marginLeft: "auto", fontFamily: HURUF_JUDUL, fontSize: 92, fontWeight: 800, color: C.kuning, lineHeight: 1 }}>{g.kode}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", padding: `0 ${PAD}px` }}>
        {/* Info master */}
        <div style={{ height: T.info, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 27, fontWeight: 700, lineClamp: 1, overflow: "hidden" }}>
            {potong([g.nama, g.alamat].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ") || "–", 62)}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              ["Penyulang", g.penyulang ?? "–"],
              ["Daya", g.kva_master ? `${n0(g.kva_master)} kVA` : "–"],
              ["Merk", g.merk ?? "–"],
              ["Koordinat", g.lat !== null && g.lng !== null ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : "–"],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", gap: 8, alignItems: "center", height: 44, padding: "0 16px", borderRadius: 22, background: C.putih, border: `1px solid ${C.garis}`, fontSize: 19 }}>
                <span style={{ color: C.tintaLembut, fontWeight: 600 }}>{l}</span>
                <span style={{ fontWeight: 800 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Beban puncak */}
        <Judul ikon="meter" teks="BEBAN PUNCAK" sub={b ? `pengukuran malam · ${tgl(b.tanggal)}${b.jam ? ` ${b.jam.replace(":", ".")}` : ""}` : "pengukuran malam"} warna={WARNA.beban} />
        {b ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ height: T.ringkas, display: "flex", gap: 14, paddingTop: 14 }}>
              <div style={{ width: 300, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 20px", borderRadius: 14, background: C.putih, border: `2px solid ${warnaBeban(b.persen)}` }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: C.tintaLembut }}>Beban trafo</div>
                <div style={{ fontFamily: HURUF_JUDUL, fontSize: 62, fontWeight: 800, color: warnaBeban(b.persen), lineHeight: 1 }}>{b.persen === null ? "–" : `${n1(b.persen)}%`}</div>
                <div style={{ display: "flex", height: 12, marginTop: 10, borderRadius: 6, background: C.garis }}>
                  <div style={{ width: `${Math.min(100, Math.max(0, b.persen ?? 0))}%`, height: 12, borderRadius: 6, background: warnaBeban(b.persen) }} />
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ flex: 1, display: "flex", gap: 10 }}>
                  <Tile label="Terpakai" nilai={`${n1(b.bebanKva)} / ${n0(b.kva)} kVA`} />
                  <Tile label="Suhu trafo" nilai={b.suhu === null ? "–" : `${n0(b.suhu)} °C`} warna={b.suhu !== null && b.suhu > 60 ? C.merah : undefined} />
                </div>
                <div style={{ flex: 1, display: "flex", gap: 10 }}>
                  <Tile label="Arus R / S / T · N (A)" nilai={teksArus(b.arus)} />
                  <Tile label="Unbalance" nilai={ub === null ? "–" : `${n1(ub)}%`} warna={ub !== null && ub > 20 ? C.oranye : undefined} />
                </div>
              </div>
            </div>
            <div style={{ height: T.meta, display: "flex", alignItems: "center", fontSize: 19, color: C.tintaLembut, fontWeight: 600 }}>
              {potong(`Tegangan R-N / S-N / T-N: ${n0(b.tegangan.RN)} / ${n0(b.tegangan.SN)} / ${n0(b.tegangan.TN)} V · petugas ${b.petugas?.replace(/\s+/g, " ") ?? "–"}`, 92)}
            </div>
            <div style={{ display: "flex", marginTop: T.celah }}>
              {jurusanAktif(b.perjurusan).length ? (
                <Tabel
                  kepala={["Jurusan", "R (A)", "S (A)", "T (A)", "N (A)", "Tegangan R/S/T (V)"]}
                  lebar={[140, 150, 150, 150, 140, ISI - 2 - 730]}
                  baris={barisJurusan(jurusanAktif(b.perjurusan))}
                  warna={WARNA.beban}
                />
              ) : <Kosong teks="Arus per jurusan tidak diisi pada pengukuran ini." />}
            </div>
          </div>
        ) : <Kosong teks="Belum pernah diukur beban puncaknya." />}

        {/* Tegangan ujung */}
        <Judul ikon="jalur" teks="TEGANGAN UJUNG" sub="terakhir per jurusan" warna={WARNA.ujung} />
        <div style={{ display: "flex", marginTop: ujung.length ? 0 : 0 }}>
          {ujung.length ? (
            <Tabel
              kepala={["Jurusan", "R-N", "S-N", "T-N", "Jarak", "Tanggal", "Status"]}
              lebar={bagi(7, 130)}
              baris={ujung.map((u) => {
                const w = u.bawahStandar ? C.merah : undefined;
                return [
                  { teks: u.jurusan, tebal: true },
                  { teks: n0(u.rn), warna: w, tebal: u.bawahStandar },
                  { teks: n0(u.sn), warna: w, tebal: u.bawahStandar },
                  { teks: n0(u.tn), warna: w, tebal: u.bawahStandar },
                  { teks: u.jarakM === null ? "–" : `${n0(u.jarakM)} m` },
                  { teks: tgl(u.tgl) },
                  { teks: u.bawahStandar ? "DROP" : u.status === "Disetujui" ? "Disetujui" : "Menunggu", warna: u.bawahStandar ? C.merah : u.status === "Disetujui" ? C.hijauTua : C.oranyeTua, tebal: true },
                ];
              })}
              warna={WARNA.ujung}
            />
          ) : <Kosong teks="Belum ada pengukuran tegangan ujung." />}
        </div>

        {/* Pemeliharaan */}
        <Judul ikon="kunciPas" teks="PEMELIHARAAN TERAKHIR" sub={har ? `pengukuran siang · ${tgl(har.tgl)}` : "pengukuran siang"} warna={WARNA.har} />
        {har ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ height: T.harInfo, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
              <div style={{ display: "flex", gap: 14, fontSize: 21, fontWeight: 700 }}>
                <span>{`Regu: ${har.regu ?? "–"}`}</span>
                <span style={{ color: har.status === "Disetujui" ? C.hijauTua : C.oranyeTua }}>{har.status}</span>
              </div>
              <div style={{ fontSize: 19, color: C.tintaLembut, fontWeight: 600, lineClamp: 1, overflow: "hidden" }}>{potong(`Catatan: ${har.catatan?.replace(/\s+/g, " ").trim() || "–"}`, 92)}</div>
            </div>
            <div style={{ display: "flex" }}>
              {har.sebelum || har.sesudah ? (
                <Tabel
                  kepala={["Arus total", "R (A)", "S (A)", "T (A)", "N (A)", "Tegangan R/S/T (V)"]}
                  lebar={[170, 140, 140, 140, 130, ISI - 2 - 720]}
                  baris={(["sebelum", "sesudah"] as const).filter((t) => har[t]).map((t) => {
                    const u = har[t]!;
                    return [
                      { teks: t === "sebelum" ? "Sebelum" : "Sesudah", tebal: true },
                      { teks: n0(u.arus.R) }, { teks: n0(u.arus.S) }, { teks: n0(u.arus.T) },
                      { teks: n0(u.arus.N), warna: C.tintaLembut },
                      { teks: `${n0(u.tegangan.RN)} / ${n0(u.tegangan.SN)} / ${n0(u.tegangan.TN)}` },
                    ];
                  })}
                  warna={WARNA.har}
                />
              ) : <Kosong teks="Pengukuran pemeliharaan tidak diisi." />}
            </div>
            <div style={{ display: "flex", marginTop: T.celah }}>
              {harJurusan.length ? (
                <Tabel
                  kepala={[har.sesudah ? "Jur. (sesudah)" : "Jur. (sebelum)", "R (A)", "S (A)", "T (A)", "N (A)", "Fuse R/S/T (A)"]}
                  lebar={[170, 140, 140, 140, 130, ISI - 2 - 720]}
                  baris={barisJurusan(harJurusan, (k) => {
                    const f = har.fuse?.[k];
                    return [{ teks: f && (f.R || f.S || f.T) ? `${f.R || "–"} / ${f.S || "–"} / ${f.T || "–"}` : "–" }];
                  })}
                  warna={WARNA.har}
                />
              ) : <Kosong teks="Arus per jurusan pemeliharaan tidak diisi." />}
            </div>
            <div style={{ height: T.tanah, marginTop: T.celah, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.tintaLembut }}>Pentanahan</div>
              {(() => {
                const p = (har.sesudah ?? har.sebelum)?.pentanahan;
                return ([["Arrester", p?.arrester], ["Trafo", p?.trafo], ["Netral", p?.netral]] as const).map(([l, v]) => (
                  <div key={l} style={{ display: "flex", gap: 8, alignItems: "center", height: 46, padding: "0 18px", borderRadius: 23, background: C.putih, border: `1px solid ${C.garis}`, fontSize: 20 }}>
                    <span style={{ color: C.tintaLembut, fontWeight: 600 }}>{l}</span>
                    <span style={{ fontWeight: 800, color: v != null && v > 5 ? C.merah : C.tinta }}>{v == null ? "–" : `${n1(v)} Ω`}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        ) : <Kosong teks="Belum ada pemeliharaan gardu yang dikirim." />}
      </div>

      {/* Kaki */}
      <div
        style={{
          marginTop: "auto", height: T.footer, display: "flex", alignItems: "center", gap: 14, padding: `0 ${PAD}px`, color: C.putih,
          background: `linear-gradient(90deg, ${C.navyTua} 0%, ${C.navy} 100%)`,
        }}
      >
        <img src={gambar.logoSmart} width={52} height={52} alt="" />
        <div style={{ fontSize: 24, fontWeight: 800 }}>SMART Mataram</div>
        <div style={{ marginLeft: "auto", fontSize: 18, fontWeight: 600, opacity: 0.85 }}>{`dibuat ${dibuat} WITA`}</div>
      </div>
    </div>
  );
}

