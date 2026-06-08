import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Svg,
  Path,
} from "@react-pdf/renderer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfStat {
  petugas: string;
  totalWO: number;
  r: [number, number, number, number, number, number];
  avgRating: number | null;
}

export interface PdfGrandTotal {
  totalWO: number;
  rTotals: number[];
  avgRating: number | null;
}

interface Props {
  stats: PdfStat[];
  grandTotal: PdfGrandTotal;
  dateLabel: string;
  filterLabel: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STAR_COLOR = ["", "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d"];

// Usable area: A4 landscape 842×595, margins 28pt each
const PAGE_H = 595;
const MARGIN = 28;
const INNER_H = PAGE_H - MARGIN * 2; // 539

const COL = {
  no: 22,
  nama: 195,
  total: 55,
  star: 60, // ★1–★5 each (5 × 60 = 300)
  avg: 52,
} as const;
// Total: 22+195+55+300+52 = 624 — leaves room

const HDR_H = 38; // title block
const TH_H = 16; // table header row
const AVAIL_H = INNER_H - HDR_H - TH_H; // rows budget

function calcRowH(numRows: number): number {
  const h = AVAIL_H / (numRows + 1); // +1 for total row
  return Math.max(8.5, Math.min(18, h));
}

// ── Styles factory ────────────────────────────────────────────────────────────

function makeStyles(rowH: number) {
  const fs = Math.max(5.5, rowH * 0.62);
  const hfs = Math.max(6, TH_H * 0.55);
  const titleFs = 13;

  return StyleSheet.create({
    page: {
      padding: MARGIN,
      fontFamily: "Helvetica",
      backgroundColor: "#ffffff",
    },
    // ── header ──
    hdrBlock: { marginBottom: 6 },
    title: {
      fontSize: titleFs,
      fontFamily: "Helvetica-Bold",
      color: "#004D40",
    },
    subtitle: { fontSize: 8, color: "#64748b", marginTop: 2 },
    // ── table header row ──
    thRow: {
      flexDirection: "row",
      height: TH_H,
      backgroundColor: "#E0F2F1",
      borderBottomWidth: 1,
      borderBottomColor: "#99d6ce",
      alignItems: "center",
    },
    thCell: { fontSize: hfs, fontFamily: "Helvetica-Bold", color: "#00695C" },
    // ── data rows ──
    row: {
      flexDirection: "row",
      height: rowH,
      borderBottomWidth: 0.4,
      borderBottomColor: "#E2E8F0",
      alignItems: "center",
    },
    rowWarn: {
      flexDirection: "row",
      height: rowH,
      borderBottomWidth: 0.4,
      borderBottomColor: "#fecaca",
      backgroundColor: "#fff5f5",
      alignItems: "center",
    },
    rowTotal: {
      flexDirection: "row",
      height: rowH,
      borderTopWidth: 1,
      borderTopColor: "#94a3b8",
      backgroundColor: "#F1F5F9",
      alignItems: "center",
    },
    // ── cell text styles ──
    cellNo: { fontSize: fs, color: "#94a3b8" },
    cellName: { fontSize: fs, fontFamily: "Helvetica-Bold", color: "#1B2631" },
    cellWarnName: {
      fontSize: fs,
      fontFamily: "Helvetica-Bold",
      color: "#991b1b",
    },
    cellBold: { fontSize: fs, fontFamily: "Helvetica-Bold", color: "#1B2631" },
    cellDim: { fontSize: fs, color: "#cbd5e1" },
    cellTotalLabel: {
      fontSize: fs,
      fontFamily: "Helvetica-Bold",
      color: "#1B2631",
    },
  });
}

// ── Cell wrapper ──────────────────────────────────────────────────────────────

function C({
  w,
  align = "flex-start",
  children,
}: {
  w: number;
  align?: "flex-start" | "center" | "flex-end";
  children?: React.ReactNode;
}) {
  return (
    <View style={{ width: w, paddingHorizontal: 4, alignItems: align }}>
      {children}
    </View>
  );
}

// ── Document ──────────────────────────────────────────────────────────────────

export default function YantekPdfDoc({
  stats,
  grandTotal,
  dateLabel,
  filterLabel,
}: Props) {
  const rowH = calcRowH(stats.length);
  const s = makeStyles(rowH);
  const fs = Math.max(5.5, rowH * 0.62);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        {/* Header */}
        <View style={s.hdrBlock}>
          <Text style={s.title}>
            SMART MATARAM-REKAP ANALYSIS RATING YANTEK
          </Text>
          <Text style={s.subtitle}>
            {dateLabel} · {filterLabel} · {stats.length} petugas ·{" "}
            {grandTotal.totalWO} WO
          </Text>
        </View>

        {/* Table header */}
        <View style={s.thRow}>
          <C w={COL.no} align="flex-end">
            <Text style={s.thCell}>#</Text>
          </C>
          <C w={COL.nama}>
            <Text style={s.thCell}>Nama Petugas</Text>
          </C>
          <C w={COL.total} align="center">
            <Text style={s.thCell}>Total WO</Text>
          </C>
          {[1, 2, 3, 4, 5].map((n) => (
            <C key={n} w={COL.star} align="center">
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
              >
                <Svg width={8} height={8} viewBox="0 0 24 24">
                  <Path
                    d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                    fill={STAR_COLOR[n]}
                  />
                </Svg>
                <Text style={[s.thCell, { color: STAR_COLOR[n] }]}>{n}</Text>
              </View>
            </C>
          ))}
          <C w={COL.avg} align="center">
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
            >
              <Svg width={8} height={8} viewBox="0 0 24 24">
                <Path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill="#00897B"
                />
              </Svg>
              <Text style={s.thCell}>Avg</Text>
            </View>
          </C>
        </View>

        {/* Data rows */}
        {stats.map((row, i) => {
          const isWarn = row.r[1] > 0 || row.r[2] > 0;
          return (
            <View key={row.petugas} style={isWarn ? s.rowWarn : s.row}>
              <C w={COL.no} align="flex-end">
                <Text style={s.cellNo}>{i + 1}</Text>
              </C>
              <C w={COL.nama}>
                <Text style={isWarn ? s.cellWarnName : s.cellName}>
                  {row.petugas}
                </Text>
              </C>
              <C w={COL.total} align="center">
                <Text style={s.cellBold}>{row.totalWO}</Text>
              </C>
              {[1, 2, 3, 4, 5].map((si) => {
                const cnt = row.r[si];
                const pct =
                  row.totalWO > 0 ? Math.round((cnt / row.totalWO) * 100) : 0;
                return (
                  <C key={si} w={COL.star} align="center">
                    {cnt > 0 ? (
                      <Text
                        style={{
                          fontSize: fs,
                          fontFamily: "Helvetica-Bold",
                          color: STAR_COLOR[si],
                        }}
                      >
                        {cnt} · {pct}%
                      </Text>
                    ) : (
                      <Text style={s.cellDim}>—</Text>
                    )}
                  </C>
                );
              })}
              <C w={COL.avg} align="center">
                {row.avgRating !== null ? (
                  <Text
                    style={{
                      fontSize: fs,
                      fontFamily: "Helvetica-Bold",
                      color:
                        row.avgRating >= 4.5
                          ? "#059669"
                          : row.avgRating >= 3.5
                            ? "#65a30d"
                            : row.avgRating >= 2.5
                              ? "#d97706"
                              : "#dc2626",
                    }}
                  >
                    {row.avgRating.toFixed(2)}
                  </Text>
                ) : (
                  <Text style={s.cellDim}>—</Text>
                )}
              </C>
            </View>
          );
        })}

        {/* Total row */}
        <View style={s.rowTotal}>
          <C w={COL.no} />
          <C w={COL.nama}>
            <Text style={s.cellTotalLabel}>TOTAL</Text>
          </C>
          <C w={COL.total} align="center">
            <Text style={s.cellBold}>{grandTotal.totalWO}</Text>
          </C>
          {[1, 2, 3, 4, 5].map((si) => {
            const cnt = grandTotal.rTotals[si] ?? 0;
            const pct = grandTotal.totalWO > 0
              ? ((cnt / grandTotal.totalWO) * 100).toFixed(1)
              : "0.0";
            return (
              <C key={si} w={COL.star} align="center">
                {cnt > 0 ? (
                  <Text
                    style={{
                      fontSize: fs,
                      fontFamily: "Helvetica-Bold",
                      color: STAR_COLOR[si],
                    }}
                  >
                    {cnt} · {pct}%
                  </Text>
                ) : (
                  <Text style={s.cellDim}>—</Text>
                )}
              </C>
            );
          })}
          <C w={COL.avg} align="center">
            {grandTotal.avgRating !== null ? (
              <Text style={[s.cellBold, { color: "#004D40" }]}>
                {grandTotal.avgRating.toFixed(2)}
              </Text>
            ) : (
              <Text style={s.cellDim}>—</Text>
            )}
          </C>
        </View>
      </Page>
    </Document>
  );
}
