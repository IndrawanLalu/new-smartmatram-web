import { Document, Page, View, Text, StyleSheet, Svg, Path, Rect, Line } from "@react-pdf/renderer";

/**
 * Laporan Yantek — satu berkas, TIGA halaman:
 *   1. Ringkasan: kartu SLA + grafik harian RPT & RCT
 *   2. Detail durasi per petugas (RPT/RCT + pelanggaran)
 *   3. Rating per petugas (★1–★5)
 *
 * Dipisah per halaman atas permintaan user: satu halaman padat berisi tiga
 * hal berbeda sulit dibaca saat dicetak, dan tiap halaman punya pembacanya
 * sendiri. Branding teal dipertahankan — navy bahasa layar, teal identitas cetak.
 */

// ── Tipe ──────────────────────────────────────────────────────────────────────

export interface PdfStat {
  petugas: string;
  totalWO: number;
  r: [number, number, number, number, number, number];
  avgRating: number | null;
  medRpt: number;
  medRct: number;
  lewatRpt: number;
  lewatRct: number;
  /** Hari BERTUGAS petugas ini — penyebut WO/Hari. */
  hariAktif: number;
  rataPerHari: number;
}

export interface PdfGrandTotal {
  totalWO: number;
  rTotals: number[];
  avgRating: number | null;
}

export interface PdfChartPoint {
  label: string;
  rpt: number | null;
  rct: number | null;
}

interface Props {
  stats: PdfStat[];
  grandTotal: PdfGrandTotal;
  dateLabel: string;
  filterLabel: string;
  sla: { response: number; recovery: number };
  /** Median per hari dalam bulan — sumber grafik. */
  chart: PdfChartPoint[];
  ringkas: { medRpt: number; medRct: number; patuhRpt: number; patuhRct: number };
  /** Penyebut "WO per hari": tanggal yang benar-benar ada datanya. */
  hariRentang: number;
}

// ── Konstanta ─────────────────────────────────────────────────────────────────

const STAR_COLOR = ["", "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d"];
const TEAL_DEEP = "#004D40";
const TEAL = "#00695C";
const TEAL_TINT = "#E0F2F1";
const MERAH = "#dc2626";
const ABU = "#64748b";

// A4 lanskap 842×595, margin 24 → lebar pakai 794.
// Kolom dilonggarkan karena rating dan durasi tidak lagi berbagi satu halaman.
const COL_DUR = { no: 26, nama: 210, total: 52, perhari: 56, rpt: 60, rct: 60, lwrpt: 62, lwrct: 62 } as const;
const COL_RAT = { no: 26, nama: 230, total: 56, star: 56, avg: 60 } as const;

const CHART_W = 372;
const CHART_H = 150;

