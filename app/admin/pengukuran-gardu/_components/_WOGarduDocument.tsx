// WO Gardu Document — hanya di-import secara dynamic (client-side only)
// @react-pdf/renderer tidak support SSR

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  type PengukuranGardu,
  HIGH_CURRENT_A,
  HIGH_TEMP_C,
  OVERLOAD_PCT,
  getNominalCurrent,
} from "../_hooks/usePengukuranGardu";

// ── Styles ─────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1B2631",
    paddingHorizontal: 36,
    paddingVertical: 36,
    backgroundColor: "#fff",
  },
  // Header
  header: {
    backgroundColor: "#004D40",
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#fff", marginBottom: 2 },
  headerSub: { fontSize: 8, color: "#B2DFDB" },
  headerRight: { alignItems: "flex-end" },
  headerWoNo: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#5EEAD4" },
  headerDate: { fontSize: 7, color: "#B2DFDB", marginTop: 2 },
  // Section
  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#00695C",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E0F2F1",
    paddingBottom: 2,
  },
  section: { marginBottom: 8 },
  row2: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  fieldLabel: {
    fontSize: 6.5, color: "#5D6D7E", textTransform: "uppercase",
    letterSpacing: 0.3, marginBottom: 1,
  },
  fieldValue: { fontSize: 8.5, color: "#1B2631", marginBottom: 0 },
  fieldValueBold: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#004D40", marginBottom: 0 },
  // Info gardu compact grid
  infoGrid: { flexDirection: "row", gap: 6, marginBottom: 5 },
  infoCell: {
    flex: 1, backgroundColor: "#F8FAFC", borderRadius: 3,
    borderWidth: 1, borderColor: "#E2E8F0", paddingHorizontal: 6, paddingVertical: 5,
  },
  infoCellWide: {
    flex: 1.5, backgroundColor: "#F8FAFC", borderRadius: 3,
    borderWidth: 1, borderColor: "#E2E8F0", paddingHorizontal: 6, paddingVertical: 5,
  },
  // Status badge
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 8 },
  badge: {
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start",
  },
  badgeText: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  // Beban box
  bebanBox: {
    backgroundColor: "#F0FFF4", borderRadius: 3, borderWidth: 1,
    borderColor: "#E0F2F1", padding: 6,
  },
  bebanRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  bebanLabel: { fontSize: 8, color: "#5D6D7E" },
  bebanValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#004D40" },
  // Measurement grid
  measGrid: { flexDirection: "row", gap: 5 },
  measBox: {
    flex: 1, backgroundColor: "#F8FAFC", borderRadius: 3,
    borderWidth: 1, borderColor: "#E2E8F0", padding: 4, alignItems: "center",
  },
  measLabel: { fontSize: 6.5, color: "#5D6D7E", marginBottom: 2 },
  measValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1B2631" },
  measUnit: { fontSize: 6, color: "#94A3B8" },
  // Keterangan box
  keteranganBox: {
    backgroundColor: "#F8FAFC", borderRadius: 3,
    borderWidth: 1, borderColor: "#E2E8F0", padding: 8,
  },
  keteranganText: { fontSize: 8.5, color: "#1B2631", lineHeight: 1.4 },
  // Table (per jurusan)
  table: { borderWidth: 1, borderColor: "#E0F2F1", borderRadius: 3, overflow: "hidden" },
  tableHeader: { flexDirection: "row", backgroundColor: "#E0F2F1", paddingVertical: 3, paddingHorizontal: 6 },
  tableHeaderCell: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#00695C", flex: 1, textAlign: "center" },
  tableHeaderCellLeft: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#00695C", flex: 1.5 },
  tableHeaderCellSm: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#00695C", flex: 0.6, textAlign: "center" },
  tableRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: "#E0F2F1" },
  tableRowAlt: { backgroundColor: "#F8FAFC" },
  tableRowAlert: { backgroundColor: "#FFF5F5" },
  tableCell: { fontSize: 8, color: "#1B2631", flex: 1, textAlign: "center" },
  tableCellLeft: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#004D40", flex: 1.5 },
  tableCellAlert: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#DC2626", flex: 1, textAlign: "center" },
  // Delta cells
  deltaPos: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#16A34A", flex: 0.6, textAlign: "center" },
  deltaNeg: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#DC2626", flex: 0.6, textAlign: "center" },
  deltaNeu: { fontSize: 7.5, color: "#5D6D7E", flex: 0.6, textAlign: "center" },
  // Table footer (total row)
  tableFooter: {
    flexDirection: "row", paddingVertical: 3, paddingHorizontal: 6,
    backgroundColor: "#E0F2F1", borderTopWidth: 1, borderTopColor: "#00695C",
  },
  tableFooterCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#004D40", flex: 1, textAlign: "center" },
  tableFooterCellLeft: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#004D40", flex: 1.5 },
  // Footer
  footer: {
    position: "absolute", bottom: 24, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingTop: 6,
  },
  footerText: { fontSize: 6.5, color: "#94A3B8" },
});

