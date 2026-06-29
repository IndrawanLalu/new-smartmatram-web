import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { PetugasRow } from "./_hooks/useRekapProduktivitas";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  rows: PetugasRow[];
  daysInMonth: number;
  periodeLabel: string; // "Juni 2026"
  eksekutor: string;
  ulpLabel: string; // "Semua ULP" | "TANJUNG"
}

// ── Layout ────────────────────────────────────────────────────────────────────

// A4 landscape 842×595, margin 24pt each
const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 24;
const INNER_W = PAGE_W - MARGIN * 2; // 794
const INNER_H = PAGE_H - MARGIN * 2; // 547

const COL_NO = 18;
const COL_NAMA = 116;
const COL_TOTAL = 32;

const HDR_H = 36;
const TH_H = 16;
const AVAIL_H = INNER_H - HDR_H - TH_H;

function calcRowH(numRows: number): number {
  const h = AVAIL_H / (numRows + 1); // +1 untuk baris total
  return Math.max(8, Math.min(16, h));
}

function cellColor(count: number): { bg: string; color: string } {
  if (count <= 0) return { bg: "transparent", color: "#cbd5e1" };
  if (count === 1) return { bg: "#ccfbf1", color: "#0f766e" };
  if (count === 2) return { bg: "#5eead4", color: "#134e4a" };
  return { bg: "#0d9488", color: "#ffffff" };
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(rowH: number, dayW: number) {
  const fs = Math.max(5, rowH * 0.6);
  const dayFs = Math.max(4.5, Math.min(fs, dayW * 0.42));
  const hfs = Math.max(5, TH_H * 0.5);

  return StyleSheet.create({
    page: { padding: MARGIN, fontFamily: "Helvetica", backgroundColor: "#ffffff" },
    hdrBlock: { marginBottom: 6 },
    title: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#004D40" },
    subtitle: { fontSize: 7.5, color: "#64748b", marginTop: 2 },

    thRow: {
      flexDirection: "row",
      height: TH_H,
      backgroundColor: "#E0F2F1",
      borderBottomWidth: 1,
      borderBottomColor: "#99d6ce",
      alignItems: "center",
    },
    thCell: { fontSize: hfs, fontFamily: "Helvetica-Bold", color: "#00695C" },

    row: {
      flexDirection: "row",
      height: rowH,
      borderBottomWidth: 0.4,
      borderBottomColor: "#E2E8F0",
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

    cellNo: { fontSize: fs, color: "#94a3b8" },
    cellName: { fontSize: fs, fontFamily: "Helvetica-Bold", color: "#1B2631" },
    cellTotal: { fontSize: fs, fontFamily: "Helvetica-Bold", color: "#00695C" },
    cellTotalLabel: { fontSize: fs, fontFamily: "Helvetica-Bold", color: "#1B2631" },
    dayFs: { fontSize: dayFs, fontFamily: "Helvetica-Bold" },
  });
}

// ── Cell wrapper ──────────────────────────────────────────────────────────────

function C({
  w,
  align = "flex-start",
  bg,
  children,
}: {
  w: number;
  align?: "flex-start" | "center" | "flex-end";
  bg?: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: w,
        height: "100%",
        paddingHorizontal: 2,
        alignItems: align,
        justifyContent: "center",
        backgroundColor: bg ?? "transparent",
      }}
    >
      {children}
    </View>
  );
}

// ── Document ──────────────────────────────────────────────────────────────────

export default function RekapPdfDoc({
  rows,
  daysInMonth,
  periodeLabel,
  eksekutor,
  ulpLabel,
}: Props) {
  const rowH = calcRowH(rows.length);
  const dayW = (INNER_W - COL_NO - COL_NAMA - COL_TOTAL) / daysInMonth;
  const s = makeStyles(rowH, dayW);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const dayTotals = days.map((d) => rows.reduce((a, r) => a + (r.days[d] ?? 0), 0));
  const grandTotal = rows.reduce((a, r) => a + r.total, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        {/* Header */}
        <View style={s.hdrBlock}>
          <Text style={s.title}>SMART MATARAM — REKAP PRODUKTIVITAS PETUGAS</Text>
          <Text style={s.subtitle}>
            {periodeLabel} · {eksekutor} · {ulpLabel} · {rows.length} petugas ·{" "}
            {grandTotal} pekerjaan
          </Text>
        </View>

        {/* Table header */}
        <View style={s.thRow}>
          <C w={COL_NO} align="flex-end">
            <Text style={s.thCell}>#</Text>
          </C>
          <C w={COL_NAMA}>
            <Text style={s.thCell}>Nama Petugas</Text>
          </C>
          {days.map((d) => (
            <C key={d} w={dayW} align="center">
              <Text style={s.thCell}>{d}</Text>
            </C>
          ))}
          <C w={COL_TOTAL} align="center">
            <Text style={s.thCell}>Tot</Text>
          </C>
        </View>

        {/* Data rows */}
        {rows.map((row, i) => (
          <View key={row.team_name} style={s.row}>
            <C w={COL_NO} align="flex-end">
              <Text style={s.cellNo}>{i + 1}</Text>
            </C>
            <C w={COL_NAMA}>
              <Text style={s.cellName}>{row.team_name}</Text>
            </C>
            {days.map((d) => {
              const cnt = row.days[d] ?? 0;
              const cc = cellColor(cnt);
              return (
                <C key={d} w={dayW} align="center" bg={cc.bg}>
                  {cnt > 0 ? (
                    <Text style={[s.dayFs, { color: cc.color }]}>{cnt}</Text>
                  ) : (
                    <Text style={{ fontSize: 4.5, color: "#e2e8f0" }}>·</Text>
                  )}
                </C>
              );
            })}
            <C w={COL_TOTAL} align="center">
              <Text style={s.cellTotal}>{row.total}</Text>
            </C>
          </View>
        ))}

        {/* Total row */}
        <View style={s.rowTotal}>
          <C w={COL_NO} />
          <C w={COL_NAMA}>
            <Text style={s.cellTotalLabel}>TOTAL</Text>
          </C>
          {dayTotals.map((t, i) => (
            <C key={i} w={dayW} align="center">
              <Text style={[s.dayFs, { color: t > 0 ? "#1B2631" : "#cbd5e1" }]}>
                {t > 0 ? t : ""}
              </Text>
            </C>
          ))}
          <C w={COL_TOTAL} align="center">
            <Text style={[s.cellTotal, { color: "#004D40" }]}>{grandTotal}</Text>
          </C>
        </View>
      </Page>
    </Document>
  );
}