const s = StyleSheet.create({
  page: { padding: 24, fontFamily: "Helvetica", backgroundColor: "#ffffff" },

  title: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: TEAL_DEEP },
  sub: { fontSize: 7.5, color: ABU, marginTop: 2 },

  slaBox: {
    marginTop: 6, marginBottom: 7, flexDirection: "row",
    borderWidth: 1, borderColor: TEAL, borderRadius: 3,
    backgroundColor: TEAL_TINT, paddingVertical: 4, paddingHorizontal: 8,
  },
  slaItem: { marginRight: 22 },
  slaLabel: { fontSize: 6, color: TEAL, fontFamily: "Helvetica-Bold" },
  slaVal: { fontSize: 9, color: TEAL_DEEP, fontFamily: "Helvetica-Bold" },
  slaValMerah: { fontSize: 9, color: MERAH, fontFamily: "Helvetica-Bold" },

  /** Kartu ringkasan halaman 1 — versi cetak dari StatTile di layar. */
  kartuRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  kartu: {
    flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 4,
    paddingVertical: 8, paddingHorizontal: 10,
  },
  kartuLabel: { fontSize: 6.5, color: ABU, fontFamily: "Helvetica-Bold" },
  kartuNilai: { fontSize: 17, fontFamily: "Helvetica-Bold", color: TEAL_DEEP, marginTop: 3 },
  kartuNilaiMerah: { fontSize: 17, fontFamily: "Helvetica-Bold", color: MERAH, marginTop: 3 },
  kartuKaki: { fontSize: 6, color: ABU, marginTop: 2 },

  chartRow: { flexDirection: "row", gap: 18, marginBottom: 8 },
  chartJudul: { fontSize: 8, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 3 },
  chartKaki: { fontSize: 6, color: ABU, marginTop: 2 },

  seksiJudul: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: TEAL_DEEP, marginBottom: 5 },

  thRow: {
    flexDirection: "row", height: 15, backgroundColor: TEAL_TINT,
    borderBottomWidth: 1, borderBottomColor: "#99d6ce", alignItems: "center",
  },
  th: { fontSize: 6, fontFamily: "Helvetica-Bold", color: TEAL },

  tr: { flexDirection: "row", height: 12.5, borderBottomWidth: 0.4, borderBottomColor: "#E2E8F0", alignItems: "center" },
  trWarn: { flexDirection: "row", height: 12.5, borderBottomWidth: 0.4, borderBottomColor: "#fecaca", backgroundColor: "#fff5f5", alignItems: "center" },
  trTotal: { flexDirection: "row", height: 14, borderTopWidth: 1, borderTopColor: "#94a3b8", backgroundColor: "#F1F5F9", alignItems: "center" },

  cNo: { fontSize: 6, color: "#94a3b8" },
  cNama: { fontSize: 6.2, fontFamily: "Helvetica-Bold", color: "#1B2631" },
  cNamaWarn: { fontSize: 6.2, fontFamily: "Helvetica-Bold", color: "#991b1b" },
  cBold: { fontSize: 6.2, fontFamily: "Helvetica-Bold", color: "#1B2631" },
  cMerah: { fontSize: 6.2, fontFamily: "Helvetica-Bold", color: MERAH },
  cDim: { fontSize: 6, color: "#cbd5e1" },

  halaman: { position: "absolute", bottom: 12, right: 24, fontSize: 6, color: ABU },
});

function C({ w, align = "flex-start", children }: {
  w: number; align?: "flex-start" | "center" | "flex-end"; children?: React.ReactNode;
}) {
  return <View style={{ width: w, paddingHorizontal: 3, alignItems: align }}>{children}</View>;
}

/**
 * Grafik batang harian digambar manual dengan primitif SVG — @react-pdf tidak
 * punya kanvas, jadi Recharts tidak bisa dipakai di sini. Cukup untuk maksudnya:
 * melihat hari mana yang menonjol dan seberapa jauh dari ambang.
 */
function MiniChart({ judul, data, target, warna }: {
  judul: string;
  data: { label: string; nilai: number | null }[];
  target: number;
  warna: string;
}) {
  const nilai = data.map((d) => d.nilai ?? 0);
  const maks = Math.max(target * 1.25, ...nilai, 1);
  const skala = (v: number) => (v / maks) * CHART_H;
  const lebarBar = CHART_W / Math.max(data.length, 1);
  const yTarget = CHART_H - skala(target);

  return (
    <View>
      <Text style={s.chartJudul}>{judul} — median per hari (menit)</Text>
      <Svg width={CHART_W} height={CHART_H + 10}>
        <Line x1={0} y1={CHART_H} x2={CHART_W} y2={CHART_H} stroke="#cbd5e1" strokeWidth={0.5} />
        {data.map((d, i) => {
          if (d.nilai === null) return null;
          const h = skala(d.nilai);
          const langgar = d.nilai > target;
          return (
            <Rect
              key={i}
              x={i * lebarBar + lebarBar * 0.18}
              y={CHART_H - h}
              width={lebarBar * 0.64}
              height={h}
              fill={langgar ? MERAH : warna}
              fillOpacity={langgar ? 0.85 : 0.6}
            />
          );
        })}
        {/* Garis ambang SLA */}
        <Line x1={0} y1={yTarget} x2={CHART_W} y2={yTarget} stroke={MERAH} strokeWidth={0.9} strokeDasharray="3 2" />
      </Svg>
      <Text style={s.chartKaki}>
        Garis putus-putus = ambang {target} menit · batang merah melewati ambang · tanggal 1–{data.length}
      </Text>
    </View>
  );
}

const num = (v: number) => String(Math.round(v));
const pct = (v: number) => `${v.toFixed(1)}%`;