// ── Helpers ───────────────────────────────────────────────────────────────

function r(v: number | null | undefined): string {
  return v != null ? Math.round(v).toString() : "—";
}

function delta(d: number): string {
  if (d === 0) return "(0)";
  return d > 0 ? `(+${d})` : `(${d})`;
}

// ── Document ─────────────────────────────────────────────────────────────

interface Props {
  data: PengukuranGardu;
  jenisPemeliharaan: string;
  keterangan: string;
}

export default function WOGarduDocument({ data, jenisPemeliharaan, keterangan }: Props) {
  const woNo = `WO-${data.no_gardu}`;
  const today = new Date().toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const isOverload = data.persen_beban >= OVERLOAD_PCT;
  const isWarn = !isOverload && data.persen_beban >= 60;
  const isHighTemp = data.suhu_trafo > HIGH_TEMP_C;
  const iNominal = getNominalCurrent(data.kva_trafo);
  const maxPhase = Math.max(data.total_arus_r, data.total_arus_s, data.total_arus_t);
  const isPhaseOverload = maxPhase >= iNominal;

  const jurusanKeys = Object.keys(data.perjurusan ?? {}).sort();

  return (
    <Document title={woNo} author="SMART Mataram" subject="WO Pemeliharaan Gardu">
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.headerTitle}>WO PEMELIHARAAN GARDU</Text>
            <Text style={S.headerSub}>PLN ULP {data.petugas_unit} · SMART Mataram</Text>
            <Text style={{ ...S.headerSub, marginTop: 4 }}>
              {data.no_gardu} — {data.penyulang ?? "—"}
            </Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.headerWoNo}>{woNo}</Text>
            <Text style={S.headerDate}>Diterbitkan: {today}</Text>
          </View>
        </View>

        {/* Status Alert Badges */}
        {(isOverload || isHighTemp || isPhaseOverload) && (
          <View style={{ ...S.section, marginBottom: 8 }}>
            <View style={S.badgeRow}>
              {isOverload && (
                <View style={{ ...S.badge, backgroundColor: "#FEE2E2" }}>
                  <Text style={{ ...S.badgeText, color: "#DC2626" }}>⚠ OVERLOAD TRAFO</Text>
                </View>
              )}
              {isPhaseOverload && (
                <View style={{ ...S.badge, backgroundColor: "#FFF7ED" }}>
                  <Text style={{ ...S.badgeText, color: "#EA580C" }}>⚠ OVERLOAD 1 FASA</Text>
                </View>
              )}
              {isHighTemp && (
                <View style={{ ...S.badge, backgroundColor: "#FFFBEB" }}>
                  <Text style={{ ...S.badgeText, color: "#D97706" }}>⚠ SUHU TINGGI</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Informasi Gardu — compact 4-col grid */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>Informasi Gardu</Text>
          {/* Row 1 */}
          <View style={S.infoGrid}>
            <View style={S.infoCell}>
              <Text style={S.fieldLabel}>No. Gardu</Text>
              <Text style={S.fieldValueBold}>{data.no_gardu}</Text>
            </View>
            <View style={S.infoCell}>
              <Text style={S.fieldLabel}>Penyulang</Text>
              <Text style={S.fieldValueBold}>{data.penyulang ?? "—"}</Text>
            </View>
            <View style={S.infoCell}>
              <Text style={S.fieldLabel}>ULP</Text>
              <Text style={S.fieldValue}>{data.petugas_unit}</Text>
            </View>
            <View style={S.infoCell}>
              <Text style={S.fieldLabel}>Kapasitas Trafo</Text>
              <Text style={S.fieldValue}>{data.kva_trafo} KVA</Text>
            </View>
          </View>
          {/* Row 2 */}
          <View style={S.infoGrid}>
            <View style={S.infoCellWide}>
              <Text style={S.fieldLabel}>Jenis Pemeliharaan</Text>
              <Text style={S.fieldValueBold}>{jenisPemeliharaan}</Text>
            </View>
            <View style={S.infoCell}>
              <Text style={S.fieldLabel}>Tgl Pengukuran</Text>
              <Text style={S.fieldValue}>{data.tanggal_pengukuran}</Text>
            </View>
            <View style={S.infoCell}>
              <Text style={S.fieldLabel}>Petugas</Text>
              <Text style={S.fieldValue}>{data.petugas_nama ?? "—"}</Text>
            </View>
            <View style={S.infoCellWide}>
              <Text style={S.fieldLabel}>Alamat</Text>
              <Text style={S.fieldValue}>{data.alamat ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* Keterangan */}
        {keterangan.trim() !== "" && (
          <View style={S.section}>
            <Text style={S.sectionLabel}>Keterangan</Text>
            <View style={S.keteranganBox}>
              <Text style={S.keteranganText}>{keterangan}</Text>
            </View>
          </View>
        )}

        {/* Status Beban */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>Status Beban Trafo</Text>
          <View style={S.bebanBox}>
            <View style={S.bebanRow}>
              <Text style={S.bebanLabel}>Beban Terpakai</Text>
              <Text style={S.bebanValue}>{r(data.beban_kva)} KVA / {data.kva_trafo} KVA</Text>
            </View>
            <View style={S.bebanRow}>
              <Text style={S.bebanLabel}>Persentase Beban</Text>
              <Text style={{
                ...S.bebanValue,
                color: isOverload ? "#DC2626" : isWarn ? "#D97706" : "#16A34A",
              }}>
                {r(data.persen_beban)}% {isOverload ? "(OVERLOAD)" : isWarn ? "(WARNING)" : "(Normal)"}
              </Text>
            </View>
            <View style={S.bebanRow}>
              <Text style={S.bebanLabel}>Arus Nominal (I-nom)</Text>
              <Text style={S.bebanValue}>{r(iNominal)} A</Text>
            </View>
          </View>
        </View>

        {/* Pengukuran Total */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>Pengukuran Total</Text>
          <View style={{ gap: 4 }}>
            {/* Arus */}
            <Text style={{ fontSize: 7, color: "#5D6D7E", marginBottom: 2 }}>Arus (Ampere)</Text>
            <View style={S.measGrid}>
              {[
                { label: "Fasa R", v: data.total_arus_r, alert: data.total_arus_r > HIGH_CURRENT_A },
                { label: "Fasa S", v: data.total_arus_s, alert: data.total_arus_s > HIGH_CURRENT_A },
                { label: "Fasa T", v: data.total_arus_t, alert: data.total_arus_t > HIGH_CURRENT_A },
                { label: "Netral N", v: data.total_arus_n, alert: false },
              ].map(({ label, v, alert }) => (
                <View key={label} style={S.measBox}>
                  <Text style={S.measLabel}>{label}</Text>
                  <Text style={{ ...S.measValue, color: alert ? "#DC2626" : "#1B2631" }}>
                    {r(v)}
                  </Text>
                  <Text style={S.measUnit}>A</Text>
                </View>
              ))}
            </View>
            {/* Tegangan */}
            <Text style={{ fontSize: 7, color: "#5D6D7E", marginBottom: 2, marginTop: 2 }}>Tegangan Fase-Netral (Volt)</Text>
            <View style={S.measGrid}>
              {[
                { label: "V R-N", v: data.total_teg_rn },
                { label: "V S-N", v: data.total_teg_sn },
                { label: "V T-N", v: data.total_teg_tn },
              ].map(({ label, v }) => (
                <View key={label} style={S.measBox}>
                  <Text style={S.measLabel}>{label}</Text>
                  <Text style={S.measValue}>{r(v)}</Text>
                  <Text style={S.measUnit}>V</Text>
                </View>
              ))}
            </View>
            {/* Suhu */}
            <View style={{
              ...S.measBox,
              flexDirection: "row", justifyContent: "space-between", alignItems: "center",
              backgroundColor: isHighTemp ? "#FFFBEB" : "#F8FAFC",
              borderColor: isHighTemp ? "#FCD34D" : "#E2E8F0",
              marginTop: 2, paddingHorizontal: 10,
            }}>
              <Text style={{ fontSize: 8, color: isHighTemp ? "#D97706" : "#5D6D7E" }}>
                Suhu Trafo {isHighTemp ? "(TINGGI)" : ""}
              </Text>
              <Text style={{
                fontSize: 11, fontFamily: "Helvetica-Bold",
                color: isHighTemp ? "#D97706" : "#1B2631",
              }}>
                {data.suhu_trafo}°C
              </Text>
            </View>
          </View>
        </View>

        {/* Per Jurusan */}
        {jurusanKeys.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionLabel}>Pengukuran Per Jurusan</Text>
            <View style={S.table}>
              <View style={S.tableHeader}>
                <Text style={S.tableHeaderCellLeft}>Jurusan</Text>
                <Text style={S.tableHeaderCell}>R (A)</Text>
                <Text style={S.tableHeaderCellSm}>Δ R</Text>
                <Text style={S.tableHeaderCell}>S (A)</Text>
                <Text style={S.tableHeaderCellSm}>Δ S</Text>
                <Text style={S.tableHeaderCell}>T (A)</Text>
                <Text style={S.tableHeaderCellSm}>Δ T</Text>
                <Text style={S.tableHeaderCell}>N (A)</Text>
              </View>
              {jurusanKeys.map((key, i) => {
                const j = data.perjurusan[key];
                const arus = j?.arus ?? { R: 0, S: 0, T: 0, N: 0 };
                const highR = arus.R > HIGH_CURRENT_A;
                const highS = arus.S > HIGH_CURRENT_A;
                const highT = arus.T > HIGH_CURRENT_A;
                const anyHigh = highR || highS || highT;

                const avg_j = (arus.R + arus.S + arus.T) / 3;
                const dR = Math.round(avg_j - arus.R);
                const dS = Math.round(avg_j - arus.S);
                const dT = Math.round(avg_j - arus.T);

                return (
                  <View key={key} style={[
                    S.tableRow,
                    i % 2 !== 0 ? S.tableRowAlt : {},
                    anyHigh ? S.tableRowAlert : {},
                  ]}>
                    <Text style={S.tableCellLeft}>{key}</Text>
                    <Text style={highR ? S.tableCellAlert : S.tableCell}>{r(arus.R)}</Text>
                    <Text style={dR > 0 ? S.deltaPos : dR < 0 ? S.deltaNeg : S.deltaNeu}>{delta(dR)}</Text>
                    <Text style={highS ? S.tableCellAlert : S.tableCell}>{r(arus.S)}</Text>
                    <Text style={dS > 0 ? S.deltaPos : dS < 0 ? S.deltaNeg : S.deltaNeu}>{delta(dS)}</Text>
                    <Text style={highT ? S.tableCellAlert : S.tableCell}>{r(arus.T)}</Text>
                    <Text style={dT > 0 ? S.deltaPos : dT < 0 ? S.deltaNeg : S.deltaNeu}>{delta(dT)}</Text>
                    <Text style={S.tableCell}>{r(arus.N)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Asumsi Pemerataan */}
        {jurusanKeys.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionLabel}>Asumsi Pemerataan Beban</Text>
            <View style={S.table}>
              <View style={S.tableHeader}>
                <Text style={S.tableHeaderCellLeft}>Jurusan</Text>
                <Text style={S.tableHeaderCell}>R (A)</Text>
                <Text style={S.tableHeaderCell}>S (A)</Text>
                <Text style={S.tableHeaderCell}>T (A)</Text>
                <Text style={S.tableHeaderCell}>Total (A)</Text>
              </View>
              {jurusanKeys.map((key, i) => {
                const j = data.perjurusan[key];
                const arus = j?.arus ?? { R: 0, S: 0, T: 0, N: 0 };
                const avg_j = Math.round((arus.R + arus.S + arus.T) / 3);
                return (
                  <View key={key} style={[S.tableRow, i % 2 !== 0 ? S.tableRowAlt : {}]}>
                    <Text style={S.tableCellLeft}>{key}</Text>
                    <Text style={S.tableCell}>{avg_j}</Text>
                    <Text style={S.tableCell}>{avg_j}</Text>
                    <Text style={S.tableCell}>{avg_j}</Text>
                    <Text style={S.tableCell}>{avg_j * 3}</Text>
                  </View>
                );
              })}
              {/* Total row */}
              {(() => {
                const totalBalanced = jurusanKeys.reduce((sum, key) => {
                  const j = data.perjurusan[key];
                  const arus = j?.arus ?? { R: 0, S: 0, T: 0, N: 0 };
                  return sum + Math.round((arus.R + arus.S + arus.T) / 3) * 3;
                }, 0);
                const totalPerPhase = Math.round(totalBalanced / 3);
                return (
                  <View style={S.tableFooter}>
                    <Text style={S.tableFooterCellLeft}>TOTAL</Text>
                    <Text style={S.tableFooterCell}>{totalPerPhase}</Text>
                    <Text style={S.tableFooterCell}>{totalPerPhase}</Text>
                    <Text style={S.tableFooterCell}>{totalPerPhase}</Text>
                    <Text style={S.tableFooterCell}>{totalBalanced}</Text>
                  </View>
                );
              })()}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>SMART Mataram — WO Pemeliharaan Gardu</Text>
          <Text style={S.footerText}>{woNo}</Text>
        </View>

      </Page>
    </Document>
  );
}
