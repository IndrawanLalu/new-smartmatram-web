import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { MorningBriefData } from "../_hooks/useMorningBrief";

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1B2631", paddingHorizontal: 28, paddingVertical: 24, backgroundColor: "#fff" },

  // Header
  header: { backgroundColor: "#004D40", borderRadius: 6, padding: 14, marginBottom: 10 },
  headerTitle: { color: "#fff", fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  headerSub: { color: "#B2DFDB", fontSize: 9 },
  headerUnit: { color: "#80CBC4", fontSize: 8, marginTop: 2 },

  // Section
  section: { marginBottom: 10, border: "1 solid #E2E8F0", borderRadius: 5, overflow: "hidden" },
  sectionHeader: { backgroundColor: "#E0F2F1", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6 },
  sectionTitle: { color: "#00695C", fontSize: 9, fontFamily: "Helvetica-Bold" },
  sectionBody: { padding: 10 },

  // Badge row (bulan ini vs kemarin)
  badgeRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  badgeBulan: { backgroundColor: "#E0F2F1", color: "#00695C", fontSize: 7, fontFamily: "Helvetica-Bold", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  badgeKemarin: { backgroundColor: "#FEF9C3", color: "#92400E", fontSize: 7, fontFamily: "Helvetica-Bold", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  badgeRed: { backgroundColor: "#FEE2E2", color: "#991B1B", fontSize: 7, fontFamily: "Helvetica-Bold", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },

  // Stats grid
  statsGrid: { flexDirection: "row", gap: 6, marginBottom: 8 },
  statBox: { flex: 1, borderRadius: 4, padding: 6, alignItems: "center" },
  statNum: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  statLabel: { fontSize: 7, marginTop: 1, textAlign: "center" },
  statGreen: { backgroundColor: "#D1FAE5", color: "#065F46" },
  statRed: { backgroundColor: "#FEE2E2", color: "#991B1B" },
  statOrange: { backgroundColor: "#FEF3C7", color: "#92400E" },
  statBlue: { backgroundColor: "#DBEAFE", color: "#1E40AF" },
  statPurple: { backgroundColor: "#EDE9FE", color: "#5B21B6" },
  statTeal: { backgroundColor: "#CCFBF1", color: "#065F46" },

  // Table
  table: { width: "100%" },
  tableHead: { flexDirection: "row", borderBottom: "1 solid #E2E8F0", paddingBottom: 3, marginBottom: 2 },
  tableRow: { flexDirection: "row", borderBottom: "1 solid #F1F5F9", paddingVertical: 3 },
  th: { color: "#5D6D7E", fontSize: 7, fontFamily: "Helvetica-Bold" },
  td: { color: "#1B2631", fontSize: 8 },
  tdGray: { color: "#5D6D7E", fontSize: 7 },

  // Misc
  emptyText: { color: "#5D6D7E", fontSize: 8, textAlign: "center", paddingVertical: 8 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between" },
  footerText: { color: "#94A3B8", fontSize: 7 },
  sectionLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#5D6D7E", marginBottom: 4, textTransform: "uppercase" },
  urgentBox: { backgroundColor: "#FEF2F2", border: "1 solid #FECACA", borderRadius: 3, padding: 5, marginBottom: 3 },
  urgentText: { color: "#991B1B", fontSize: 8 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, sub, bulan, bulanLabel, kemarin }: {
  title: string; sub?: string; bulan?: number; bulanLabel?: string; kemarin?: number;
}) {
  return (
    <View style={S.sectionHeader}>
      <View>
        <Text style={S.sectionTitle}>{title}</Text>
        {sub && <Text style={{ fontSize: 7, color: "#00897B" }}>{sub}</Text>}
      </View>
      <View style={S.badgeRow}>
        {bulan !== undefined && bulanLabel && (
          <Text style={S.badgeBulan}>{bulanLabel}: {bulan}</Text>
        )}
        {kemarin !== undefined && (
          <Text style={S.badgeKemarin}>Kemarin: {kemarin}</Text>
        )}
      </View>
    </View>
  );
}

// ── Document ──────────────────────────────────────────────────────────────────

interface Props {
  data: MorningBriefData;
  unitLabel: string;
}

export default function MorningBriefDocument({ data, unitLabel }: Props) {
  const MAX_ROWS = 12; // max rows per table to keep PDF reasonable

  return (
    <Document title={`Morning Brief ${data.yesterdayLabel}`} author="SMART Mataram">
      <Page size="A4" style={S.page}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <View style={S.header}>
          <Text style={S.headerTitle}>Morning Brief</Text>
          <Text style={S.headerSub}>Rangkuman kejadian {data.yesterdayLabel}</Text>
          <Text style={S.headerUnit}>{unitLabel}</Text>
        </View>

        {/* ── Realisasi Probis ─────────────────────────────────────────────── */}
        {data.realisasiProbis.totalWO > 0 && (
          <View style={S.section}>
            <SectionHeader
              title="Realisasi Probis"
              sub="Realisasi harian per tim pelaksana"
              bulan={data.realisasiProbis.totalWO}
              bulanLabel="WO"
              kemarin={data.realisasiProbis.totalRealisasi}
            />
            <View style={S.sectionBody}>
              <View style={S.table}>
                <View style={S.tableHead}>
                  <Text style={[S.th, { flex: 3 }]}>Tim Pelaksana</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center" }]}>WO</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center" }]}>Realisasi</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center" }]}>%</Text>
                </View>
                {data.realisasiProbis.items.map((row) => {
                  const pct = row.wo > 0 ? Math.round((row.realisasi / row.wo) * 100) : 0;
                  const color = row.wo === 0 ? "#94A3B8" : row.realisasi >= row.wo ? "#065F46" : row.realisasi > 0 ? "#92400E" : "#991B1B";
                  return (
                    <View key={row.tim} style={S.tableRow}>
                      <Text style={[S.td, { flex: 3 }]}>{row.tim}</Text>
                      <Text style={[S.tdGray, { flex: 1, textAlign: "center" }]}>{row.wo || "—"}</Text>
                      <Text style={[S.td, { flex: 1, textAlign: "center", color }]}>{row.wo > 0 ? row.realisasi : "—"}</Text>
                      <Text style={[S.td, { flex: 1, textAlign: "center", color }]}>{row.wo > 0 ? `${pct}%` : "—"}</Text>
                    </View>
                  );
                })}
                <View style={[S.tableRow, { backgroundColor: "#E0F2F1", borderTop: "1 solid #B2DFDB" }]}>
                  <Text style={[S.th, { flex: 3, color: "#00695C" }]}>TOTAL</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center", color: "#5D6D7E" }]}>{data.realisasiProbis.totalWO}</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center", color: "#00695C" }]}>{data.realisasiProbis.totalRealisasi}</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center", color: "#00695C" }]}>
                    {Math.round((data.realisasiProbis.totalRealisasi / data.realisasiProbis.totalWO) * 100)}%
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Gangguan Penyulang ────────────────────────────────────────────── */}
        <View style={S.section}>
          <SectionHeader
            title="Gangguan Penyulang"
            sub="Data dari SIAGA"
            bulan={data.gangguan.totalBulanIni}
            bulanLabel={data.monthLabel}
            kemarin={data.gangguan.total}
          />
          <View style={S.sectionBody}>
            {data.gangguan.items.length === 0 ? (
              <Text style={S.emptyText}>Tidak ada gangguan kemarin ✓</Text>
            ) : (
              <View style={S.table}>
                <View style={S.tableHead}>
                  <Text style={[S.th, { flex: 2 }]}>Penyulang</Text>
                  <Text style={[S.th, { flex: 1 }]}>Jam Padam</Text>
                  <Text style={[S.th, { flex: 1 }]}>Durasi</Text>
                  <Text style={[S.th, { flex: 2 }]}>Penyebab</Text>
                </View>
                {data.gangguan.items.slice(0, MAX_ROWS).map((item, i) => (
                  <View key={i} style={S.tableRow}>
                    <Text style={[S.td, { flex: 2 }]}>{item.penyulang}</Text>
                    <Text style={[S.td, { flex: 1 }]}>{item.jamPadam}</Text>
                    <Text style={[S.td, { flex: 1 }]}>{item.durasi}</Text>
                    <Text style={[S.tdGray, { flex: 2 }]}>{item.penyebab}</Text>
                  </View>
                ))}
                {data.gangguan.items.length > MAX_ROWS && (
                  <Text style={[S.emptyText, { paddingVertical: 4 }]}>
                    +{data.gangguan.items.length - MAX_ROWS} lainnya...
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── Pengukuran Gardu ──────────────────────────────────────────────── */}
        <View style={S.section}>
          <SectionHeader
            title="Pengukuran Gardu"
            sub="Beban & kondisi gardu"
            bulan={data.pengukuran.totalBulanIni}
            bulanLabel={data.monthLabel}
            kemarin={data.pengukuran.total}
          />
          <View style={S.sectionBody}>
            {data.pengukuran.total === 0 ? (
              <Text style={S.emptyText}>Tidak ada data pengukuran kemarin</Text>
            ) : (
              <>
                {/* Stats */}
                <View style={S.statsGrid}>
                  <View style={[S.statBox, data.pengukuran.overload.length > 0 ? S.statRed : S.statGreen]}>
                    <Text style={S.statNum}>{data.pengukuran.overload.length}</Text>
                    <Text style={S.statLabel}>Overload ≥80%</Text>
                  </View>
                  <View style={[S.statBox, data.pengukuran.highTemp.length > 0 ? S.statOrange : S.statGreen]}>
                    <Text style={S.statNum}>{data.pengukuran.highTemp.length}</Text>
                    <Text style={S.statLabel}>Suhu {">"}60°C</Text>
                  </View>
                  <View style={[S.statBox, S.statBlue]}>
                    <Text style={S.statNum}>{data.pengukuran.woDone.length}</Text>
                    <Text style={S.statLabel}>WO Dikirim</Text>
                  </View>
                  <View style={[S.statBox, S.statPurple]}>
                    <Text style={S.statNum}>{data.pengukuran.amgDone.length}</Text>
                    <Text style={S.statLabel}>AMG di-Input</Text>
                  </View>
                </View>

                {/* Rekap Petugas */}
                {data.pengukuran.petugasRekap.length > 0 && (
                  <>
                    <Text style={S.sectionLabel}>Rekap Petugas</Text>
                    <View style={S.table}>
                      <View style={S.tableHead}>
                        <Text style={[S.th, { flex: 3 }]}>Petugas</Text>
                        <Text style={[S.th, { flex: 1, textAlign: "center" }]}>{data.monthLabel}</Text>
                        <Text style={[S.th, { flex: 1, textAlign: "center" }]}>Kemarin</Text>
                      </View>
                      {data.pengukuran.petugasRekap.slice(0, 10).map((p) => (
                        <View key={p.nama} style={S.tableRow}>
                          <Text style={[S.td, { flex: 3 }]}>{p.nama}</Text>
                          <Text style={[S.td, { flex: 1, textAlign: "center" }]}>{p.jumlahBulanIni}</Text>
                          <Text style={[S.tdGray, { flex: 1, textAlign: "center" }]}>{p.jumlah || "—"}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* Overload list */}
                {data.pengukuran.overload.length > 0 && (
                  <>
                    <Text style={[S.sectionLabel, { marginTop: 6 }]}>Gardu Overload</Text>
                    <View style={S.table}>
                      <View style={S.tableHead}>
                        <Text style={[S.th, { flex: 2 }]}>Gardu</Text>
                        <Text style={[S.th, { flex: 2 }]}>Penyulang</Text>
                        <Text style={[S.th, { flex: 1, textAlign: "right" }]}>Beban</Text>
                        <Text style={[S.th, { flex: 1, textAlign: "right" }]}>kVA</Text>
                      </View>
                      {data.pengukuran.overload.slice(0, 8).map((r) => (
                        <View key={r.id} style={S.tableRow}>
                          <Text style={[S.td, { flex: 2 }]}>{r.no_gardu}</Text>
                          <Text style={[S.tdGray, { flex: 2 }]}>{r.penyulang ?? "-"}</Text>
                          <Text style={[S.td, { flex: 1, textAlign: "right", color: "#991B1B" }]}>{r.persen_beban.toFixed(1)}%</Text>
                          <Text style={[S.tdGray, { flex: 1, textAlign: "right" }]}>{r.kva_trafo}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>

        {/* ── Rekapitulasi Pekerjaan ────────────────────────────────────────── */}
        <View style={S.section}>
          <SectionHeader
            title="Rekapitulasi Pekerjaan"
            sub="Eksekusi inspeksi jaringan & pohon"
            bulan={data.eksekusi.totalJaringanBulanIni + data.eksekusi.totalPohonBulanIni}
            bulanLabel={data.monthLabel}
            kemarin={data.eksekusi.totalJaringan + data.eksekusi.totalPohon}
          />
          <View style={S.sectionBody}>
            {data.eksekusi.byEksekutor.length === 0 ? (
              <Text style={S.emptyText}>Tidak ada pekerjaan diselesaikan kemarin</Text>
            ) : (
              <View style={S.table}>
                <View style={S.tableHead}>
                  <Text style={[S.th, { flex: 2 }]}>Tim Eksekutor</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center" }]}>Jar. {data.monthLabel}</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center" }]}>Pohon {data.monthLabel}</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center" }]}>Jar. Kmrn</Text>
                  <Text style={[S.th, { flex: 1, textAlign: "center" }]}>Pohon Kmrn</Text>
                </View>
                {data.eksekusi.byEksekutor.map((row) => (
                  <View key={row.eksekutor} style={S.tableRow}>
                    <Text style={[S.td, { flex: 2 }]}>{row.eksekutor}</Text>
                    <Text style={[S.td, { flex: 1, textAlign: "center" }]}>{row.jaringanBulanIni || "—"}</Text>
                    <Text style={[S.td, { flex: 1, textAlign: "center" }]}>{row.pohonBulanIni || "—"}</Text>
                    <Text style={[S.tdGray, { flex: 1, textAlign: "center" }]}>{row.jaringan || "—"}</Text>
                    <Text style={[S.tdGray, { flex: 1, textAlign: "center" }]}>{row.pohon || "—"}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Inspeksi Jaringan ─────────────────────────────────────────────── */}
        <View style={S.section}>
          <SectionHeader
            title="Inspeksi Jaringan"
            bulan={data.inspeksiJaringan.newTemuanBulanIni}
            bulanLabel={`Temuan ${data.monthLabel}`}
            kemarin={data.inspeksiJaringan.newTemuan.length + data.inspeksiJaringan.selesai.length}
          />
          <View style={S.sectionBody}>
            {data.inspeksiJaringan.newTemuan.length + data.inspeksiJaringan.selesai.length === 0 ? (
              <Text style={S.emptyText}>Tidak ada aktivitas kemarin</Text>
            ) : (
              <View style={S.table}>
                <View style={S.tableHead}>
                  <Text style={[S.th, { flex: 1.5 }]}>Penyulang</Text>
                  <Text style={[S.th, { flex: 2 }]}>Lokasi</Text>
                  <Text style={[S.th, { flex: 2 }]}>Temuan</Text>
                  <Text style={[S.th, { flex: 1 }]}>Status</Text>
                </View>
                {[...data.inspeksiJaringan.newTemuan, ...data.inspeksiJaringan.selesai].slice(0, MAX_ROWS).map((r) => (
                  <View key={r.id} style={S.tableRow}>
                    <Text style={[S.td, { flex: 1.5 }]}>{r.penyulang ?? "-"}</Text>
                    <Text style={[S.tdGray, { flex: 2 }]}>{r.lokasi ?? "-"}</Text>
                    <Text style={[S.tdGray, { flex: 2 }]}>{r.temuan ?? r.deskripsi ?? "-"}</Text>
                    <Text style={[S.td, { flex: 1 }]}>{r.status}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Inspeksi Pohon ────────────────────────────────────────────────── */}
        <View style={S.section}>
          <SectionHeader
            title="Inspeksi Pohon / Rabas"
            bulan={data.inspeksiPohon.newTemuanBulanIni}
            bulanLabel={`Temuan ${data.monthLabel}`}
            kemarin={data.inspeksiPohon.newTemuan.length + data.inspeksiPohon.selesai.length}
          />
          <View style={S.sectionBody}>
            {/* Urgent */}
            {data.inspeksiPohon.sanggatUrgent.length > 0 && (
              <>
                <Text style={[S.sectionLabel, { color: "#991B1B" }]}>
                  Sangat Urgent — {data.inspeksiPohon.sanggatUrgent.length} pohon perlu tindakan hari ini
                </Text>
                {data.inspeksiPohon.sanggatUrgent.slice(0, 5).map((r) => (
                  <View key={r.id} style={S.urgentBox}>
                    <Text style={S.urgentText}>⚠ {r.penyulang ?? "-"} — {r.lokasi ?? "Lokasi tidak diketahui"}</Text>
                    <Text style={[S.urgentText, { color: "#B91C1C", fontSize: 7 }]}>
                      {r.jenis_pohon ?? "Pohon"} · {r.ulp ?? "-"} · {r.status}
                    </Text>
                  </View>
                ))}
              </>
            )}
            {data.inspeksiPohon.newTemuan.length + data.inspeksiPohon.selesai.length === 0 && data.inspeksiPohon.sanggatUrgent.length === 0 ? (
              <Text style={S.emptyText}>Tidak ada aktivitas kemarin</Text>
            ) : data.inspeksiPohon.newTemuan.length + data.inspeksiPohon.selesai.length > 0 && (
              <View style={S.table}>
                <View style={S.tableHead}>
                  <Text style={[S.th, { flex: 1.5 }]}>Penyulang</Text>
                  <Text style={[S.th, { flex: 2 }]}>Lokasi</Text>
                  <Text style={[S.th, { flex: 1.5 }]}>Jenis Pohon</Text>
                  <Text style={[S.th, { flex: 1 }]}>Status</Text>
                </View>
                {[...data.inspeksiPohon.newTemuan, ...data.inspeksiPohon.selesai].slice(0, MAX_ROWS).map((r) => (
                  <View key={r.id} style={S.tableRow}>
                    <Text style={[S.td, { flex: 1.5 }]}>{r.penyulang ?? "-"}</Text>
                    <Text style={[S.tdGray, { flex: 2 }]}>{r.lokasi ?? "-"}</Text>
                    <Text style={[S.tdGray, { flex: 1.5 }]}>{r.jenis_pohon ?? "-"}</Text>
                    <Text style={[S.td, { flex: 1 }]}>{r.status}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>SMART Mataram · PLN UP3 Mataram</Text>
          <Text style={S.footerText}>{data.yesterdayLabel}</Text>
        </View>

      </Page>
    </Document>
  );
}