/** Kartu angka versi cetak — cerminan StatTile di layar. */
function Kartu({ label, nilai, kaki, merah }: {
  label: string; nilai: string; kaki?: string; merah?: boolean;
}) {
  return (
    <View style={s.kartu}>
      <Text style={s.kartuLabel}>{label}</Text>
      <Text style={merah ? s.kartuNilaiMerah : s.kartuNilai}>{nilai}</Text>
      {kaki ? <Text style={s.kartuKaki}>{kaki}</Text> : null}
    </View>
  );
}

/** Kepala halaman — diulang di tiap halaman supaya lembar yang tercecer tetap
 *  bisa dikenali periodenya. */
function Kepala({ judul, dateLabel, filterLabel, jmlPetugas, totalWO }: {
  judul: string; dateLabel: string; filterLabel: string; jmlPetugas: number; totalWO: number;
}) {
  return (
    <View>
      <Text style={s.title}>{judul}</Text>
      <Text style={s.sub}>
        {dateLabel} · {filterLabel} · {jmlPetugas} petugas · {totalWO} WO · Dicetak{" "}
        {new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
      </Text>
    </View>
  );
}

export default function YantekPdfDoc({
  stats, grandTotal, dateLabel, filterLabel, sla, chart, ringkas, hariRentang,
}: Props) {
  const totalLewatRpt = stats.reduce((a, x) => a + x.lewatRpt, 0);
  const totalLewatRct = stats.reduce((a, x) => a + x.lewatRct, 0);
  const perHari = (n: number) => (hariRentang > 0 ? (n / hariRentang).toFixed(1) : "—");

  // Halaman rating diurutkan dari bintang 5 terbanyak, halaman durasi dari
  // pelanggaran terbanyak — dua halaman menjawab dua pertanyaan berbeda.
  const statsRating = [...stats].sort((a, b) => b.r[5] - a.r[5] || b.totalWO - a.totalWO);

  return (
    <Document>
      {/* ── Halaman 1: ringkasan SLA + grafik ── */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Kepala
          judul="SMART MATARAM - REKAP YANTEK: RINGKASAN SLA"
          dateLabel={dateLabel} filterLabel={filterLabel}
          jmlPetugas={stats.length} totalWO={grandTotal.totalWO}
        />

        <View style={s.slaBox}>
          <View style={s.slaItem}>
            <Text style={s.slaLabel}>AMBANG SLA RPT</Text>
            <Text style={s.slaVal}>{sla.response} mnt</Text>
          </View>
          <View style={s.slaItem}>
            <Text style={s.slaLabel}>AMBANG SLA RCT</Text>
            <Text style={s.slaVal}>{sla.recovery} mnt</Text>
          </View>
          <View style={s.slaItem}>
            <Text style={s.slaLabel}>RATA-RATA WO / HARI</Text>
            <Text style={s.slaVal}>{perHari(grandTotal.totalWO)}</Text>
          </View>
          <View style={s.slaItem}>
            <Text style={s.slaLabel}>HARI BERDATA</Text>
            <Text style={s.slaVal}>{hariRentang}</Text>
          </View>
          <View style={s.slaItem}>
            <Text style={s.slaLabel}>WO LEWAT SLA</Text>
            <Text style={s.slaValMerah}>{totalLewatRpt} RPT · {totalLewatRct} RCT</Text>
          </View>
        </View>

        <View style={s.kartuRow}>
          <Kartu
            label="MEDIAN RESPONSE TIME" nilai={`${num(ringkas.medRpt)} mnt`}
            kaki={`ambang ${sla.response} mnt`} merah={ringkas.medRpt > sla.response}
          />
          <Kartu
            label="MEMENUHI SLA RESPONSE" nilai={pct(ringkas.patuhRpt)}
            kaki={`${totalLewatRpt} WO melewati ambang`} merah={ringkas.patuhRpt < 80}
          />
          <Kartu
            label="MEDIAN RECOVERY TIME" nilai={`${num(ringkas.medRct)} mnt`}
            kaki={`ambang ${sla.recovery} mnt`} merah={ringkas.medRct > sla.recovery}
          />
          <Kartu
            label="MEMENUHI SLA RECOVERY" nilai={pct(ringkas.patuhRct)}
            kaki={`${totalLewatRct} WO melewati ambang`} merah={ringkas.patuhRct < 80}
          />
        </View>

        {chart.length > 0 && (
          <View style={s.chartRow}>
            <MiniChart
              judul="Response Time"
              data={chart.map((c) => ({ label: c.label, nilai: c.rpt }))}
              target={sla.response}
              warna="#2563EB"
            />
            <MiniChart
              judul="Recovery Time"
              data={chart.map((c) => ({ label: c.label, nilai: c.rct }))}
              target={sla.recovery}
              warna="#0D9488"
            />
          </View>
        )}

        <Text style={s.halaman} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── Halaman 2: durasi per petugas ── */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Kepala
          judul="DETAIL RESPONSE & RECOVERY TIME PER PETUGAS"
          dateLabel={dateLabel} filterLabel={filterLabel}
          jmlPetugas={stats.length} totalWO={grandTotal.totalWO}
        />
        <Text style={s.seksiJudul}>
          Ambang SLA: RPT {sla.response} mnt · RCT {sla.recovery} mnt — angka merah melewati ambang ·
          WO/Hari dihitung per hari bertugas masing-masing petugas
        </Text>

        <View style={s.thRow} fixed>
          <C w={COL_DUR.no} align="flex-end"><Text style={s.th}>#</Text></C>
          <C w={COL_DUR.nama}><Text style={s.th}>Nama Petugas</Text></C>
          <C w={COL_DUR.total} align="center"><Text style={s.th}>Total WO</Text></C>
          <C w={COL_DUR.perhari} align="center"><Text style={s.th}>WO / Hari</Text></C>
          <C w={COL_DUR.rpt} align="center"><Text style={s.th}>Median RPT</Text></C>
          <C w={COL_DUR.rct} align="center"><Text style={s.th}>Median RCT</Text></C>
          <C w={COL_DUR.lwrpt} align="center"><Text style={s.th}>Lewat RPT</Text></C>
          <C w={COL_DUR.lwrct} align="center"><Text style={s.th}>Lewat RCT</Text></C>
        </View>

        {stats.map((x, i) => {
          const warn = x.lewatRpt > 0 || x.lewatRct > 0;
          return (
            <View key={x.petugas} style={warn ? s.trWarn : s.tr} wrap={false}>
              <C w={COL_DUR.no} align="flex-end"><Text style={s.cNo}>{i + 1}</Text></C>
              <C w={COL_DUR.nama}><Text style={warn ? s.cNamaWarn : s.cNama}>{x.petugas}</Text></C>
              <C w={COL_DUR.total} align="center"><Text style={s.cBold}>{x.totalWO}</Text></C>
              <C w={COL_DUR.perhari} align="center">
                <Text style={s.cNo}>{x.hariAktif > 0 ? x.rataPerHari.toFixed(1) : "—"}</Text>
              </C>
              <C w={COL_DUR.rpt} align="center">
                <Text style={x.medRpt > sla.response ? s.cMerah : s.cBold}>{num(x.medRpt)}</Text>
              </C>
              <C w={COL_DUR.rct} align="center">
                <Text style={x.medRct > sla.recovery ? s.cMerah : s.cBold}>{num(x.medRct)}</Text>
              </C>
              <C w={COL_DUR.lwrpt} align="center">
                {x.lewatRpt > 0 ? <Text style={s.cMerah}>{x.lewatRpt}</Text> : <Text style={s.cDim}>—</Text>}
              </C>
              <C w={COL_DUR.lwrct} align="center">
                {x.lewatRct > 0 ? <Text style={s.cMerah}>{x.lewatRct}</Text> : <Text style={s.cDim}>—</Text>}
              </C>
            </View>
          );
        })}

        <View style={s.trTotal} wrap={false}>
          <C w={COL_DUR.no} />
          <C w={COL_DUR.nama}><Text style={s.cBold}>TOTAL</Text></C>
          <C w={COL_DUR.total} align="center"><Text style={s.cBold}>{grandTotal.totalWO}</Text></C>
          {/* Sengaja kosong: baris per petugas dibagi hari bertugas masing-masing,
              sedangkan angka tingkat unit dibagi rentang periode. Menaruh keduanya
              di kolom yang sama membuatnya terbaca sebagai penjumlahan, padahal
              bukan. Angka unit ada di kotak ringkasan halaman 1. */}
          <C w={COL_DUR.perhari} align="center"><Text style={s.cDim}>—</Text></C>
          <C w={COL_DUR.rpt} align="center"><Text style={s.cBold}>{num(ringkas.medRpt)}</Text></C>
          <C w={COL_DUR.rct} align="center"><Text style={s.cBold}>{num(ringkas.medRct)}</Text></C>
          <C w={COL_DUR.lwrpt} align="center"><Text style={s.cMerah}>{totalLewatRpt}</Text></C>
          <C w={COL_DUR.lwrct} align="center"><Text style={s.cMerah}>{totalLewatRct}</Text></C>
        </View>

        <Text style={s.halaman} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── Halaman 3: rating ── */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Kepala
          judul="REKAP RATING YANTEK PER PETUGAS"
          dateLabel={dateLabel} filterLabel={filterLabel}
          jmlPetugas={stats.length} totalWO={grandTotal.totalWO}
        />
        <Text style={s.seksiJudul}>
          Diurutkan dari bintang 5 terbanyak — baris bertanda merah punya rating 1 atau 2 bintang
        </Text>

        <View style={s.thRow} fixed>
          <C w={COL_RAT.no} align="flex-end"><Text style={s.th}>#</Text></C>
          <C w={COL_RAT.nama}><Text style={s.th}>Nama Petugas</Text></C>
          <C w={COL_RAT.total} align="center"><Text style={s.th}>Total WO</Text></C>
          {[1, 2, 3, 4, 5].map((n) => (
            <C key={n} w={COL_RAT.star} align="center">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Svg width={7} height={7} viewBox="0 0 24 24">
                  <Path
                    d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                    fill={STAR_COLOR[n]}
                  />
                </Svg>
                <Text style={[s.th, { color: STAR_COLOR[n] }]}>{n}</Text>
              </View>
            </C>
          ))}
          <C w={COL_RAT.avg} align="center"><Text style={s.th}>Rata-rata</Text></C>
        </View>

        {statsRating.map((x, i) => {
          const warn = x.r[1] > 0 || x.r[2] > 0;
          return (
            <View key={x.petugas} style={warn ? s.trWarn : s.tr} wrap={false}>
              <C w={COL_RAT.no} align="flex-end"><Text style={s.cNo}>{i + 1}</Text></C>
              <C w={COL_RAT.nama}><Text style={warn ? s.cNamaWarn : s.cNama}>{x.petugas}</Text></C>
              <C w={COL_RAT.total} align="center"><Text style={s.cBold}>{x.totalWO}</Text></C>
              {[1, 2, 3, 4, 5].map((n) => (
                <C key={n} w={COL_RAT.star} align="center">
                  {x.r[n] > 0
                    ? <Text style={[s.cBold, { color: STAR_COLOR[n] }]}>{x.r[n]}</Text>
                    : <Text style={s.cDim}>—</Text>}
                </C>
              ))}
              <C w={COL_RAT.avg} align="center">
                {x.avgRating !== null
                  ? <Text style={s.cBold}>{x.avgRating.toFixed(2)}</Text>
                  : <Text style={s.cDim}>—</Text>}
              </C>
            </View>
          );
        })}

        <View style={s.trTotal} wrap={false}>
          <C w={COL_RAT.no} />
          <C w={COL_RAT.nama}><Text style={s.cBold}>TOTAL</Text></C>
          <C w={COL_RAT.total} align="center"><Text style={s.cBold}>{grandTotal.totalWO}</Text></C>
          {[1, 2, 3, 4, 5].map((n) => (
            <C key={n} w={COL_RAT.star} align="center">
              <Text style={[s.cBold, { color: STAR_COLOR[n] }]}>{grandTotal.rTotals[n]}</Text>
            </C>
          ))}
          <C w={COL_RAT.avg} align="center">
            <Text style={s.cBold}>{grandTotal.avgRating !== null ? grandTotal.avgRating.toFixed(2) : "—"}</Text>
          </C>
        </View>

        <Text style={s.halaman} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
