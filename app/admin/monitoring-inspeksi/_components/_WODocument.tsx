// WO Document — hanya di-import secara dynamic (client-side only)
// @react-pdf/renderer tidak support SSR

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";
import type { InspeksiJaringan } from "../_hooks/useInspeksiJaringan";
import type { InspeksiPohon } from "../_hooks/useInspeksiPohon";

// ── Styles ──────────────────────────────────────────────────────────────────

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
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 8,
    color: "#B2DFDB",
  },
  headerRight: {
    alignItems: "flex-end",
  },
  headerWoNo: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#5EEAD4",
  },
  headerDate: {
    fontSize: 7,
    color: "#B2DFDB",
    marginTop: 2,
  },
  // Section
  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#00695C",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#E0F2F1",
    paddingBottom: 3,
  },
  section: {
    marginBottom: 12,
  },
  // Grid 2 columns
  row2: {
    flexDirection: "row",
    gap: 12,
  },
  col: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 6.5,
    color: "#5D6D7E",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: 8.5,
    color: "#1B2631",
    marginBottom: 7,
  },
  fieldValueBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#004D40",
    marginBottom: 7,
  },
  // Lokasi
  lokasiBox: {
    backgroundColor: "#F0FFF4",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#E0F2F1",
    padding: 8,
  },
  lokasiRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  lokasiKey: {
    fontSize: 7,
    color: "#5D6D7E",
    width: 60,
  },
  lokasiVal: {
    fontSize: 8,
    color: "#1B2631",
    flex: 1,
  },
  mapsLink: {
    fontSize: 8,
    color: "#00897B",
    textDecoration: "underline",
  },
  // Foto
  fotoRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-start",
  },
  fotoItem: {
    flex: 1,
    alignItems: "center",
  },
  fotoImg: {
    width: "100%",
    height: 100,
    objectFit: "cover",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#E0F2F1",
    marginBottom: 4,
  },
  fotoPlaceholder: {
    width: "100%",
    height: 100,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#E0F2F1",
    borderStyle: "dashed",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  fotoPlaceholderText: {
    fontSize: 7,
    color: "#94A3B8",
  },
  fotoLabel: {
    fontSize: 7,
    color: "#5D6D7E",
    textAlign: "center",
    marginBottom: 2,
  },
  fotoLink: {
    fontSize: 6.5,
    color: "#00897B",
    textAlign: "center",
    textDecoration: "underline",
  },
  // Teks content
  contentBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 8,
  },
  contentText: {
    fontSize: 8.5,
    color: "#1B2631",
    lineHeight: 1.4,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 6.5,
    color: "#94A3B8",
  },
  // Status badge
  statusBadge: {
    display: "flex",
    backgroundColor: "#E0F2F1",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 7.5,
    color: "#00695C",
    fontFamily: "Helvetica-Bold",
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function isSupabaseUrl(url: string): boolean {
  return url.includes("supabase.co") || url.includes("supabase.in");
}

function FotoBlock({
  url,
  label,
}: {
  url: string | null;
  label: string;
}) {
  if (!url) {
    return (
      <View style={S.fotoItem}>
        <View style={S.fotoPlaceholder}>
          <Text style={S.fotoPlaceholderText}>Belum ada</Text>
        </View>
        <Text style={S.fotoLabel}>{label}</Text>
      </View>
    );
  }

  if (isSupabaseUrl(url)) {
    return (
      <View style={S.fotoItem}>
        <Image src={url} style={S.fotoImg} />
        <Text style={S.fotoLabel}>{label}</Text>
      </View>
    );
  }

  // Firebase / URL lain — tampilkan placeholder + link
  return (
    <View style={S.fotoItem}>
      <View style={S.fotoPlaceholder}>
        <Text style={S.fotoPlaceholderText}>Lihat link</Text>
      </View>
      <Text style={S.fotoLabel}>{label}</Text>
      <Link src={url} style={S.fotoLink}>
        Buka foto
      </Link>
    </View>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface WODocumentProps {
  type: "jaringan" | "pohon";
  data: InspeksiJaringan | InspeksiPohon;
}

// Type guards
function isPohon(data: InspeksiJaringan | InspeksiPohon): data is InspeksiPohon {
  return "jenis_pohon" in data;
}

// ── Document ─────────────────────────────────────────────────────────────────

export default function WODocument({ type, data }: WODocumentProps) {
  const woNo = `WO-${data.id.slice(0, 8).toUpperCase()}`;
  const today = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const koordinatUrl = data.koordinat
    ? `https://www.google.com/maps?q=${data.koordinat}`
    : null;

  const judulWO = isPohon(data)
    ? `Inspeksi Pohon — ${data.jenis_pohon ?? "Pohon"}`
    : `Inspeksi Jaringan — ${(data as InspeksiJaringan).temuan ?? data.deskripsi ?? "—"}`;

  return (
    <Document
      title={woNo}
      author="SMART Mataram"
      subject="Work Order Inspeksi"
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <View>
            <Text style={S.headerTitle}>WORK ORDER INSPEKSI</Text>
            <Text style={S.headerSub}>
              PLN ULP {data.ulp ?? "Mataram"} · SMART Mataram
            </Text>
            <Text style={{ ...S.headerSub, marginTop: 4 }}>{judulWO}</Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.headerWoNo}>{woNo}</Text>
            <Text style={S.headerDate}>Diterbitkan: {today}</Text>
          </View>
        </View>

        {/* ── Info Umum ── */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>Informasi Umum</Text>
          <View style={S.row2}>
            <View style={S.col}>
              <Text style={S.fieldLabel}>Penyulang</Text>
              <Text style={S.fieldValueBold}>{data.penyulang ?? "—"}</Text>

              <Text style={S.fieldLabel}>ULP</Text>
              <Text style={S.fieldValue}>{data.ulp ?? "—"}</Text>

              <Text style={S.fieldLabel}>Tgl Inspeksi</Text>
              <Text style={S.fieldValue}>{data.tgl_inspeksi ?? "—"}</Text>

              {data.tgl_eksekusi && (
                <>
                  <Text style={S.fieldLabel}>Tgl Eksekusi</Text>
                  <Text style={S.fieldValue}>{data.tgl_eksekusi}</Text>
                </>
              )}
            </View>
            <View style={S.col}>
              <Text style={S.fieldLabel}>Status</Text>
              <View style={S.statusBadge}>
                <Text style={S.statusText}>{data.status}</Text>
              </View>
              <View style={{ marginBottom: 7 }} />

              {isPohon(data) ? (
                <>
                  <Text style={S.fieldLabel}>Jenis Pohon</Text>
                  <Text style={S.fieldValueBold}>{data.jenis_pohon ?? "—"}</Text>

                  <Text style={S.fieldLabel}>Tingkat Risiko</Text>
                  <Text style={S.fieldValue}>{data.tingkat_risiko ?? "—"}</Text>

                  {data.tinggi_pohon != null && (
                    <>
                      <Text style={S.fieldLabel}>Tinggi Pohon</Text>
                      <Text style={S.fieldValue}>{data.tinggi_pohon} m</Text>
                    </>
                  )}
                  {data.jarak_ke_jaringan != null && (
                    <>
                      <Text style={S.fieldLabel}>Jarak ke Jaringan</Text>
                      <Text style={S.fieldValue}>{data.jarak_ke_jaringan} m</Text>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Text style={S.fieldLabel}>Kategori</Text>
                  <Text style={S.fieldValue}>
                    {(data as InspeksiJaringan).category ?? "—"}
                  </Text>

                  <Text style={S.fieldLabel}>Inspektor</Text>
                  <Text style={S.fieldValue}>
                    {(data as InspeksiJaringan).nama_inspektor ??
                      (data as InspeksiJaringan).inspektor ??
                      "—"}
                  </Text>

                  <Text style={S.fieldLabel}>Eksekutor / Tim</Text>
                  <Text style={S.fieldValue}>
                    {(data as InspeksiJaringan).eksekutor ?? data.team_name ?? "—"}
                  </Text>
                </>
              )}
            </View>
          </View>

          {isPohon(data) && (
            <View style={S.row2}>
              <View style={S.col}>
                <Text style={S.fieldLabel}>Inspektor</Text>
                <Text style={S.fieldValue}>{data.inspektor ?? "—"}</Text>
              </View>
              <View style={S.col}>
                <Text style={S.fieldLabel}>Tim Eksekutor</Text>
                <Text style={S.fieldValue}>{data.team_name ?? "—"}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Lokasi ── */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>Lokasi & Koordinat</Text>
          <View style={S.lokasiBox}>
            <View style={S.lokasiRow}>
              <Text style={S.lokasiKey}>Alamat</Text>
              <Text style={S.lokasiVal}>{data.lokasi ?? "—"}</Text>
            </View>
            {data.koordinat && (
              <View style={S.lokasiRow}>
                <Text style={S.lokasiKey}>Koordinat</Text>
                <Text style={S.lokasiVal}>{data.koordinat}</Text>
              </View>
            )}
            {koordinatUrl && (
              <View style={S.lokasiRow}>
                <Text style={S.lokasiKey}>Google Maps</Text>
                <Link src={koordinatUrl} style={S.mapsLink}>
                  {koordinatUrl}
                </Link>
              </View>
            )}
          </View>
        </View>

        {/* ── FOTO (prominent) ── */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>Dokumentasi Foto</Text>
          <View style={S.fotoRow}>
            <FotoBlock url={data.foto_sebelum_url} label="Sebelum" />
            <FotoBlock url={data.foto_lokasi_url} label="Lokasi" />
            <FotoBlock url={data.foto_sesudah_url} label="Sesudah" />
          </View>
        </View>

        {/* ── Temuan / Keterangan ── */}
        {isPohon(data) ? (
          <>
            {data.prediksi_inspektur && (
              <View style={S.section}>
                <Text style={S.sectionLabel}>Prediksi Inspektur</Text>
                <View style={S.contentBox}>
                  <Text style={S.contentText}>{data.prediksi_inspektur}</Text>
                </View>
              </View>
            )}
            {data.tindakan_rekomendasi && (
              <View style={S.section}>
                <Text style={S.sectionLabel}>Tindakan / Rekomendasi</Text>
                <View style={S.contentBox}>
                  <Text style={S.contentText}>{data.tindakan_rekomendasi}</Text>
                </View>
              </View>
            )}
            {data.keterangan && (
              <View style={S.section}>
                <Text style={S.sectionLabel}>Keterangan</Text>
                <View style={S.contentBox}>
                  <Text style={S.contentText}>{data.keterangan}</Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {(data as InspeksiJaringan).temuan && (
              <View style={S.section}>
                <Text style={S.sectionLabel}>Temuan</Text>
                <View style={S.contentBox}>
                  <Text style={S.contentText}>
                    {(data as InspeksiJaringan).temuan}
                  </Text>
                </View>
              </View>
            )}
            {(data as InspeksiJaringan).deskripsi && (
              <View style={S.section}>
                <Text style={S.sectionLabel}>Deskripsi</Text>
                <View style={S.contentBox}>
                  <Text style={S.contentText}>
                    {(data as InspeksiJaringan).deskripsi}
                  </Text>
                </View>
              </View>
            )}
            {(data as InspeksiJaringan).keterangan && (
              <View style={S.section}>
                <Text style={S.sectionLabel}>Keterangan</Text>
                <View style={S.contentBox}>
                  <Text style={S.contentText}>
                    {(data as InspeksiJaringan).keterangan}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>SMART Mataram — Work Order Inspeksi</Text>
          <Text style={S.footerText}>{woNo}</Text>
        </View>
      </Page>
    </Document>
  );
}
